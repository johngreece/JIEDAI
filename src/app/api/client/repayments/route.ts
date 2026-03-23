import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InAppNotificationService } from "@/services/in-app-notification.service";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(["BANK_TRANSFER", "CASH", "ONLINE"]).default("BANK_TRANSFER"),
  remark: z.string().trim().max(500).optional(),
});

function genRepaymentNo() {
  return `RPY${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export async function POST(req: NextRequest) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;

  const [customer, activeApplication, operator] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, phone: true, deletedAt: true },
    }),
    prisma.loanApplication.findFirst({
      where: {
        customerId: session.sub,
        deletedAt: null,
        status: {
          notIn: ["SETTLED", "COMPLETED", "REJECTED"],
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        applicationNo: true,
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
    include: {
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

  const outstandingAmount = plan.scheduleItems.reduce((sum, item) => sum + Number(item.remaining), 0);
  if (outstandingAmount <= 0) {
    return NextResponse.json({ error: "当前借款没有待还金额" }, { status: 400 });
  }

  if (input.amount - outstandingAmount > 0.000001) {
    return NextResponse.json(
      { error: `申请还款金额不能超过当前待还金额 ${money(outstandingAmount)}` },
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
      receivedAt: new Date(),
      operatorId: operator.id,
      remark: input.remark || "客户自助提交还款申请",
      matchComment: "客户已发起还款申请，等待管理端分配并确认",
    },
    select: {
      id: true,
      repaymentNo: true,
      status: true,
    },
  });

  await Promise.all([
    InAppNotificationService.notifyAdmins({
      type: "CLIENT_REPAYMENT_REQUEST_SUBMITTED",
      templateCode: `CLIENT_REPAYMENT_REQUEST_SUBMITTED_${repayment.id}`,
      title: "有新的客户还款申请待处理",
      content: `${customer.name}（${customer.phone}）提交了还款申请 ${repayment.repaymentNo}，金额 ${money(
        input.amount
      )}，请尽快进入管理端分配并核实到账。`,
    }),
    InAppNotificationService.notifyCustomer({
      customerId: customer.id,
      type: "REPAYMENT_REQUEST_SUBMITTED",
      templateCode: `REPAYMENT_REQUEST_SUBMITTED_${repayment.id}`,
      title: "还款申请已提交",
      content: `你的还款申请 ${repayment.repaymentNo} 已提交，后台会先核对并分配到对应账期，再继续到账确认。`,
    }),
  ]);

  return NextResponse.json(repayment);
}
