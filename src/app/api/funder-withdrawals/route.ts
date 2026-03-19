import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FunderInterestService } from "@/services/funder-interest.service";

export const dynamic = "force-dynamic";

/* GET — 管理端查看所有提现申请 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const withdrawals = await prisma.funderWithdrawal.findMany({
    orderBy: { createdAt: "desc" },
    include: { funder: { select: { name: true, cooperationMode: true } } },
  });

  return NextResponse.json(
    withdrawals.map((w) => ({
      id: w.id,
      funderId: w.funderId,
      funderName: w.funder.name,
      cooperationMode: w.funder.cooperationMode,
      amount: Number(w.amount),
      type: w.type,
      status: w.status,
      includeInterest: w.includeInterest,
      interestAmount: Number(w.interestAmount),
      remark: w.remark,
      createdAt: w.createdAt,
      approvedAt: w.approvedAt,
      rejectedReason: w.rejectedReason,
    }))
  );
}

/* PATCH — 审批提现申请 */
export async function PATCH(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { withdrawalId, action, reason } = body;

  if (!withdrawalId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  try {
    if (action === "approve") {
      await FunderInterestService.approveWithdrawal(withdrawalId, session.sub);
    } else {
      await FunderInterestService.rejectWithdrawal(withdrawalId, reason || "管理员拒绝");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "操作失败" },
      { status: 400 }
    );
  }
}
