import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1),
  ruleType: z.string().min(1),
  rateType: z.enum(["FIXED", "PERCENTAGE"]),
  rateValue: z.number().min(0),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  conditionJson: z.string().optional(),
  priority: z.number().int().min(0).default(0),
  effectiveFrom: z.string().transform((s) => new Date(s)),
  effectiveTo: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const rules = await prisma.pricingRule.findMany({
    where: { productId: id, isActive: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    items: rules.map((r) => ({
      ...r,
      rateValue: Number(r.rateValue),
      minValue: r.minValue ? Number(r.minValue) : null,
      maxValue: r.maxValue ? Number(r.maxValue) : null,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const product = await prisma.loanProduct.findFirst({ where: { id, deletedAt: null } });
  if (!product) return NextResponse.json({ error: "产品不存在" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const rule = await prisma.pricingRule.create({
    data: {
      ...parsed.data,
      productId: id,
      createdById: session.sub,
    },
  });

  return NextResponse.json({
    ...rule,
    rateValue: Number(rule.rateValue),
    minValue: rule.minValue ? Number(rule.minValue) : null,
    maxValue: rule.maxValue ? Number(rule.maxValue) : null,
  }, { status: 201 });
}
