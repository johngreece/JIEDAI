import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function toAdminAction(type: string) {
  if (type === "CLIENT_LOAN_APPLICATION_SUBMITTED") {
    return {
      actionUrl: "/admin/loan-applications",
      actionLabel: "处理借款申请",
    };
  }

  if (type === "CLIENT_REPAYMENT_REQUEST_SUBMITTED") {
    return {
      actionUrl: "/admin/repayments",
      actionLabel: "核对还款",
    };
  }

  if (type === "FUNDER_CAPITAL_INFLOW_REQUESTED") {
    return {
      actionUrl: "/admin/funders",
      actionLabel: "审核入金",
    };
  }

  if (type === "FUNDER_INTEREST_DUE") {
    return {
      actionUrl: "/admin/funder-interest-settlements?status=DUE",
      actionLabel: "去发布结算",
    };
  }

  if (type === "FUNDER_INTEREST_DISPUTED" || type === "FUNDER_INTEREST_REJECTED") {
    return {
      actionUrl: "/admin/funder-interest-settlements?status=FUNDER_DISPUTED",
      actionLabel: "处理结算异议",
    };
  }

  if (type === "FUNDER_INTEREST_CONFIRMED") {
    return {
      actionUrl: "/admin/funder-interest-settlements?status=CONFIRMED_BY_FUNDER",
      actionLabel: "查看确认记录",
    };
  }

  if (type === "FINANCE_RECONCILIATION_DIFFERENCE") {
    return {
      actionUrl: "/admin/finance-reconciliation",
      actionLabel: "处理对账差异",
    };
  }

  return {
    actionUrl: "/admin/dashboard",
    actionLabel: "查看工作台",
  };
}

export async function GET(req: Request) {
  const session = await requireAdmin();
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: session.sub },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        templateCode: true,
        isRead: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId: session.sub, isRead: false },
    }),
  ]);

  return NextResponse.json({
    notifications: notifications.map((notification) => ({
      ...notification,
      ...toAdminAction(notification.type),
    })),
    unread,
  });
}

export async function PATCH(req: Request) {
  const session = await requireAdmin();
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));

  if (body.all) {
    await prisma.notification.updateMany({
      where: { userId: session.sub, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.id) {
    await prisma.notification.updateMany({
      where: { id: body.id, userId: session.sub },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Please provide id or all" }, { status: 400 });
}
