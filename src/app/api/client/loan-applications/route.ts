import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InAppNotificationService } from "@/services/in-app-notification.service";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  productId: z.string().min(1),
  amount: z.number().positive(),
  termValue: z.number().int().positive(),
  purpose: z.string().trim().max(200).optional(),
  remark: z.string().trim().max(500).optional(),
});

function genApplicationNo() {
  return `LA${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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

  const [customer, product, activeApplication, fallbackCreator] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: session.sub },
      select: {
        id: true,
        name: true,
        phone: true,
        creditLimit: true,
        creditLimitOverride: true,
        deletedAt: true,
      },
    }),
    prisma.loanProduct.findFirst({
      where: {
        id: input.productId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
        minAmount: true,
        maxAmount: true,
        minTermValue: true,
        maxTermValue: true,
        termUnit: true,
      },
    }),
    prisma.loanApplication.findFirst({
      where: {
        customerId: session.sub,
        deletedAt: null,
        status: {
          notIn: ["SETTLED", "COMPLETED", "REJECTED"],
        },
      },
      select: { id: true, applicationNo: true, status: true },
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

  if (!product) {
    return NextResponse.json({ error: "借款产品不存在或已停用" }, { status: 404 });
  }

  if (product.code !== "UPFRONT_7D") {
    return NextResponse.json(
      { error: "客户端目前仅开放 7 天砍头息模式，其他借款模式仅供内部申请" },
      { status: 403 }
    );
  }

  if (!fallbackCreator) {
    return NextResponse.json({ error: "系统中没有可用的管理账号用于创建申请" }, { status: 500 });
  }

  if (activeApplication) {
    return NextResponse.json(
      {
        error: `你当前已有进行中的借款 ${activeApplication.applicationNo}，请先完成该流程后再申请新借款`,
      },
      { status: 409 }
    );
  }

  const creditLimit = Number(customer.creditLimitOverride ?? customer.creditLimit ?? 0);
  if (input.amount - creditLimit > 0.000001) {
    return NextResponse.json({ error: `申请金额不能超过可借额度 ${money(creditLimit)}` }, { status: 400 });
  }

  if (input.amount + 0.000001 < Number(product.minAmount) || input.amount - Number(product.maxAmount) > 0.000001) {
    return NextResponse.json(
      {
        error: `申请金额需在 ${money(Number(product.minAmount))} 到 ${money(Number(product.maxAmount))} 之间`,
      },
      { status: 400 }
    );
  }

  if (input.termValue < product.minTermValue || input.termValue > product.maxTermValue) {
    return NextResponse.json(
      {
        error: `借款期限需在 ${product.minTermValue} 到 ${product.maxTermValue} 之间`,
      },
      { status: 400 }
    );
  }

  const created = await prisma.loanApplication.create({
    data: {
      applicationNo: genApplicationNo(),
      customerId: customer.id,
      productId: product.id,
      amount: input.amount,
      termValue: input.termValue,
      termUnit: product.termUnit,
      purpose: input.purpose || "客户自助申请",
      remark: input.remark || "客户自助提交借款申请",
      status: "PENDING_RISK",
      createdById: fallbackCreator.id,
    },
    select: {
      id: true,
      applicationNo: true,
      status: true,
    },
  });

  await Promise.all([
    InAppNotificationService.notifyAdmins({
      type: "CLIENT_LOAN_APPLICATION_SUBMITTED",
      templateCode: `CLIENT_LOAN_APPLICATION_SUBMITTED_${created.id}`,
      title: "有新的客户借款申请待处理",
      content: `${customer.name}（${customer.phone}）提交了借款申请 ${created.applicationNo}，金额 ${money(
        input.amount
      )}，请尽快进入管理端处理。`,
    }),
    InAppNotificationService.notifyCustomer({
      customerId: customer.id,
      type: "LOAN_APPLICATION_SUBMITTED",
      templateCode: `LOAN_APPLICATION_SUBMITTED_${created.id}`,
      title: "借款申请已提交",
      content: `你的借款申请 ${created.applicationNo} 已提交，当前状态为待风控，请留意后续审批提醒。`,
    }),
  ]);

  return NextResponse.json(created);
}
