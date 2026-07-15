import { NextResponse } from "next/server";
import Decimal from "decimal.js";
import { Prisma } from "@prisma/client";
import { isSuperAdmin } from "@/lib/auth";
import { OPEN_DISBURSEMENT_STATUSES, OPEN_FUNDER_WITHDRAWAL_STATUSES } from "@/lib/business-status";
import { writeAuditLogInTransaction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

class FundAccountDeactivationError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, number>,
  ) {
    super(message);
  }
}

async function requireSuperAdminSession() {
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return session;
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  try {
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.fundAccount.findUnique({
          where: { id },
          select: {
            id: true,
            accountName: true,
            balance: true,
            funderId: true,
            isActive: true,
          },
        });

        if (!existing || !existing.isActive) {
          throw new FundAccountDeactivationError(404, "资金账户不存在");
        }

        if (!new Decimal(existing.balance.toString()).isZero()) {
          throw new FundAccountDeactivationError(409, "资金账户余额未清零，不能停用");
        }

        const [openDisbursements, pendingInflows, openWithdrawals] = await Promise.all([
          tx.disbursement.count({
            where: {
              fundAccountId: id,
              status: { in: [...OPEN_DISBURSEMENT_STATUSES] },
            },
          }),
          tx.capitalInflow.count({
            where: {
              fundAccountId: id,
              status: "PENDING",
            },
          }),
          tx.funderWithdrawal.count({
            where: {
              accountId: id,
              status: { in: [...OPEN_FUNDER_WITHDRAWAL_STATUSES] },
            },
          }),
        ]);

        if (openDisbursements > 0 || pendingInflows > 0 || openWithdrawals > 0) {
          throw new FundAccountDeactivationError(
            409,
            "资金账户仍有未完结的放款、入金或提现流程，不能停用",
            { openDisbursements, pendingInflows, openWithdrawals },
          );
        }

        const claimed = await tx.fundAccount.updateMany({
          where: { id, isActive: true, balance: existing.balance },
          data: { isActive: false },
        });
        if (claimed.count !== 1) {
          throw new FundAccountDeactivationError(409, "资金账户状态或余额已变化，请刷新后重试");
        }

        await writeAuditLogInTransaction(tx, {
          userId: session.sub,
          action: "update",
          entityType: "fund_account",
          entityId: id,
          oldValue: {
            accountName: existing.accountName,
            funderId: existing.funderId,
            balance: Number(existing.balance),
            isActive: true,
          },
          newValue: { isActive: false },
          changeSummary: "Deactivate zero-balance fund account after open-flow checks",
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof FundAccountDeactivationError) {
      return NextResponse.json(
        { error: error.message, ...error.details },
        { status: error.status },
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "资金账户数据正在变化，请刷新后重试" },
        { status: 409 },
      );
    }
    console.error("[fund-account-deactivate]", error);
    return NextResponse.json({ error: "资金账户停用失败" }, { status: 500 });
  }

  return NextResponse.json({ success: true, mode: "deactivated" });
}
