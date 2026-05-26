import { NextRequest, NextResponse } from "next/server";
import { requireActiveFunderSession } from "@/lib/portal-session";
import { FunderNotificationService } from "@/services/funder-notification.service";

export const dynamic = "force-dynamic";

function toFunderAction(type: string) {
  if (type === "WITHDRAWABLE_INTEREST") {
    return {
      actionUrl: "/funder/interest-settlements",
      actionLabel: "查看收益",
    };
  }

  if (type === "FUNDER_INTEREST_PAID") {
    return {
      actionUrl: "/funder/interest-settlements",
      actionLabel: "确认到账",
    };
  }

  if (type === "PRINCIPAL_RETURN_SOON") {
    return {
      actionUrl: "/funder/withdrawals?open=1&type=PRINCIPAL&prefill=withdrawable-principal",
      actionLabel: "查看回款",
    };
  }

  if (type === "CAPITAL_INFLOW_CONFIRMED" || type === "CAPITAL_INFLOW_REJECTED") {
    return {
      actionUrl: "/funder/inflows",
      actionLabel: "查看入金",
    };
  }

  if (type === "WITHDRAWAL_APPROVED" || type === "WITHDRAWAL_REJECTED") {
    return {
      actionUrl: "/funder/withdrawals",
      actionLabel: "查看提现",
    };
  }

  return {
    actionUrl: "/funder/dashboard?focus=settlement",
    actionLabel: "查看详情",
  };
}

export async function GET(req: NextRequest) {
  const session = await requireActiveFunderSession();
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  await FunderNotificationService.scanInterestMaturity();

  const [notifications, unread] = await Promise.all([
    FunderNotificationService.list(session.sub, limit),
    FunderNotificationService.unreadCount(session.sub),
  ]);

  return NextResponse.json({
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      ...toFunderAction(notification.type),
    })),
    unread,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await requireActiveFunderSession();
  if (session instanceof Response) return session;

  const body = await req.json();

  if (body.all) {
    await FunderNotificationService.markAllRead(session.sub);
    return NextResponse.json({ ok: true });
  }

  if (body.id) {
    await FunderNotificationService.markRead(session.sub, body.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "请提供 id 或 all 参数" }, { status: 400 });
}
