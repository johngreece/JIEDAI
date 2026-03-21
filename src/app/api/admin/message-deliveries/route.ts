import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { parsePagination, paginatedResponse, toPrismaArgs } from "@/lib/pagination";
import { MessageDeliveryService } from "@/services/message-delivery.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requirePermission(["audit:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const pagination = parsePagination(url);
  const status = url.searchParams.get("status") ?? undefined;
  const channel = url.searchParams.get("channel") ?? undefined;
  const provider = url.searchParams.get("provider") ?? undefined;
  const q = url.searchParams.get("q")?.trim() ?? "";

  const where: Prisma.MessageDeliveryWhereInput = {
    ...(status ? { status } : {}),
    ...(channel ? { channel } : {}),
    ...(provider ? { provider } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
            { targetName: { contains: q, mode: "insensitive" } },
            { targetId: { contains: q, mode: "insensitive" } },
            { templateCode: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.messageDelivery.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        attempts: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.messageDelivery.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(items, total, pagination));
}

export async function POST(req: Request) {
  const session = await requirePermission(["audit:view"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));

  if (body.action === "retry_due") {
    const result = await MessageDeliveryService.processRetryQueue(
      Number(body.limit ?? 20),
      Boolean(body.ignoreSchedule ?? true)
    );
    return NextResponse.json({ ok: true, result });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
