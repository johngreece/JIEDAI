import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TERMINAL_LOAN_STATUSES } from "@/lib/business-status";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import { requireActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";
import { InAppNotificationService } from "@/services/in-app-notification.service";
import {
  DEFAULT_OVERDUE,
  DEFAULT_TIERS,
  DEFAULT_UPFRONT_FEE_RATE,
  calculateRealtimeRepayment,
  loadFeeConfig,
  parseTiersFromPricingRules,
  type ChannelType,
  type OverdueConfig,
  type RepaymentTier,
} from "@/lib/interest-engine";
import { applyCustomerPricingOverride } from "@/lib/customer-pricing";
import { isFullPayoffAmount } from "@/lib/repayment-runtime";
import { formatMoney as money } from "@/lib/system-config";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(["BANK_TRANSFER", "CASH", "ONLINE"]).default("BANK_TRANSFER"),
  remark: z.string().trim().max(500).optional(),
});

function genRepaymentNo() {
  return `RPY${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function POST(req: NextRequest) {
  const session = await requireActiveClientSession();
  if (session instanceof Response) return session;

  const idemKey = getScopedIdempotencyKey(req, ["client", session.sub, "repayment-request"]);
  return withIdempotencyResponse(idemKey, async () => {

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const freezeAt = new Date();

  const [customer, activeApplication, operator] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, phone: true, deletedAt: true, weeklyInterestRateOverride: true },
    }),
    prisma.loanApplication.findFirst({
      where: {
        customerId: session.sub,
        deletedAt: null,
        status: {
          notIn: [...TERMINAL_LOAN_STATUSES],
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        applicationNo: true,
        amount: true,
        disbursement: {
          select: {
            status: true,
            disbursedAt: true,
            netAmount: true,
          },
        },
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            pricingRules: {
              where: { isActive: true },
              orderBy: { priority: "desc" },
            },
          },
        },
      },
    }),
    prisma.user.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);

  if (!customer || customer.deletedAt) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  if (!operator) {
    return NextResponse.json({ error: "系统中没有可用的管理账号用于接收还款申请" }, { status: 500 });
  }

  if (!activeApplication) {
    return NextResponse.json({ error: "当前没有可申请还款的进行中借款" }, { status: 400 });
  }

  const plan = await prisma.repaymentPlan.findFirst({
    where: {
      applicationId: activeApplication.id,
      status: "ACTIVE",
    },
    select: {
      id: true,
      totalPrincipal: true,
      rulesSnapshotJson: true,
      scheduleItems: {
        where: {
          status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
        },
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          remaining: true,
        },
      },
    },
  });

  if (!plan) {
    return NextResponse.json({ error: "当前借款尚未生成可还款计划" }, { status: 400 });
  }

  let outstandingAmount = plan.scheduleItems.reduce((sum, item) => sum + Number(item.remaining), 0);
  if (activeApplication.disbursement?.status === "PAID" && activeApplication.disbursement.disbursedAt) {
    let tiers: RepaymentTier[] = DEFAULT_TIERS;
    let overdueConfig: OverdueConfig = DEFAULT_OVERDUE;
    let upfrontFeeRate = DEFAULT_UPFRONT_FEE_RATE;
    let channel: ChannelType = "FULL_AMOUNT";
    let dueDate: Date | null = null;
    let normalInterestCapitalized = false;
    let fixedFeeAmount = 0;
    let netDisbursementAmount: number | undefined;

    if (plan.rulesSnapshotJson) {
      try {
        const snapshot = JSON.parse(plan.rulesSnapshotJson) as {
          tiers?: RepaymentTier[];
          overdueConfig?: OverdueConfig;
          upfrontFeeRate?: number;
          channel?: ChannelType;
          dueDate?: string;
          normalInterestCapitalized?: boolean;
          fixedFeeAmount?: number;
          netDisbursementAmount?: number;
        };
        if (snapshot.tiers) tiers = snapshot.tiers;
        if (snapshot.overdueConfig) overdueConfig = snapshot.overdueConfig;
        if (snapshot.upfrontFeeRate != null) upfrontFeeRate = snapshot.upfrontFeeRate;
        if (snapshot.channel) channel = snapshot.channel;
        if (snapshot.dueDate) dueDate = new Date(snapshot.dueDate);
        if (snapshot.normalInterestCapitalized != null) {
          normalInterestCapitalized = snapshot.normalInterestCapitalized;
        }
        if (snapshot.fixedFeeAmount != null) fixedFeeAmount = snapshot.fixedFeeAmount;
        if (snapshot.netDisbursementAmount != null) {
          netDisbursementAmount = snapshot.netDisbursementAmount;
        }
      } catch {
        // ignore invalid snapshot
      }
    } else if (activeApplication.product.pricingRules.length > 0) {
      const parsed = parseTiersFromPricingRules(activeApplication.product.pricingRules);
      const effective = applyCustomerPricingOverride(parsed, customer);
      tiers = effective.tiers;
      overdueConfig = effective.overdueConfig;
      upfrontFeeRate = effective.upfrontFeeRate;
      channel = effective.channel;
    } else {
      const settingsRows = await prisma.systemSetting.findMany();
      const sysMap: Record<string, string | number> = {};
      for (const setting of settingsRows) sysMap[setting.key] = setting.value;
      const parsed = loadFeeConfig(sysMap, null);
      const effective = applyCustomerPricingOverride(parsed, customer);
      tiers = effective.tiers;
      overdueConfig = effective.overdueConfig;
      upfrontFeeRate = effective.upfrontFeeRate;
      channel = effective.channel;
    }

    if (!dueDate) {
      const sortedTiers = [...tiers].sort(
        (a, b) => (a.maxHours ?? a.maxDays * 24) - (b.maxHours ?? b.maxDays * 24)
      );
      const lastTier = sortedTiers[sortedTiers.length - 1];
      dueDate = new Date(
        new Date(activeApplication.disbursement.disbursedAt).getTime() +
          (lastTier?.maxHours ?? (lastTier?.maxDays ?? 7) * 24) *
            60 *
            60 *
            1000
      );
    }

    const realtime = calculateRealtimeRepayment({
      principal: Number(plan.totalPrincipal),
      channel,
      upfrontFeeRate,
      tiers,
      overdueConfig,
      startTime: new Date(activeApplication.disbursement.disbursedAt),
      dueDate,
      currentTime: freezeAt,
      normalInterestCapitalized,
      fixedFeeAmount,
      netDisbursementAmount:
        netDisbursementAmount ?? Number(activeApplication.disbursement.netAmount),
    });
    outstandingAmount = realtime.totalRepayment;
  }
  if (outstandingAmount <= 0) {
    return NextResponse.json({ error: "当前借款没有待还金额" }, { status: 400 });
  }

  if (!isFullPayoffAmount(input.amount, outstandingAmount)) {
    return NextResponse.json(
      { error: `客户端自助还款需要一次性提交当前全部应还金额 ${money(outstandingAmount)}，部分还款请联系管理端人工登记。` },
      { status: 400 }
    );
  }

  const pendingRepayment = await prisma.repayment.findFirst({
    where: {
      planId: plan.id,
      status: {
        in: ["PENDING", "MATCHED", "MANUAL_REVIEW", "PENDING_CONFIRM", "CUSTOMER_CONFIRMED"],
      },
    },
    select: { id: true, repaymentNo: true, status: true },
  });

  if (pendingRepayment) {
    return NextResponse.json(
      {
        error: `当前已有待处理还款 ${pendingRepayment.repaymentNo}，请等待后台处理后再提交新的申请`,
      },
      { status: 409 }
    );
  }

  const repayment = await prisma.repayment.create({
    data: {
      repaymentNo: genRepaymentNo(),
      planId: plan.id,
      amount: input.amount,
      principalPart: 0,
      interestPart: 0,
      feePart: 0,
      penaltyPart: 0,
      paymentMethod: input.paymentMethod,
      status: "MANUAL_REVIEW",
      receivedAt: freezeAt,
      interestFrozenAt: freezeAt,
      frozenPayableAmount: outstandingAmount,
      operatorId: operator.id,
      remark: input.remark || "客户自助提交还款申请",
      matchComment: "客户已发起还款申请，系统已按提交时刻临时暂停新增利息，等待管理端分配并确认",
    },
    select: {
      id: true,
      repaymentNo: true,
      status: true,
      interestFrozenAt: true,
      frozenPayableAmount: true,
    },
  });

  await Promise.all([
    InAppNotificationService.notifyAdmins({
      type: "CLIENT_REPAYMENT_REQUEST_SUBMITTED",
      templateCode: `CLIENT_REPAYMENT_REQUEST_SUBMITTED_${repayment.id}`,
      title: "有新的客户还款申请待处理",
      content: `${customer.name}（${customer.phone}）提交了还款申请 ${repayment.repaymentNo}，金额 ${money(
        input.amount
      )}。系统已按客户提交时刻 ${freezeAt.toLocaleString("zh-CN")} 临时暂停新增利息；若核实未收款，请点未收款，系统会恢复并补算暂停期间。`,
    }),
    InAppNotificationService.notifyCustomer({
      customerId: customer.id,
      type: "REPAYMENT_REQUEST_SUBMITTED",
      templateCode: `REPAYMENT_REQUEST_SUBMITTED_${repayment.id}`,
      title: "还款申请已提交",
      content: `你的还款申请 ${repayment.repaymentNo} 已提交，系统已按提交时刻锁定当前应还 ${money(
        outstandingAmount
      )} 并临时暂停新增利息；已生成利息不变。若后台核实未收款，暂停期间会补算，金额继续实时更新。`,
    }),
  ]);

  return NextResponse.json(repayment);
  });
}
