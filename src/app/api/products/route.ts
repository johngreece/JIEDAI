import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  minAmount: z.number().positive(),
  maxAmount: z.number().positive(),
  minTermValue: z.number().int().positive(),
  maxTermValue: z.number().int().positive(),
  termUnit: z.enum(["DAY", "MONTH"]).default("MONTH"),
  repaymentMethod: z.enum(["ONE_TIME", "EQUAL_INSTALLMENT", "EQUAL_PRINCIPAL"]),
  allowEarlyRepay: z.boolean().default(true),
  allowExtension: z.boolean().default(false),
  maxExtensionTimes: z.number().int().min(0).default(0),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const url = new URL(req.url);
  const pagination = parsePagination(url);
  const isActive = url.searchParams.get("isActive");

  const where = {
    deletedAt: null,
    ...(isActive !== null ? { isActive: isActive === "true" } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.loanProduct.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toPrismaArgs(pagination),
    }),
    prisma.loanProduct.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(
    items.map((p) => ({
      ...p,
      minAmount: Number(p.minAmount),
      maxAmount: Number(p.maxAmount),
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

  const existing = await prisma.loanProduct.findFirst({
    where: { OR: [{ name: parsed.data.name }, { code: parsed.data.code }], deletedAt: null },
  });
  if (existing) {
    return NextResponse.json({ error: "产品名称或编码已存在" }, { status: 409 });
  }

  const product = await prisma.loanProduct.create({ data: parsed.data });

  return NextResponse.json({ ...product, minAmount: Number(product.minAmount), maxAmount: Number(product.maxAmount) }, { status: 201 });
}
