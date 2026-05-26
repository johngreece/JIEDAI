import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { writeFundAccountLedgerEntry } from "@/services/fund-account-ledger.service";
import { FunderNotificationService } from "@/services/funder-notification.service";
import { InAppNotificationService } from "@/services/in-app-notification.service";

export const FUNDER_INTEREST_SETTLEMENT_STATUS = {
  DUE: "DUE",
  PAID_BY_PLATFORM: "PAID_BY_PLATFORM",
  CONFIRMED_BY_FUNDER: "CONFIRMED_BY_FUNDER",
  FUNDER_REJECTED: "FUNDER_REJECTED",
  CANCELLED: "CANCELLED",
} as const;

type SettlementStatus =
  (typeof FUNDER_INTEREST_SETTLEMENT_STATUS)[keyof typeof FUNDER_INTEREST_SETTLEMENT_STATUS];

const DAY_MS = 24 * 60 * 60 * 1000;
const EPSILON = 0.0001;

type GeneratedSettlementNotice = {
  settlementNo: string;
  funderId: string;
  funderName: string;
  disbursementNo: string;
  customerName: string | null;
  interestAmount: number;
};

function roundMoney(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function diffDays(from: Date, to: Date) {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
}

function toNumber(value: unknown) {
  return Number(value || 0);
}

function genSettlementNo() {
  return `FS${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function serializeSettlement<T extends {
  interestAmount: unknown;
  principal: unknown;
  rate: unknown;
  funder?: { name: string } | null;
  fundAccount?: { accountName: string; bankName: string } | null;
  disbursement?: {
    disbursementNo: string;
    application?: { applicationNo: string; customer?: { name: string } | null } | null;
  } | null;
}>(item: T) {
  return {
    ...item,
    principal: Number(item.principal),
    rate: Number(item.rate),
    interestAmount: Number(item.interestAmount),
    funderName: item.funder?.name ?? "-",
    accountName: item.fundAccount?.accountName ?? "-",
    bankName: item.fundAccount?.bankName ?? "-",
    disbursementNo: item.disbursement?.disbursementNo ?? "-",
    applicationNo: item.disbursement?.application?.applicationNo ?? "-",
    customerName: item.disbursement?.application?.customer?.name ?? "-",
  };
}

export class FunderInterestSettlementService {
  static async generateDueSettlements(now = new Date()) {
    const disbursements = await prisma.disbursement.findMany({
      where: {
        status: { in: ["PAID", "CONFIRMED"] },
        disbursedAt: { not: null },
        fundAccount: {
          isActive: true,
          funder: { isActive: true, deletedAt: null },
        },
      },
      include: {
        fundAccount: {
          include: { funder: true },
        },
        application: {
          select: {
            id: true,
            applicationNo: true,
            status: true,
            customer: { select: { name: true } },
          },
        },
      },
    });

    const applicationIds = disbursements.map((item) => item.applicationId);
    const plans = applicationIds.length
      ? await prisma.repaymentPlan.findMany({
          where: { applicationId: { in: applicationIds } },
          include: {
            repayments: {
              where: { status: "CONFIRMED" },
              orderBy: { receivedAt: "asc" },
              select: {
                receivedAt: true,
                interestPart: true,
                feePart: true,
                penaltyPart: true,
                principalPart: true,
              },
            },
          },
        })
      : [];

    const plansByApplicationId = new Map(plans.map((plan) => [plan.applicationId, plan]));
    let created = 0;
    let skipped = 0;
    const createdSettlements: GeneratedSettlementNotice[] = [];

    for (const disbursement of disbursements) {
      if (!disbursement.disbursedAt) continue;
      const funder = disbursement.fundAccount.funder;
      const plan = plansByApplicationId.get(disbursement.applicationId);
      const repayments = plan?.repayments ?? [];
      const repaymentDates = repayments
        .map((item) => item.receivedAt)
        .filter((value): value is Date => Boolean(value));
      const lastRepaymentAt = repaymentDates[repaymentDates.length - 1];

      const isSettled = ["SETTLED", "COMPLETED"].includes(disbursement.application.status);
      const start = new Date(disbursement.disbursedAt);
      const endLimit = isSettled && lastRepaymentAt && lastRepaymentAt < now ? lastRepaymentAt : now;
      if (endLimit <= start) continue;

      const isMonthly = funder.cooperationMode === "FIXED_MONTHLY";
      const periodDays = isMonthly ? 30 : 7;
      const rate = isMonthly ? toNumber(funder.monthlyRate) : toNumber(funder.weeklyRate);
      const profitShareRatio = !isMonthly ? toNumber(funder.profitShareRatio || 0) : 0;
      const principal = roundMoney(disbursement.netAmount.toString());
      const fullCycles = Math.floor(diffDays(start, endLimit) / periodDays);
      const cycles: Array<{ index: number; cycleStart: Date; cycleEnd: Date; finalPartial: boolean }> = [];

      for (let index = 1; index <= fullCycles; index += 1) {
        cycles.push({
          index,
          cycleStart: addDays(start, (index - 1) * periodDays),
          cycleEnd: addDays(start, index * periodDays),
          finalPartial: false,
        });
      }

      const lastFullEnd = addDays(start, fullCycles * periodDays);
      if (isSettled && endLimit > lastFullEnd && diffDays(lastFullEnd, endLimit) > EPSILON) {
        cycles.push({
          index: fullCycles + 1,
          cycleStart: lastFullEnd,
          cycleEnd: endLimit,
          finalPartial: true,
        });
      }

      for (const cycle of cycles) {
        if (cycle.cycleEnd > now) continue;

        const exists = await prisma.funderInterestSettlement.findFirst({
          where: {
            disbursementId: disbursement.id,
            cycleStart: cycle.cycleStart,
            cycleEnd: cycle.cycleEnd,
          },
          select: { id: true },
        });
        if (exists) {
          skipped += 1;
          continue;
        }

        const cycleDays = diffDays(cycle.cycleStart, cycle.cycleEnd);
        const incomeInCycle = repayments
          .filter((repayment) => {
            if (!repayment.receivedAt) return false;
            return repayment.receivedAt > cycle.cycleStart && repayment.receivedAt <= cycle.cycleEnd;
          })
          .reduce(
            (sum, repayment) =>
              sum +
              toNumber(repayment.interestPart) +
              toNumber(repayment.feePart) +
              toNumber(repayment.penaltyPart),
            0,
          );

        const interestAmount = profitShareRatio > 0
          ? roundMoney(new Decimal(incomeInCycle).mul(profitShareRatio))
          : roundMoney(principal.mul(rate).div(100).mul(cycleDays).div(periodDays));

        if (!interestAmount.gt(0)) {
          skipped += 1;
          continue;
        }

        const ruleMode = profitShareRatio > 0 ? "PROFIT_SHARE" : funder.cooperationMode;
        const createdSettlement = await prisma.funderInterestSettlement.create({
          data: {
            settlementNo: genSettlementNo(),
            funderId: funder.id,
            fundAccountId: disbursement.fundAccountId,
            disbursementId: disbursement.id,
            applicationId: disbursement.applicationId,
            ruleMode,
            cycleIndex: cycle.index,
            cycleStart: cycle.cycleStart,
            cycleEnd: cycle.cycleEnd,
            dueDate: cycle.cycleEnd,
            principal: principal.toNumber(),
            rate: profitShareRatio > 0 ? profitShareRatio : rate,
            interestAmount: interestAmount.toNumber(),
            status: FUNDER_INTEREST_SETTLEMENT_STATUS.DUE,
            metadataJson: JSON.stringify({
              periodDays,
              cycleDays,
              finalPartial: cycle.finalPartial,
              profitShareRatio,
              incomeInCycle,
              customerName: disbursement.application.customer?.name ?? null,
              applicationNo: disbursement.application.applicationNo,
            }),
          },
        });
        createdSettlements.push({
          settlementNo: createdSettlement.settlementNo,
          funderId: funder.id,
          funderName: funder.name,
          disbursementNo: disbursement.disbursementNo,
          customerName: disbursement.application.customer?.name ?? null,
          interestAmount: interestAmount.toNumber(),
        });
        created += 1;
      }
    }

    const notifications = await this.notifyGeneratedDueSettlements(createdSettlements);
    const createdAmount = roundMoney(
      createdSettlements.reduce((sum, item) => sum + item.interestAmount, 0),
    ).toNumber();

    return {
      scannedDisbursements: disbursements.length,
      created,
      skipped,
      createdAmount,
      notifiedFunders: notifications.funders,
      notifiedAdmins: notifications.admins,
    };
  }

  private static async notifyGeneratedDueSettlements(items: GeneratedSettlementNotice[]) {
    if (items.length === 0) return { funders: 0, admins: 0 };

    const funderResults = await Promise.allSettled(
      items.map((item) =>
        FunderNotificationService.send(
          item.funderId,
          "FUNDER_INTEREST_DUE",
          "收益结算单已到期",
          `结算单 ${item.settlementNo} 已到期，金额 ${money(item.interestAmount)}。平台标记打款后，请进入收益结算页确认是否到账。`,
        ),
      ),
    );

    const totalAmount = items.reduce((sum, item) => sum + item.interestAmount, 0);
    const preview = items
      .slice(0, 5)
      .map((item) => {
        const customer = item.customerName ? `${item.customerName}/` : "";
        return `${item.funderName}/${customer}${item.disbursementNo}/${money(item.interestAmount)}`;
      })
      .join("；");
    const adminResult = await InAppNotificationService.notifyAdmins({
      type: "FUNDER_INTEREST_DUE",
      title: "资金方收益结算单已到期",
      content: `系统自动生成 ${items.length} 笔资金方收益结算单，合计 ${money(totalAmount)}。请进入收益结算页核对并标记打款。${preview ? `明细：${preview}` : ""}`,
    }).catch(() => ({ created: 0 }));

    return {
      funders: funderResults.filter((result) => result.status === "fulfilled").length,
      admins: adminResult.created,
    };
  }

  static async listForAdmin(status?: string | null) {
    const items = await prisma.funderInterestSettlement.findMany({
      where: status ? { status } : {},
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        funder: { select: { name: true } },
        fundAccount: { select: { accountName: true, bankName: true } },
        disbursement: {
          select: {
            disbursementNo: true,
            application: {
              select: {
                applicationNo: true,
                customer: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    return items.map(serializeSettlement);
  }

  static async listForFunder(funderId: string, status?: string | null) {
    const items = await prisma.funderInterestSettlement.findMany({
      where: { funderId, ...(status ? { status } : {}) },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        funder: { select: { name: true } },
        fundAccount: { select: { accountName: true, bankName: true } },
        disbursement: {
          select: {
            disbursementNo: true,
            application: {
              select: {
                applicationNo: true,
                customer: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    return items.map(serializeSettlement);
  }

  static async markPaidByPlatform(settlementId: string, operatorId: string, remark?: string) {
    const settlement = await prisma.funderInterestSettlement.findUnique({
      where: { id: settlementId },
      include: { funder: { select: { name: true } } },
    });

    if (!settlement) throw new Error("资金方收益结算单不存在");
    if (
      settlement.status !== FUNDER_INTEREST_SETTLEMENT_STATUS.DUE &&
      settlement.status !== FUNDER_INTEREST_SETTLEMENT_STATUS.FUNDER_REJECTED
    ) {
      throw new Error("当前状态不能标记为已打款");
    }

    const paidAt = new Date();
    const updated = await prisma.funderInterestSettlement.update({
      where: { id: settlementId },
      data: {
        status: FUNDER_INTEREST_SETTLEMENT_STATUS.PAID_BY_PLATFORM,
        paidAt,
        paidById: operatorId,
        rejectReason: null,
        rejectedAt: null,
        remark: remark ?? settlement.remark,
      },
    });

    await Promise.all([
      FunderNotificationService.send(
        settlement.funderId,
        "FUNDER_INTEREST_PAID",
        "收益已打款，请确认",
        `结算单 ${settlement.settlementNo} 已由平台标记为已打款，金额 ${money(Number(settlement.interestAmount))}。收到后请进入收益结算页确认。`,
      ),
      writeAuditLog({
        userId: operatorId,
        action: "confirm",
        entityType: "funder_interest_settlement",
        entityId: settlement.id,
        oldValue: { status: settlement.status },
        newValue: { status: updated.status, paidAt: paidAt.toISOString() },
        changeSummary: "平台标记资金方收益已打款",
      }).catch(() => undefined),
    ]);

    return serializeSettlement(updated);
  }

  static async confirmByFunder(settlementId: string, funderId: string) {
    const settlement = await prisma.funderInterestSettlement.findFirst({
      where: { id: settlementId, funderId },
    });

    if (!settlement) throw new Error("资金方收益结算单不存在");
    if (settlement.status !== FUNDER_INTEREST_SETTLEMENT_STATUS.PAID_BY_PLATFORM) {
      throw new Error("只有平台已打款的结算单才能确认收到");
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existingJournal = await tx.fundAccountJournal.findFirst({
        where: {
          referenceType: "funder_interest_settlement",
          referenceId: settlement.id,
        },
        select: { id: true },
      });

      if (!existingJournal) {
        await writeFundAccountLedgerEntry(tx, {
          fundAccountId: settlement.fundAccountId,
          type: "INTEREST_SETTLEMENT",
          direction: "CREDIT",
          amount: Number(settlement.interestAmount),
          referenceType: "funder_interest_settlement",
          referenceId: settlement.id,
          description: "Funder confirmed interest settlement received",
          metadata: {
            funderId,
            settlementNo: settlement.settlementNo,
            disbursementId: settlement.disbursementId,
            cycleStart: settlement.cycleStart.toISOString(),
            cycleEnd: settlement.cycleEnd.toISOString(),
          },
        });

        await tx.fundAccount.update({
          where: { id: settlement.fundAccountId },
          data: {
            balance: { increment: Number(settlement.interestAmount) },
            totalProfit: { increment: Number(settlement.interestAmount) },
          },
        });
      }

      return tx.funderInterestSettlement.update({
        where: { id: settlement.id },
        data: {
          status: FUNDER_INTEREST_SETTLEMENT_STATUS.CONFIRMED_BY_FUNDER,
          confirmedAt: now,
          rejectedAt: null,
          rejectReason: null,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await InAppNotificationService.notifyAdmins({
      type: "FUNDER_INTEREST_CONFIRMED",
      templateCode: `FUNDER_INTEREST_CONFIRMED_${settlement.id}`,
      title: "资金方已确认收益到账",
      content: `资金方确认结算单 ${settlement.settlementNo} 已到账，金额 ${money(Number(settlement.interestAmount))}。`,
    }).catch(() => undefined);

    return serializeSettlement(updated);
  }

  static async rejectByFunder(settlementId: string, funderId: string, reason: string) {
    const settlement = await prisma.funderInterestSettlement.findFirst({
      where: { id: settlementId, funderId },
    });

    if (!settlement) throw new Error("资金方收益结算单不存在");
    if (settlement.status !== FUNDER_INTEREST_SETTLEMENT_STATUS.PAID_BY_PLATFORM) {
      throw new Error("只有平台已打款的结算单才能反馈未收到");
    }

    const updated = await prisma.funderInterestSettlement.update({
      where: { id: settlement.id },
      data: {
        status: FUNDER_INTEREST_SETTLEMENT_STATUS.FUNDER_REJECTED,
        rejectedAt: new Date(),
        rejectReason: reason,
      },
    });

    await InAppNotificationService.notifyAdmins({
      type: "FUNDER_INTEREST_REJECTED",
      templateCode: `FUNDER_INTEREST_REJECTED_${settlement.id}`,
      title: "资金方反馈收益未到账",
      content: `资金方反馈结算单 ${settlement.settlementNo} 未收到，金额 ${money(Number(settlement.interestAmount))}。原因：${reason}`,
    }).catch(() => undefined);

    return serializeSettlement(updated);
  }

  static summarize(items: Array<{ status: string; interestAmount: number }>) {
    return {
      dueAmount: items
        .filter((item) => item.status === FUNDER_INTEREST_SETTLEMENT_STATUS.DUE)
        .reduce((sum, item) => sum + item.interestAmount, 0),
      paidPendingConfirmAmount: items
        .filter((item) => item.status === FUNDER_INTEREST_SETTLEMENT_STATUS.PAID_BY_PLATFORM)
        .reduce((sum, item) => sum + item.interestAmount, 0),
      confirmedAmount: items
        .filter((item) => item.status === FUNDER_INTEREST_SETTLEMENT_STATUS.CONFIRMED_BY_FUNDER)
        .reduce((sum, item) => sum + item.interestAmount, 0),
      rejectedAmount: items
        .filter((item) => item.status === FUNDER_INTEREST_SETTLEMENT_STATUS.FUNDER_REJECTED)
        .reduce((sum, item) => sum + item.interestAmount, 0),
    };
  }
}
