import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/auth";
import { ClientNotificationService } from "@/services/client-notification.service";

export const dynamic = "force-dynamic";

function toClientAction(notification: {
  type: string;
  templateCode: string | null;
}) {
  if (notification.type === "REPAYMENT_CONFIRM") {
    const repaymentId = notification.templateCode?.replace("CLIENT_PENDING_CONFIRM_", "") ?? "";
    if (repaymentId) {
      return {
        actionUrl: `/client/sign/repayment/${repaymentId}`,
        actionLabel: "去确认付款",
      };
    }
  }

  if (["REPAYMENT_DUE_SOON", "REPAYMENT_DUE_TODAY", "REPAYMENT_OVERDUE"].includes(notification.type)) {
    return {
      actionUrl: "/client/repayments?focus=current",
      actionLabel: "去处理还款",
    };
  }

  if (notification.type === "REPAYMENT_PENDING_RECEIPT") {
    return {
      actionUrl: "/client/repayments?focus=pending-receipt",
      actionLabel: "查看确认状态",
    };
  }

  if (notification.type === "DISBURSEMENT_RECEIVED") {
    return {
      actionUrl: "/client/dashboard",
      actionLabel: "查看当前借款",
    };
  }

  if (
    [
      "LOAN_APPLICATION_SUBMITTED",
      "LOAN_APPLICATION_UNDER_APPROVAL",
      "LOAN_APPLICATION_APPROVED",
      "LOAN_APPLICATION_REJECTED",
    ].includes(notification.type)
  ) {
    return {
      actionUrl: "/client/dashboard",
      actionLabel: "查看借款进度",
    };
  }

  if (notification.type === "REPAYMENT_REQUEST_SUBMITTED") {
    return {
      actionUrl: "/client/repayments",
      actionLabel: "查看还款进度",
    };
  }

  return {
    actionUrl: "/client/dashboard",
    actionLabel: "立即查看",
  };
}

export async function GET(req: NextRequest) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  await ClientNotificationService.syncForCustomer(session.sub);

  const [notifications, unread] = await Promise.all([
    ClientNotificationService.list(session.sub, limit),
    ClientNotificationService.unreadCount(session.sub),
  ]);

  return NextResponse.json({
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      ...toClientAction(notification),
    })),
    unread,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.all) {
    await ClientNotificationService.markAllRead(session.sub);
    return NextResponse.json({ ok: true });
  }

  if (body.id) {
    await ClientNotificationService.markRead(session.sub, body.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "请提供 id 或 all 参数" }, { status: 400 });
}
