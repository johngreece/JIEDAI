import { NextRequest, NextResponse } from "next/server";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import { requireActiveFunderSession } from "@/lib/portal-session";
import { FunderInterestService } from "@/services/funder-interest.service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/* GET — 获取提现记录 */
export async function GET() {
  const session = await requireActiveFunderSession();
  if (session instanceof Response) return session;

  const funder = await prisma.funder.findUnique({
    where: { id: session.sub },
    select: {
      cooperationMode: true,
      monthlyRate: true,
      weeklyRate: true,
      profitShareRatio: true,
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
          profitShareRatio: Number(funder.profitShareRatio || 0),
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
  const session = await requireActiveFunderSession();
  if (session instanceof Response) return session;

  const idemKey = getScopedIdempotencyKey(req, ["funder", session.sub, "withdrawal"]);
  return withIdempotencyResponse(idemKey, async () => {

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

    const result = {
      id: withdrawal.id,
      amount: Number(withdrawal.amount),
      status: withdrawal.status,
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "提现失败" },
      { status: 400 }
    );
  }
  });
}
