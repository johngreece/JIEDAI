import { NextResponse } from "next/server";
import { getAdminSession, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function requireSuperAdminSession() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return session;
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ accountId: string; inflowId: string }> }
) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const { accountId, inflowId } = await params;

  const [account, inflow] = await Promise.all([
    prisma.fundAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        accountName: true,
        balance: true,
      },
    }),
    prisma.capitalInflow.findFirst({
      where: {
        id: inflowId,
        fundAccountId: accountId,
      },
    }),
  ]);

  if (!account) {
    return NextResponse.json({ error: "Fund account not found" }, { status: 404 });
  }

  if (!inflow) {
    return NextResponse.json({ error: "Capital inflow not found" }, { status: 404 });
  }

  const inflowAmount = Number(inflow.amount);
  const currentBalance = Number(account.balance);

  if (currentBalance < inflowAmount) {
    return NextResponse.json(
      { error: "Current account balance is lower than this inflow amount, so the record cannot be deleted safely." },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.fundAccountJournal.deleteMany({
      where: {
        fundAccountId: accountId,
        referenceType: "capital_inflow",
        referenceId: inflowId,
      },
    });

    await tx.capitalInflow.delete({
      where: { id: inflowId },
    });

    await tx.fundAccount.update({
      where: { id: accountId },
      data: {
        balance: { decrement: inflow.amount },
        totalInflow: { decrement: inflow.amount },
      },
    });
  });

  await writeAuditLog({
    userId: session.sub,
    action: "delete",
    entityType: "capital_inflow",
    entityId: inflowId,
    oldValue: {
      fundAccountId: accountId,
      accountName: account.accountName,
      amount: inflowAmount,
      channel: inflow.channel,
      status: inflow.status,
    },
    newValue: {
      balanceAfter: Number((currentBalance - inflowAmount).toFixed(2)),
    },
    changeSummary: "Delete capital inflow",
  }).catch(() => undefined);

  return NextResponse.json({
    success: true,
    balance: Number((currentBalance - inflowAmount).toFixed(2)),
  });
}
