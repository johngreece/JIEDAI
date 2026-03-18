import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

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
        source: true,
        createdAt: true,
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.customer.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(items, total, pagination));
}
