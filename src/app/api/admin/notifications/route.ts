import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

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

  return NextResponse.json({ notifications, unread });
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
