import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { writeAuditLogInTransaction } from "@/lib/audit";
import { addDays } from "@/lib/calendar-period";
import {
  allocateExtensionFeeShares,
  extensionDecisionStatus,
  type ExtensionDecisionAction,
} from "@/lib/extension-lifecycle";
import { prisma } from "@/lib/prisma";
import { writeLedgerEntry } from "./ledger.service";

export class ExtensionConflictError extends Error {
  constructor(message = "展期状态已变化，请刷新后重试") {
    super(message);
    this.name = "ExtensionConflictError";
  }
}

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export async function applyExtension(params: {
  applicationId: string;
  extensionDays: number;
  applyReason?: string;
  operatorId: string;
}) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const app = await tx.loanApplication.findUnique({
          where: { id: params.applicationId },
          include: { product: true },
        });
        if (!app) throw new Error("借款申请不存在");
        if (app.status !== "DISBURSED") throw new Error("仅已放款的申请可申请展期");
        if (!app.product.allowExtension) throw new Error("该产品不允许展期");

        const existingExtensions = await tx.extension.findMany({
          where: {
            applicationId: params.applicationId,
            status: { in: ["APPROVED", "PENDING"] },
          },
          select: { status: true },
        });
        if (existingExtensions.some((extension) => extension.status === "PENDING")) {
          throw new ExtensionConflictError("该借款已有待审批的展期申请");
        }
        const approvedCount = existingExtensions.length;
        if (approvedCount >= app.product.maxExtensionTimes) {
          throw new Error(`已达最大展期次数 (${app.product.maxExtensionTimes})`);
        }

        const activePlans = await tx.repaymentPlan.findMany({
          where: { applicationId: params.applicationId, status: "ACTIVE" },
          include: {
            scheduleItems: { orderBy: { dueDate: "desc" }, take: 1 },
          },
          orderBy: { createdAt: "desc" },
          take: 2,
        });
        if (activePlans.length !== 1 || activePlans[0].scheduleItems.length === 0) {
          throw new ExtensionConflictError("借款必须且只能有一份活跃还款计划");
        }

        const activePlan = activePlans[0];
        const currentDueDate = activePlan.scheduleItems[0].dueDate;
        const newDueDate = addDays(currentDueDate, params.extensionDays);

        const extensionFee = new Decimal(activePlan.totalPrincipal.toString())
          .mul(params.extensionDays)
          .mul(0.001)
          .toDecimalPlaces(4);
        const extension = await tx.extension.create({
          data: {
            applicationId: params.applicationId,
            extensionTimes: approvedCount + 1,
            originalDueDate: currentDueDate,
            newDueDate,
            extensionDays: params.extensionDays,
            extensionFee: extensionFee.toNumber(),
            applyReason: params.applyReason ?? null,
            status: "PENDING",
          },
        });

        await writeAuditLogInTransaction(tx, {
          userId: params.operatorId,
          action: "create",
          entityType: "extension",
          entityId: extension.id,
          newValue: {
            status: extension.status,
            applicationId: params.applicationId,
            extensionDays: extension.extensionDays,
            extensionFee: extensionFee.toString(),
          },
          changeSummary: `申请展期 ${extension.extensionDays} 天`,
        });

        return extension;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isSerializationConflict(error)) throw new ExtensionConflictError();
    throw error;
  }
}

