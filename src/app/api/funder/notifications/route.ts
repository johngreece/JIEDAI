import { NextRequest, NextResponse } from "next/server";
import { getFunderSession } from "@/lib/auth";
import { FunderNotificationService } from "@/services/funder-notification.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/funder/notifications?limit=50
 * 获取资金方通知列表
 */
export async function GET(req: NextRequest) {
  const session = await getFunderSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  const [notifications, unread] = await Promise.all([
    FunderNotificationService.list(session.sub, limit),
    FunderNotificationService.unreadCount(session.sub),
  ]);

  return NextResponse.json({ notifications, unread });
}

/**
 * PATCH /api/funder/notifications  body: { id?: string, all?: boolean }
 * 标记已读（单条或全部）
 */
export async function PATCH(req: NextRequest) {
  const session = await getFunderSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

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
