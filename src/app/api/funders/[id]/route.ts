import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getAdminSession, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["INDIVIDUAL", "COMPANY", "PLATFORM"]).optional(),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  profitShareRatio: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
  remark: z.string().optional(),
  cooperationMode: z.enum(["FIXED_MONTHLY", "VOLUME_BASED"]).optional(),
  monthlyRate: z.number().min(0).max(100).optional(),
  weeklyRate: z.number().min(0).max(100).optional(),
  loginPhone: z.string().min(1).optional(),
  loginPassword: z.string().min(6).optional(),
  priority: z.number().int().min(0).optional(),
  riskSharing: z.boolean().optional(),
  riskShareRatio: z.number().min(0).max(1).optional(),
  withdrawalCooldownDays: z.number().int().min(0).optional(),
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
  const funder = await prisma.funder.findFirst({
    where: { id, deletedAt: null },
    include: {
      accounts: {
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          accountName: true,
          bankName: true,
          accountNo: true,
          balance: true,
          totalInflow: true,
          totalOutflow: true,
          totalProfit: true,
        },
      },
    },
  });

  if (!funder) {
    return NextResponse.json({ error: "资金方不存在" }, { status: 404 });
  }

  return NextResponse.json({
    ...funder,
    profitShareRatio: funder.profitShareRatio ? Number(funder.profitShareRatio) : null,
    monthlyRate: Number(funder.monthlyRate),
    weeklyRate: Number(funder.weeklyRate),
    riskShareRatio: Number(funder.riskShareRatio),
    passwordHash: undefined,
    accounts: funder.accounts.map((account) => ({
      ...account,
      balance: Number(account.balance),
      totalInflow: Number(account.totalInflow),
      totalOutflow: Number(account.totalOutflow),
      totalProfit: Number(account.totalProfit),
    })),
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.funder.findFirst({ where: { id, deletedAt: null } });
  if (!existing) {
    return NextResponse.json({ error: "资金方不存在" }, { status: 404 });
  }

  if (parsed.data.name || parsed.data.loginPhone) {
    const duplicate = await prisma.funder.findFirst({
      where: {
        id: { not: id },
        deletedAt: null,
        OR: [
          parsed.data.name ? { name: parsed.data.name } : undefined,
          parsed.data.loginPhone ? { loginPhone: parsed.data.loginPhone } : undefined,
        ].filter(Boolean) as any,
      },
    });

    if (duplicate) {
      return NextResponse.json({ error: "资金方名称或登录手机号已存在" }, { status: 409 });
    }
  }

  const { loginPassword, ...updateFields } = parsed.data;
  const updateData: Record<string, unknown> = { ...updateFields };
  if (loginPassword) {
    updateData.passwordHash = await bcrypt.hash(loginPassword, 10);
  }

  const updated = await prisma.funder.update({
    where: { id },
    data: updateData as never,
  });

  return NextResponse.json({
    ...updated,
    profitShareRatio: updated.profitShareRatio ? Number(updated.profitShareRatio) : null,
    monthlyRate: Number(updated.monthlyRate),
    weeklyRate: Number(updated.weeklyRate),
    riskShareRatio: Number(updated.riskShareRatio),
    passwordHash: undefined,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const existing = await prisma.funder.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "资金方不存在" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.fundAccount.updateMany({
      where: { funderId: id, isActive: true },
      data: { isActive: false },
    });

    await tx.funder.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        loginPhone: null,
        passwordHash: null,
      },
    });
  });

  return NextResponse.json({ success: true });
}
