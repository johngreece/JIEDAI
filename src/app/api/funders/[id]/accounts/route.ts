import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  accountName: z.string().min(1),
  bankName: z.string().min(1),
  accountNo: z.string().min(1),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const accounts = await prisma.fundAccount.findMany({
    where: { funderId: id, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    items: accounts.map((a) => ({
      ...a,
      balance: Number(a.balance),
      totalInflow: Number(a.totalInflow),
      totalOutflow: Number(a.totalOutflow),
      totalProfit: Number(a.totalProfit),
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
  const funder = await prisma.funder.findFirst({ where: { id, deletedAt: null } });
  if (!funder) return NextResponse.json({ error: "资金方不存在" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const dup = await prisma.fundAccount.findFirst({ where: { accountNo: parsed.data.accountNo } });
  if (dup) return NextResponse.json({ error: "账号已存在" }, { status: 409 });

  const account = await prisma.fundAccount.create({
    data: { ...parsed.data, funderId: id },
  });

  return NextResponse.json({
    ...account,
    balance: Number(account.balance),
    totalInflow: Number(account.totalInflow),
    totalOutflow: Number(account.totalOutflow),
    totalProfit: Number(account.totalProfit),
  }, { status: 201 });
}
