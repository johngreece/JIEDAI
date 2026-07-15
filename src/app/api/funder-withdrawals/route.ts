import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FunderInterestService } from "@/services/funder-interest.service";
import { FunderNotificationService } from "@/services/funder-notification.service";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import { requirePermission } from "@/lib/rbac";
import { formatMoney as money } from "@/lib/system-config";

export const dynamic = "force-dynamic";

/* GET — 管理端查看所有提现申请 */
export async function GET() {
  const session = await requirePermission(["ledger:view"]);
  if (session instanceof Response) return session;

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
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const { withdrawalId, action, reason } = body;

  if (!withdrawalId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const idemKey = getScopedIdempotencyKey(req, ["admin", session.sub, "funder-withdrawal-review", withdrawalId, action]);
  return withIdempotencyResponse(idemKey, async () => {

  try {
    let result;
    if (action === "approve") {
      result = await FunderInterestService.approveWithdrawal(withdrawalId, session.sub);
      await FunderNotificationService.send(
        result.funderId,
        "WITHDRAWAL_APPROVED",
        "提现申请已通过",
        `你的提现申请 ${money(result.amount)} 已通过审核，资金账户已完成出账登记。`,
      ).catch((error) => console.error("[FunderWithdrawal] approve notification", error));
    } else {
      result = await FunderInterestService.rejectWithdrawal(
        withdrawalId,
        session.sub,
        reason || "管理员拒绝",
      );
      await FunderNotificationService.send(
        result.funderId,
        "WITHDRAWAL_REJECTED",
        "提现申请已拒绝",
        `你的提现申请 ${money(Number(result.amount))} 未通过审核。原因：${result.rejectedReason || reason || "管理员拒绝"}`,
      ).catch((error) => console.error("[FunderWithdrawal] reject notification", error));
    }
    const responseBody = { ok: true, result };
    return NextResponse.json(responseBody);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "操作失败" },
      { status: 400 }
    );
  }
  });
}
