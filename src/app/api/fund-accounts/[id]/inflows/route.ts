import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  amount: z.number().positive(),
  channel: z.string().min(1).default("BANK_TRANSFER"),
  inflowDate: z.string().datetime().optional(),
  remark: z.string().max(500).optional(),
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
  const inflows = await prisma.capitalInflow.findMany({
    where: { fundAccountId: id },
    orderBy: { inflowDate: "desc" },
    take: 20,
  });

  return NextResponse.json({
    items: inflows.map((item) => ({
      ...item,
      amount: Number(item.amount),
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const account = await prisma.fundAccount.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!account || !account.isActive) {
    return NextResponse.json({ error: "资金账户不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const inflowDate = parsed.data.inflowDate ? new Date(parsed.data.inflowDate) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const inflow = await tx.capitalInflow.create({
      data: {
        fundAccountId: id,
        amount: parsed.data.amount,
        channel: parsed.data.channel,
        inflowDate,
        status: "CONFIRMED",
        remark: parsed.data.remark,
      },
    });

    const accountUpdate = await tx.fundAccount.update({
      where: { id },
      data: {
        balance: { increment: parsed.data.amount },
        totalInflow: { increment: parsed.data.amount },
      },
    });

    return { inflow, accountUpdate };
  });

  return NextResponse.json(
    {
      inflow: {
        ...result.inflow,
        amount: Number(result.inflow.amount),
      },
      account: {
        id: result.accountUpdate.id,
        balance: Number(result.accountUpdate.balance),
        totalInflow: Number(result.accountUpdate.totalInflow),
      },
    },
    { status: 201 }
  );
}
