import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  accountName: z.string().min(1),
  bankName: z.string().min(1),
  accountNo: z.string().min(1),
});

async function requireSuperAdminSession() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return session;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const accounts = await prisma.fundAccount.findMany({
    where: { funderId: id, isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    items: accounts.map((account) => ({
      ...account,
      balance: Number(account.balance),
      totalInflow: Number(account.totalInflow),
      totalOutflow: Number(account.totalOutflow),
      totalProfit: Number(account.totalProfit),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const funder = await prisma.funder.findFirst({ where: { id, deletedAt: null } });
  if (!funder) {
    return NextResponse.json({ error: "资金方不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const duplicate = await prisma.fundAccount.findFirst({
    where: { accountNo: parsed.data.accountNo },
    select: { id: true },
  });

  if (duplicate) {
    return NextResponse.json({ error: "资金账户号已存在" }, { status: 409 });
  }

  const account = await prisma.fundAccount.create({
    data: {
      ...parsed.data,
      funderId: id,
    },
  });

  return NextResponse.json(
    {
      ...account,
      balance: Number(account.balance),
      totalInflow: Number(account.totalInflow),
      totalOutflow: Number(account.totalOutflow),
      totalProfit: Number(account.totalProfit),
    },
    { status: 201 }
  );
}
