import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/rbac";
import { writeFundAccountLedgerEntryAndUpdateAccount } from "@/services/fund-account-ledger.service";
import { FunderNotificationService } from "@/services/funder-notification.service";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  action: z.enum(["confirm", "reject"]),
  reason: z.string().trim().max(500).optional(),
  inflowDate: z.string().datetime().optional(),
});

async function requireSuperAdminSession() {
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return session;
}

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; inflowId: string }> },
) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const { id: accountId, inflowId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const inflow = await prisma.capitalInflow.findFirst({
    where: {
      id: inflowId,
      fundAccountId: accountId,
    },
    include: {
      fundAccount: {
        select: {
          id: true,
          accountName: true,
          funderId: true,
        },
      },
    },
  });

  if (!inflow) {
    return NextResponse.json({ error: "Capital inflow not found" }, { status: 404 });
  }

  if (parsed.data.action === "reject") {
    if (inflow.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "Confirmed capital inflow cannot be rejected; cancel it to create a reversal journal." },
        { status: 409 },
      );
    }

    if (inflow.status === "CANCELLED") {
      return NextResponse.json({ error: "Capital inflow already cancelled" }, { status: 409 });
    }

    const reason = parsed.data.reason || "Rejected by finance reviewer";
    const claimed = await prisma.capitalInflow.updateMany({
      where: { id: inflowId, status: inflow.status },
      data: {
        status: "CANCELLED",
        remark: inflow.remark ? `${inflow.remark}\n${reason}` : reason,
      },
    });
    if (claimed.count !== 1) {
      return NextResponse.json({ error: "Capital inflow status changed, please refresh and retry" }, { status: 409 });
    }
    const cancelled = await prisma.capitalInflow.findUniqueOrThrow({ where: { id: inflowId } });

    await Promise.all([
      writeAuditLog({
        userId: session.sub,
        action: "reject",
        entityType: "capital_inflow",
        entityId: inflowId,
        oldValue: {
          status: inflow.status,
          amount: Number(inflow.amount),
          fundAccountId: accountId,
        },
        newValue: {
          status: cancelled.status,
          reason,
        },
        changeSummary: "Reject pending capital inflow request",
      }).catch((error) => console.error("[AuditLog] capital-inflow-reject", error)),
      FunderNotificationService.send(
        inflow.fundAccount.funderId,
        "CAPITAL_INFLOW_REJECTED",
        "入金申请已驳回",
        `你提交的 ${money(Number(inflow.amount))} 入金申请未通过审核。原因：${reason}`,
      ),
    ]);

    return NextResponse.json({
      success: true,
      status: cancelled.status,
    });
  }

  if (inflow.status === "CONFIRMED") {
    return NextResponse.json({ error: "Capital inflow already confirmed" }, { status: 409 });
  }

  if (inflow.status === "CANCELLED") {
    return NextResponse.json({ error: "Cancelled capital inflow cannot be confirmed" }, { status: 409 });
  }

  const confirmedInflowDate = parsed.data.inflowDate ? new Date(parsed.data.inflowDate) : inflow.inflowDate;

  let result: {
    confirmed: {
      id: string;
      amount: unknown;
      status: string;
    };
    accountUpdate: { balance: unknown; totalInflow: unknown };
  };

  try {
    result = await prisma.$transaction(async (tx) => {
      const existingJournal = await tx.fundAccountJournal.findFirst({
        where: {
          referenceType: "capital_inflow",
          referenceId: inflowId,
        },
        select: { id: true },
      });

      if (existingJournal) {
        throw new Error("Capital inflow already has a ledger journal");
      }

      const claimed = await tx.capitalInflow.updateMany({
        where: { id: inflowId, status: inflow.status },
        data: {
          status: "CONFIRMED",
          inflowDate: confirmedInflowDate,
        },
      });
      if (claimed.count !== 1) {
        throw new Error("Capital inflow status changed, please refresh and retry");
      }

      const confirmed = await tx.capitalInflow.findUniqueOrThrow({
        where: { id: inflowId },
      });

      const ledgerResult = await writeFundAccountLedgerEntryAndUpdateAccount(tx, {
        fundAccountId: accountId,
        type: "CAPITAL_INFLOW",
        direction: "CREDIT",
        amount: confirmed.amount,
        totalInflowDelta: confirmed.amount,
        referenceType: "capital_inflow",
        referenceId: confirmed.id,
        operatorId: session.sub,
        description: `Capital inflow confirmed via ${confirmed.channel}`,
        metadata: {
          channel: confirmed.channel,
          inflowDate: confirmed.inflowDate.toISOString(),
          reviewedFromStatus: inflow.status,
        },
      });

      return { confirmed, accountUpdate: ledgerResult.account };
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Capital inflow confirmation failed" },
      { status: 409 },
    );
  }

  await Promise.all([
    writeAuditLog({
      userId: session.sub,
      action: "confirm",
      entityType: "capital_inflow",
      entityId: inflowId,
      oldValue: {
        status: inflow.status,
        amount: Number(inflow.amount),
        fundAccountId: accountId,
      },
      newValue: {
        status: result.confirmed.status,
        balanceAfter: Number(result.accountUpdate.balance),
      },
      changeSummary: "Confirm pending capital inflow and credit fund account",
    }).catch((error) => console.error("[AuditLog] capital-inflow-confirm", error)),
    FunderNotificationService.send(
      inflow.fundAccount.funderId,
      "CAPITAL_INFLOW_CONFIRMED",
      "入金已确认到账",
      `你提交的 ${money(Number(result.confirmed.amount))} 入金申请已确认，账户 ${inflow.fundAccount.accountName} 已增加可用余额。`,
    ),
  ]);

  return NextResponse.json({
    success: true,
    status: result.confirmed.status,
    balance: Number(result.accountUpdate.balance),
    totalInflow: Number(result.accountUpdate.totalInflow),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; inflowId: string }> },
) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const { id: accountId, inflowId } = await params;

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

  if (inflow.status === "CANCELLED") {
    return NextResponse.json({ error: "Capital inflow already cancelled" }, { status: 409 });
  }

  const inflowAmount = Number(inflow.amount);
  const currentBalance = Number(account.balance);
  const shouldReverseBalance = inflow.status === "CONFIRMED";

  if (shouldReverseBalance && currentBalance < inflowAmount) {
    return NextResponse.json(
      { error: "Current account balance is lower than this inflow amount, so the inflow cannot be reversed safely." },
      { status: 409 },
    );
  }

  let result: {
    cancelled: { id: string; status: string };
    accountUpdate: { id: string; balance: unknown; totalInflow?: unknown };
  };

  try {
    result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.capitalInflow.updateMany({
        where: { id: inflowId, status: inflow.status },
        data: {
          status: "CANCELLED",
          remark: inflow.remark
            ? `${inflow.remark}\nCancelled by operator`
            : "Cancelled by operator",
        },
      });
      if (claimed.count !== 1) {
        throw new Error("Capital inflow status changed, please refresh and retry");
      }
      const cancelled = await tx.capitalInflow.findUniqueOrThrow({ where: { id: inflowId } });

      if (shouldReverseBalance) {
        const ledgerResult = await writeFundAccountLedgerEntryAndUpdateAccount(tx, {
          fundAccountId: accountId,
          type: "ADJUSTMENT",
          direction: "DEBIT",
          amount: inflow.amount,
          totalInflowDelta: Number(inflow.amount) * -1,
          referenceType: "capital_inflow_reversal",
          referenceId: inflowId,
          operatorId: session.sub,
          description: "Reverse cancelled capital inflow",
          metadata: {
            originalReferenceType: "capital_inflow",
            originalReferenceId: inflowId,
            channel: inflow.channel,
          },
        });

        return { cancelled, accountUpdate: ledgerResult.account };
      }

      return { cancelled, accountUpdate: account };
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Capital inflow cancellation failed" },
      { status: 409 },
    );
  }

  await writeAuditLog({
    userId: session.sub,
    action: "cancel",
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
      status: result.cancelled.status,
      balanceAfter: Number(result.accountUpdate.balance),
    },
    changeSummary: "Cancel capital inflow and write reversal journal when needed",
  }).catch(() => undefined);

  return NextResponse.json({
    success: true,
    status: result.cancelled.status,
    balance: Number(result.accountUpdate.balance),
  });
}
