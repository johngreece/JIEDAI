import { NextResponse } from "next/server";
import Decimal from "decimal.js";
import { isSuperAdmin } from "@/lib/auth";
import { OPEN_DISBURSEMENT_STATUSES, OPEN_FUNDER_WITHDRAWAL_STATUSES } from "@/lib/business-status";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

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
  const existing = await prisma.fundAccount.findUnique({
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
    return NextResponse.json({ error: "资金账户不存在" }, { status: 404 });
  }

  if (!new Decimal(existing.balance.toString()).isZero()) {
    return NextResponse.json({ error: "资金账户余额未清零，不能停用" }, { status: 409 });
  }

  const [openDisbursements, pendingInflows, openWithdrawals] = await Promise.all([
    prisma.disbursement.count({
      where: {
        fundAccountId: id,
        status: { in: [...OPEN_DISBURSEMENT_STATUSES] },
      },
    }),
    prisma.capitalInflow.count({
      where: {
        fundAccountId: id,
        status: "PENDING",
      },
    }),
    prisma.funderWithdrawal.count({
      where: {
        accountId: id,
        status: { in: [...OPEN_FUNDER_WITHDRAWAL_STATUSES] },
      },
    }),
  ]);

  if (openDisbursements > 0 || pendingInflows > 0 || openWithdrawals > 0) {
    return NextResponse.json(
      {
        error: "资金账户仍有未完结的放款、入金或提现流程，不能停用",
        openDisbursements,
        pendingInflows,
        openWithdrawals,
      },
      { status: 409 },
    );
  }

  await prisma.fundAccount.update({
    where: { id },
    data: { isActive: false },
  });

  await writeAuditLog({
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
  }).catch((error) => console.error("[AuditLog] fund-account-deactivate", error));

  return NextResponse.json({ success: true, mode: "deactivated" });
}
