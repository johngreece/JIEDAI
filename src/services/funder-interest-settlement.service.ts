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

type SettlementListFilters = {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  take?: number;
};

type SettlementResponseFilters = {
  startDate: string | null;
  endDate: string | null;
  periodLabel: string;
};

type SerializedSettlement = {
  settlementNo: string;
  funderName: string;
  accountName: string;
  bankName: string;
  disbursementNo: string;
  applicationNo: string;
  customerName: string;
  ruleMode: string;
  cycleIndex: number;
  cycleStart: Date | string;
  cycleEnd: Date | string;
  dueDate: Date | string;
  principal: number;
  rate: number;
  interestAmount: number;
  status: string;
  paidAt: Date | string | null;
  confirmedAt: Date | string | null;
  rejectedAt: Date | string | null;
  rejectReason: string | null;
  remark: string | null;
};

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

function dateOnly(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const statusLabel: Record<string, string> = {
  DUE: "待平台打款",
  PAID_BY_PLATFORM: "待资金方确认",
  CONFIRMED_BY_FUNDER: "资金方已确认",
  FUNDER_REJECTED: "资金方反馈未收到",
  CANCELLED: "已取消",
};

const modeLabel: Record<string, string> = {
  FIXED_MONTHLY: "固定月息",
  VOLUME_BASED: "固定周息",
  PROFIT_SHARE: "按实际收益分润",
};

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function normalizeDateBoundary(value: Date | string | null | undefined, boundary: "start" | "end") {
  if (!value) return null;

  const rawValue = value instanceof Date ? value : String(value).trim();
  if (!rawValue) return null;

  const isDateOnly = typeof rawValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawValue);
  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(isDateOnly ? `${rawValue}T00:00:00` : rawValue);

  if (Number.isNaN(date.getTime())) return null;

  if (isDateOnly) {
    if (boundary === "start") {
      date.setHours(0, 0, 0, 0);
    } else {
      date.setHours(23, 59, 59, 999);
    }
  }

  return date;
}

