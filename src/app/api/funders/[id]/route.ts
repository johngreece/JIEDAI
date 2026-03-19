import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const funder = await prisma.funder.findFirst({
    where: { id, deletedAt: null },
    include: {
      accounts: {
        where: { isActive: true },
        select: { id: true, accountName: true, bankName: true, accountNo: true, balance: true },
      },
    },
  });
  if (!funder) return NextResponse.json({ error: "资金方不存在" }, { status: 404 });

  return NextResponse.json({
    ...funder,
    profitShareRatio: funder.profitShareRatio ? Number(funder.profitShareRatio) : null,
    monthlyRate: Number(funder.monthlyRate),
    weeklyRate: Number(funder.weeklyRate),
    accounts: funder.accounts.map((a) => ({ ...a, balance: Number(a.balance) })),
    passwordHash: undefined,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.funder.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "资金方不存在" }, { status: 404 });

  if (parsed.data.name && parsed.data.name !== existing.name) {
    const dup = await prisma.funder.findFirst({
      where: { name: parsed.data.name, deletedAt: null, id: { not: id } },
    });
    if (dup) return NextResponse.json({ error: "资金方名称已存在" }, { status: 409 });
  }

  const { loginPassword, ...updateFields } = parsed.data;
  const updateData: Record<string, unknown> = { ...updateFields };
  if (loginPassword) {
    updateData.passwordHash = await bcrypt.hash(loginPassword, 10);
  }

  const updated = await prisma.funder.update({ where: { id }, data: updateData as any });
  return NextResponse.json({
    ...updated,
    profitShareRatio: updated.profitShareRatio ? Number(updated.profitShareRatio) : null,
    monthlyRate: Number(updated.monthlyRate),
    weeklyRate: Number(updated.weeklyRate),
    passwordHash: undefined,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.funder.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "资金方不存在" }, { status: 404 });

  await prisma.funder.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