export async function approveExtension(params: {
  extensionId: string;
  action: ExtensionDecisionAction;
  remark?: string;
  operatorId: string;
}) {
  const targetStatus = extensionDecisionStatus(params.action);
  const now = new Date();

  try {
    return await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const claimed = await tx.extension.updateMany({
          where: { id: params.extensionId, status: "PENDING" },
          data: {
            status: targetStatus,
            approvedAt: targetStatus === "APPROVED" ? now : null,
            remark: params.remark ?? null,
          },
        });
        if (claimed.count !== 1) throw new ExtensionConflictError();

        const extension = await tx.extension.findUnique({
          where: { id: params.extensionId },
        });
        if (!extension) throw new Error("展期记录不存在");

        if (targetStatus === "REJECTED") {
          await writeAuditLogInTransaction(tx, {
            userId: params.operatorId,
            action: "reject",
            entityType: "extension",
            entityId: extension.id,
            oldValue: { status: "PENDING" },
            newValue: { status: targetStatus, remark: params.remark ?? null },
            changeSummary: "展期申请已拒绝",
          });
          return { status: targetStatus };
        }

        const activePlans = await tx.repaymentPlan.findMany({
          where: { applicationId: extension.applicationId, status: "ACTIVE" },
          include: { scheduleItems: { orderBy: { periodNumber: "asc" } } },
          orderBy: { createdAt: "desc" },
          take: 2,
        });
        if (activePlans.length !== 1) {
          throw new ExtensionConflictError("借款必须且只能有一份活跃还款计划");
        }
        const oldPlan = activePlans[0];
        const outstandingItems = oldPlan.scheduleItems.filter((item) =>
          new Decimal(item.remaining.toString()).gt(0),
        );
        if (outstandingItems.length === 0) {
          throw new ExtensionConflictError("还款计划没有可展期的待还期次");
        }

        const newPlanId = randomUUID();
        const superseded = await tx.repaymentPlan.updateMany({
          where: { id: oldPlan.id, status: "ACTIVE", version: oldPlan.version },
          data: { status: "SUPERSEDED", supersededBy: newPlanId },
        });
        if (superseded.count !== 1) throw new ExtensionConflictError();

        const newPlan = await tx.repaymentPlan.create({
          data: {
            id: newPlanId,
            planNo: `RP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            applicationId: extension.applicationId,
            totalPrincipal: oldPlan.totalPrincipal,
            totalInterest: oldPlan.totalInterest,
            totalFee: new Decimal(oldPlan.totalFee.toString())
              .plus(extension.extensionFee.toString())
              .toNumber(),
            totalPeriods: oldPlan.totalPeriods,
            status: "ACTIVE",
            version: oldPlan.version + 1,
            rulesSnapshotJson: JSON.stringify({
              extensionId: extension.id,
              oldPlanId: oldPlan.id,
              extensionDays: extension.extensionDays,
              extensionFee: extension.extensionFee.toString(),
            }),
          },
        });

        const extensionFee = new Decimal(extension.extensionFee.toString());
        const feeShares = allocateExtensionFeeShares(extensionFee, outstandingItems.length);
        let outstandingIndex = 0;

        for (const item of oldPlan.scheduleItems) {
          const isOutstanding = new Decimal(item.remaining.toString()).gt(0);
          let addedFee = new Decimal(0);
          if (isOutstanding) {
            addedFee = feeShares[outstandingIndex];
            outstandingIndex += 1;
          }

          const fee = new Decimal(item.fee.toString()).plus(addedFee);
          const totalDue = new Decimal(item.principal.toString())
            .plus(item.interest.toString())
            .plus(fee);
          const remaining = isOutstanding
            ? new Decimal(item.remaining.toString()).plus(addedFee)
            : new Decimal(0);

          await tx.repaymentScheduleItem.create({
            data: {
              planId: newPlan.id,
              periodNumber: item.periodNumber,
              dueDate: isOutstanding ? addDays(item.dueDate, extension.extensionDays) : item.dueDate,
              principal: item.principal,
              interest: item.interest,
              fee: fee.toNumber(),
              totalDue: totalDue.toNumber(),
              remaining: remaining.toNumber(),
              status: isOutstanding ? "PENDING" : item.status,
              paidAt: item.paidAt,
            },
          });
        }

        if (extensionFee.gt(0)) {
          const application = await tx.loanApplication.findUnique({
            where: { id: extension.applicationId },
            select: { customerId: true },
          });
          await writeLedgerEntry(tx, {
            type: "EXTENSION_FEE",
            direction: "DEBIT",
            amount: extensionFee,
            referenceType: "extension",
            referenceId: extension.id,
            customerId: application?.customerId,
            operatorId: params.operatorId,
            description: `展期费用 (延期${extension.extensionDays}天)`,
          });
        }

        await writeAuditLogInTransaction(tx, {
          userId: params.operatorId,
          action: "approve",
          entityType: "extension",
          entityId: extension.id,
          oldValue: { status: "PENDING", planId: oldPlan.id },
          newValue: { status: targetStatus, planId: newPlan.id },
          changeSummary: "展期审批通过并生成新还款计划",
        });

        return {
          status: targetStatus,
          oldPlanId: oldPlan.id,
          newPlanId: newPlan.id,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (isSerializationConflict(error)) throw new ExtensionConflictError();
    throw error;
  }
}

export async function getExtensionList(params: {
  applicationId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { applicationId, status, page = 1, pageSize = 20 } = params;
  const where: Prisma.ExtensionWhereInput = {
    ...(applicationId ? { applicationId } : {}),
    ...(status ? { status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.extension.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.extension.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      extensionFee: Number(item.extensionFee),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
