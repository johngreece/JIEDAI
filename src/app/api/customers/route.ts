import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requirePermission(["customer:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const pagination = parsePagination(url);
  const keyword = url.searchParams.get("keyword")?.trim();
  const riskLevel = url.searchParams.get("riskLevel");

  const where: Record<string, unknown> = { deletedAt: null };

  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { phone: { contains: keyword } },
      { idNumber: { contains: keyword } },
    ];
  }
  if (riskLevel) {
    where.riskLevel = riskLevel;
  }

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        idType: true,
        idNumber: true,
        email: true,
        riskLevel: true,
        weeklyInterestRateOverride: true,
        source: true,
        createdAt: true,
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.customer.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(
    items.map((item) => ({
      ...item,
      weeklyInterestRateOverride:
        item.weeklyInterestRateOverride != null ? Number(item.weeklyInterestRateOverride) : null,
    })),
    total,
    pagination,
  ));
}
