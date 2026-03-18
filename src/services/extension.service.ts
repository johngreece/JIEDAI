/**
 * 展期服务
 * 展期 = 将现有到期日延后，收取展期费用，生成新的还款计划
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { writeLedgerEntry } from "./ledger.service";

/**
 * 申请展期
 */
export async function applyExtension(params: {
  applicationId: string;
  extensionDays: number;
  applyReason?: string;
  operatorId: string;
}) {
  // 验证贷款申请状态
  const app = await prisma.loanApplication.findUnique({
    where: { id: params.applicationId },
    include: { product: true },
  });
  if (!app) throw new Error("借款申请不存在");
  if (app.status !== "DISBURSED") throw new Error("仅已放款的申请可申请展期");

  // 检查产品是否允许展期
  if (!app.product.allowExtension) throw new Error("该产品不允许展期");

  // 检查展期次数限制
  const existingCount = await prisma.extension.count({
    where: { applicationId: params.applicationId, status: { in: ["APPROVED", "PENDING"] } },
  });
  if (existingCount >= app.product.maxExtensionTimes) {
    throw new Error(`已达最大展期次数 (${app.product.maxExtensionTimes})`);
  }

  // 找到当前活跃计划的最近到期日
  const activePlan = await prisma.repaymentPlan.findFirst({
    where: { applicationId: params.applicationId, status: "ACTIVE" },
    include: {
      scheduleItems: { orderBy: { dueDate: "desc" }, take: 1 },
    },
  });
  if (!activePlan || activePlan.scheduleItems.length === 0) {
    throw new Error("未找到活跃的还款计划");
  }

  const currentDueDate = activePlan.scheduleItems[0].dueDate;
  const newDueDate = new Date(currentDueDate);
  newDueDate.setDate(newDueDate.getDate() + params.extensionDays);

  // 展期费：本金 * 展期天数 * 日费率（默认 0.1%/天）
  const principal = new Decimal(activePlan.totalPrincipal.toString());
  const extensionFee = principal
    .mul(params.extensionDays)
    .mul(0.001)
    .toDecimalPlaces(4);

  const extension = await prisma.extension.create({
    data: {
      applicationId: params.applicationId,
      extensionTimes: existingCount + 1,
      originalDueDate: currentDueDate,
      newDueDate,
      extensionDays: params.extensionDays,
      extensionFee: extensionFee.toNumber(),
      applyReason: params.applyReason ?? null,
      status: "PENDING",
    },
  });

  return extension;
}

/**
 * 审批展期
 */
export async function approveExtension(params: {
  extensionId: string;
  action: "APPROVED" | "REJECTED";
  remark?: string;
  operatorId: string;
}) {
  const ext = await prisma.extension.findUnique({
    where: { id: params.extensionId },
  });
  if (!ext) throw new Error("展期记录不存在");
  if (ext.status !== "PENDING") throw new Error("展期状态不正确");

  if (params.action === "REJECTED") {
    await prisma.extension.update({
      where: { id: params.extensionId },
      data: { status: "REJECTED", remark: params.remark ?? null },
    });
    return { status: "REJECTED" };
  }

  // 审批通过 — 更新还款计划
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. 标记展期为已批准
    await tx.extension.update({
      where: { id: params.extensionId },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        remark: params.remark ?? null,
      },
    });

    // 2. 找到活跃还款计划，归档并创建新计划
    const oldPlan = await tx.repaymentPlan.findFirst({
      where: { applicationId: ext.applicationId, status: "ACTIVE" },
      include: { scheduleItems: true },
    });

    if (oldPlan) {
      // 归档旧计划
      const newPlanNo = `RP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const newPlan = await tx.repaymentPlan.create({
        data: {
          planNo: newPlanNo,
          applicationId: ext.applicationId,
          totalPrincipal: oldPlan.totalPrincipal,
          totalInterest: oldPlan.totalInterest,
          totalFee: new Decimal(oldPlan.totalFee.toString()).plus(ext.extensionFee.toString()).toNumber(),
          totalPeriods: oldPlan.totalPeriods,
          status: "ACTIVE",
          version: oldPlan.version + 1,
          rulesSnapshotJson: JSON.stringify({
            extensionId: ext.id,
            extensionDays: ext.extensionDays,
            extensionFee: Number(ext.extensionFee),
          }),
        },
      });

      // 旧计划标记为已替代
      await tx.repaymentPlan.update({
        where: { id: oldPlan.id },
        data: { status: "SUPERSEDED", supersededBy: newPlan.id },
      });

      // 复制并更新还款条目
      for (const item of oldPlan.scheduleItems) {
        const newDue = item.status === "PENDING"
          ? new Date(new Date(item.dueDate).getTime() + ext.extensionDays * 86400000)
          : item.dueDate;

        const addedFee = item.status === "PENDING"
          ? new Decimal(ext.extensionFee.toString()).div(oldPlan.scheduleItems.filter(i => i.status === "PENDING").length).toDecimalPlaces(4)
          : new Decimal(0);

        const totalDue = new Decimal(item.principal.toString())
          .plus(item.interest.toString())
          .plus(item.fee.toString())
          .plus(addedFee)
          .toNumber();

        await tx.repaymentScheduleItem.create({
          data: {
            planId: newPlan.id,
            periodNumber: item.periodNumber,
            dueDate: newDue,
            principal: item.principal,
            interest: item.interest,
            fee: new Decimal(item.fee.toString()).plus(addedFee).toNumber(),
            totalDue,
            remaining: item.status === "PENDING" ? totalDue : 0,
            status: item.status,
            paidAt: item.paidAt,
          },
        });
      }

      // 台账：展期费用
      const feeAmount = new Decimal(ext.extensionFee.toString());
      if (feeAmount.gt(0)) {
        const app = await tx.loanApplication.findUnique({
          where: { id: ext.applicationId },
          select: { customerId: true },
        });
        await writeLedgerEntry(tx, {
          type: "EXTENSION_FEE",
          direction: "DEBIT",
          amount: feeAmount,
          referenceType: "extension",
          referenceId: ext.id,
          customerId: app?.customerId,
          operatorId: params.operatorId,
          description: `展期费用 (延期${ext.extensionDays}天)`,
        });
      }
    }
  });

  return { status: "APPROVED" };
}

/**
 * 获取展期列表
 */
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
    items: items.map((x) => ({
      ...x,
      extensionFee: Number(x.extensionFee),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
