import { NextRequest, NextResponse } from "next/server";
import { getFunderSession } from "@/lib/auth";
import { FunderInterestService } from "@/services/funder-interest.service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* GET — 获取提现记录 */
export async function GET() {
  const session = await getFunderSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const funder = await prisma.funder.findUnique({
    where: { id: session.sub },
    select: {
      cooperationMode: true,
      monthlyRate: true,
      weeklyRate: true,
      withdrawalCooldownDays: true,
    },
  });

  const withdrawals = await prisma.funderWithdrawal.findMany({
    where: { funderId: session.sub },
    orderBy: { createdAt: "desc" },
  });

  const earnings = await FunderInterestService.getEarnings(session.sub);

  return NextResponse.json({
    funder: funder
      ? {
          cooperationMode: funder.cooperationMode,
          monthlyRate: Number(funder.monthlyRate),
          weeklyRate: Number(funder.weeklyRate),
          withdrawalCooldownDays: funder.withdrawalCooldownDays,
        }
      : null,
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amount: Number(w.amount),
      type: w.type,
      status: w.status,
      includeInterest: w.includeInterest,
      interestAmount: Number(w.interestAmount),
      remark: w.remark,
      createdAt: w.createdAt,
      approvedAt: w.approvedAt,
      rejectedReason: w.rejectedReason,
    })),
    withdrawableInterest: earnings.withdrawableInterest,
    withdrawablePrincipal: earnings.withdrawablePrincipal,
  });
}

/* POST — 发起提现申请 */
export async function POST(req: NextRequest) {
  const session = await getFunderSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { amount, type, includeInterest, remark } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "金额必须大于0" }, { status: 400 });
  }
  if (!["PRINCIPAL", "INTEREST", "PRINCIPAL_AND_INTEREST"].includes(type)) {
    return NextResponse.json({ error: "无效的提现类型" }, { status: 400 });
  }

  try {
    const withdrawal = await FunderInterestService.requestWithdrawal({
      funderId: session.sub,
      amount: Number(amount),
      type,
      includeInterest: includeInterest ?? type !== "PRINCIPAL",
      remark,
    });

    return NextResponse.json({
      id: withdrawal.id,
      amount: Number(withdrawal.amount),
      status: withdrawal.status,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "提现失败" },
      { status: 400 }
    );
  }
}
