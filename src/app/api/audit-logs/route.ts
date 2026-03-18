import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requirePermission(["audit:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const pagination = parsePagination(url);
  const entityType = url.searchParams.get("entityType") ?? undefined;
  const entityId = url.searchParams.get("entityId") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;
  const userId = url.searchParams.get("userId") ?? undefined;

  const where: Prisma.AuditLogWhereInput = {
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(action ? { action } : {}),
    ...(userId ? { userId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, username: true, realName: true } },
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(items, total, pagination));
}
