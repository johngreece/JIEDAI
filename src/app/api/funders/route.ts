import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["INDIVIDUAL", "COMPANY", "PLATFORM"]).default("INDIVIDUAL"),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  profitShareRatio: z.number().min(0).max(1).optional(),
  remark: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const url = new URL(req.url);
  const pagination = parsePagination(url);
  const isActive = url.searchParams.get("isActive");

  const where: Record<string, unknown> = { deletedAt: null };
  if (isActive !== null) where.isActive = isActive === "true";

  const [items, total] = await Promise.all([
    prisma.funder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { accounts: true } } },
      ...toPrismaArgs(pagination),
    }),
    prisma.funder.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(
    items.map((f) => ({
      ...f,
      profitShareRatio: f.profitShareRatio ? Number(f.profitShareRatio) : null,
      accountCount: f._count.accounts,
      _count: undefined,
    })),
    total,
    pagination,
  ));
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const dup = await prisma.funder.findFirst({
    where: { name: parsed.data.name, deletedAt: null },
  });
  if (dup) return NextResponse.json({ error: "资金方名称已存在" }, { status: 409 });

  const funder = await prisma.funder.create({ data: parsed.data });
  return NextResponse.json({
    ...funder,
    profitShareRatio: funder.profitShareRatio ? Number(funder.profitShareRatio) : null,
  }, { status: 201 });
}