function buildDueDateRange(filters: SettlementListFilters) {
  const startAt = normalizeDateBoundary(filters.startDate, "start");
  const endAt = normalizeDateBoundary(filters.endDate, "end");
  const dueDate: Prisma.DateTimeFilter = {};

  if (startAt) dueDate.gte = startAt;
  if (endAt) dueDate.lte = endAt;

  const startLabel = startAt ? dateOnly(startAt) : null;
  const endLabel = endAt ? dateOnly(endAt) : null;
  const periodLabel = startLabel && endLabel
    ? `${startLabel} 至 ${endLabel}`
    : startLabel
      ? `${startLabel} 起`
      : endLabel
        ? `截至 ${endLabel}`
        : "全部到期时间";

  return {
    dueDate: Object.keys(dueDate).length ? dueDate : undefined,
    response: {
      startDate: startLabel,
      endDate: endLabel,
      periodLabel,
    } satisfies SettlementResponseFilters,
  };
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

  static describeListFilters(filters: SettlementListFilters = {}) {
    return buildDueDateRange(filters).response;
  }

  static async listForAdmin(status?: string | null, filters: SettlementListFilters = {}) {
    const dateRange = buildDueDateRange(filters);
    const items = await prisma.funderInterestSettlement.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(dateRange.dueDate ? { dueDate: dateRange.dueDate } : {}),
      },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      take: filters.take ?? 300,
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

  static async listForFunder(funderId: string, status?: string | null, filters: SettlementListFilters = {}) {
    const dateRange = buildDueDateRange(filters);
    const items = await prisma.funderInterestSettlement.findMany({
      where: {
        funderId,
        ...(status ? { status } : {}),
        ...(dateRange.dueDate ? { dueDate: dateRange.dueDate } : {}),
      },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      take: filters.take ?? 200,
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
    const paymentRemark = remark?.trim();
    if (!paymentRemark) {
      throw new Error("请填写平台打款流水号或付款备注");
    }

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
        remark: paymentRemark,
      },
    });

    await Promise.all([
      FunderNotificationService.send(
        settlement.funderId,
        "FUNDER_INTEREST_PAID",
        "收益已打款，请确认",
        `结算单 ${settlement.settlementNo} 已由平台标记为已打款，金额 ${money(Number(settlement.interestAmount))}。打款备注：${paymentRemark}。收到后请进入收益结算页确认。`,
      ),
      writeAuditLog({
        userId: operatorId,
        action: "confirm",
        entityType: "funder_interest_settlement",
        entityId: settlement.id,
        oldValue: {
          status: settlement.status,
          remark: settlement.remark,
          rejectReason: settlement.rejectReason,
        },
        newValue: { status: updated.status, paidAt: paidAt.toISOString(), remark: paymentRemark },
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
          description: `收益结算入账：${settlement.settlementNo}，周期 ${dateOnly(settlement.cycleStart)} 至 ${dateOnly(settlement.cycleEnd)}`,
          metadata: {
            funderId,
            settlementNo: settlement.settlementNo,
            disbursementId: settlement.disbursementId,
            applicationId: settlement.applicationId,
            ruleMode: settlement.ruleMode,
            rate: Number(settlement.rate),
            principal: Number(settlement.principal),
            interestAmount: Number(settlement.interestAmount),
            dueDate: settlement.dueDate.toISOString(),
            cycleStart: settlement.cycleStart.toISOString(),
            cycleEnd: settlement.cycleEnd.toISOString(),
            paidAt: settlement.paidAt?.toISOString() ?? null,
            paymentRemark: settlement.remark ?? null,
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

  static toCSV(payload: {
    funderName?: string;
    filters: SettlementResponseFilters;
    items: SerializedSettlement[];
    summary: ReturnType<typeof FunderInterestSettlementService.summarize>;
  }) {
    const BOM = "\uFEFF";
    const summary = payload.summary;
    const title = payload.funderName ? `资金方收益结算 - ${payload.funderName}` : "资金方收益结算";
    const header = [
      title,
      `导出时间: ${formatDateTime(new Date())}`,
      `到期时间: ${payload.filters.periodLabel}`,
      `记录数: ${payload.items.length}`,
      `待平台打款: €${summary.dueAmount.toFixed(2)}`,
      `待资金方确认: €${summary.paidPendingConfirmAmount.toFixed(2)}`,
      `资金方已确认: €${summary.confirmedAmount.toFixed(2)}`,
      `反馈未收到: €${summary.rejectedAmount.toFixed(2)}`,
      "",
      "结算单号,资金方,账户,客户,放款单,规则,期数,周期开始,周期结束,到期时间,本金(€),利率(%),利息(€),状态,平台打款时间,资金方确认时间,反馈未收到时间,打款备注,拒绝原因",
    ].join("\n");

    const rows = payload.items.map((item) =>
      [
        csvCell(item.settlementNo),
        csvCell(item.funderName),
        csvCell(item.accountName),
        csvCell(item.customerName),
        csvCell(item.disbursementNo),
        csvCell(modeLabel[item.ruleMode] ?? item.ruleMode),
        item.cycleIndex,
        csvCell(formatDateTime(item.cycleStart)),
        csvCell(formatDateTime(item.cycleEnd)),
        csvCell(formatDateTime(item.dueDate)),
        item.principal.toFixed(2),
        item.rate.toFixed(4),
        item.interestAmount.toFixed(2),
        csvCell(statusLabel[item.status] ?? item.status),
        csvCell(formatDateTime(item.paidAt)),
        csvCell(formatDateTime(item.confirmedAt)),
        csvCell(formatDateTime(item.rejectedAt)),
        csvCell(item.remark ?? ""),
        csvCell(item.rejectReason ?? ""),
      ].join(","),
    );

    return `${BOM}${header}\n${rows.join("\n")}`;
  }
}
