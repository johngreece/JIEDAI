import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLogInTransaction } from "@/lib/audit";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { formatMoney as money } from "@/lib/system-config";
import { writeFundAccountLedgerEntryAndUpdateAccount } from "@/services/fund-account-ledger.service";
import { FunderNotificationService } from "@/services/funder-notification.service";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  action: z.enum(["confirm", "reject"]),
  reason: z.string().trim().max(500).optional(),
  inflowDate: z.string().datetime().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; inflowId: string }> },
) {
  const session = await requirePermission(["inflow:review"]);
  if (session instanceof Response) return session;

  const { id: accountId, inflowId } = await params;
  const idemKey = getScopedIdempotencyKey(req, [
    "admin",
    session.sub,
    "capital-inflow-review",
    accountId,
    inflowId,
  ]);

  return withIdempotencyResponse(idemKey, async () => {
    const body = await req.json().catch(() => ({}));
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid review request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const inflow = await prisma.capitalInflow.findFirst({
      where: { id: inflowId, fundAccountId: accountId },
      include: {
        fundAccount: { select: { id: true, accountName: true, funderId: true } },
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
      try {
        await prisma.$transaction(async (tx) => {
          const claimed = await tx.capitalInflow.updateMany({
            where: { id: inflowId, status: inflow.status },
            data: {
              status: "CANCELLED",
              remark: inflow.remark ? `${inflow.remark}\n${reason}` : reason,
              reviewedAt: new Date(),
              reviewedById: session.sub,
            },
          });
          if (claimed.count !== 1) throw new Error("CAPITAL_INFLOW_STATUS_CHANGED");

          await writeAuditLogInTransaction(tx, {
            userId: session.sub,
            action: "reject",
            entityType: "capital_inflow",
            entityId: inflowId,
            oldValue: {
              status: inflow.status,
              amount: Number(inflow.amount),
              fundAccountId: accountId,
            },
            newValue: { status: "CANCELLED", reason, reviewedById: session.sub },
            changeSummary: "Reject pending capital inflow request",
          });
        });
      } catch (error) {
        if (error instanceof Error && error.message === "CAPITAL_INFLOW_STATUS_CHANGED") {
          return NextResponse.json(
            { error: "Capital inflow status changed, please refresh and retry" },
            { status: 409 },
          );
        }
        throw error;
      }

      await FunderNotificationService.send(
        inflow.fundAccount.funderId,
        "CAPITAL_INFLOW_REJECTED",
        "Capital inflow request rejected",
        `Your ${money(Number(inflow.amount))} capital inflow request was rejected. Reason: ${reason}`,
      ).catch((error) => console.error("Failed to notify rejected capital inflow", error));

      return NextResponse.json({ success: true, status: "CANCELLED" });
    }

    if (inflow.status === "CONFIRMED") {
      return NextResponse.json({ error: "Capital inflow already confirmed" }, { status: 409 });
    }
    if (inflow.status === "CANCELLED") {
      return NextResponse.json({ error: "Cancelled capital inflow cannot be confirmed" }, { status: 409 });
    }

    const confirmedInflowDate = parsed.data.inflowDate
      ? new Date(parsed.data.inflowDate)
      : inflow.inflowDate;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const [existingJournal, proofCount] = await Promise.all([
          tx.fundAccountJournal.findFirst({
            where: { referenceType: "capital_inflow", referenceId: inflowId },
            select: { id: true },
          }),
          tx.attachment.count({
            where: { entityType: "capital_inflow", entityId: inflowId, deletedAt: null },
          }),
        ]);
        if (existingJournal) throw new Error("Capital inflow already has a ledger journal");
        if (proofCount === 0) throw new Error("Capital inflow bank evidence is missing");

        const claimed = await tx.capitalInflow.updateMany({
          where: { id: inflowId, status: inflow.status },
          data: {
            status: "CONFIRMED",
            inflowDate: confirmedInflowDate,
            reviewedAt: new Date(),
            reviewedById: session.sub,
          },
        });
        if (claimed.count !== 1) {
          throw new Error("Capital inflow status changed, please refresh and retry");
        }

        const confirmed = await tx.capitalInflow.findUniqueOrThrow({ where: { id: inflowId } });
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
            transactionId: confirmed.transactionId,
            senderBank: confirmed.senderBank,
            senderAccount: confirmed.senderAccount,
            inflowDate: confirmed.inflowDate.toISOString(),
            reviewedFromStatus: inflow.status,
          },
        });

        await writeAuditLogInTransaction(tx, {
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
            status: confirmed.status,
            transactionId: confirmed.transactionId,
            reviewedById: session.sub,
            balanceAfter: Number(ledgerResult.account.balance),
          },
          changeSummary: "Confirm pending capital inflow with bank evidence and credit fund account",
        });

        return { confirmed, accountUpdate: ledgerResult.account };
      });

      await FunderNotificationService.send(
        inflow.fundAccount.funderId,
        "CAPITAL_INFLOW_CONFIRMED",
        "Capital inflow confirmed",
        `Your ${money(Number(result.confirmed.amount))} capital inflow was confirmed for ${inflow.fundAccount.accountName}.`,
      ).catch((error) => console.error("Failed to notify confirmed capital inflow", error));

      return NextResponse.json({
        success: true,
        status: result.confirmed.status,
        balance: Number(result.accountUpdate.balance),
        totalInflow: Number(result.accountUpdate.totalInflow),
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Capital inflow confirmation failed" },
        { status: 409 },
      );
    }
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; inflowId: string }> },
) {
  const session = await requirePermission(["inflow:cancel"]);
  if (session instanceof Response) return session;

  const { id: accountId, inflowId } = await params;
  const idemKey = getScopedIdempotencyKey(req, [
    "admin",
    session.sub,
    "capital-inflow-cancel",
    accountId,
    inflowId,
  ]);

  return withIdempotencyResponse(idemKey, async () => {
    const [account, inflow] = await Promise.all([
      prisma.fundAccount.findUnique({
        where: { id: accountId },
        select: { id: true, accountName: true, balance: true },
      }),
      prisma.capitalInflow.findFirst({ where: { id: inflowId, fundAccountId: accountId } }),
    ]);
    if (!account) return NextResponse.json({ error: "Fund account not found" }, { status: 404 });
    if (!inflow) return NextResponse.json({ error: "Capital inflow not found" }, { status: 404 });
    if (inflow.status === "CANCELLED") {
      return NextResponse.json({ error: "Capital inflow already cancelled" }, { status: 409 });
    }

    const inflowAmount = Number(inflow.amount);
    const shouldReverseBalance = inflow.status === "CONFIRMED";
    if (shouldReverseBalance && Number(account.balance) < inflowAmount) {
      return NextResponse.json(
        { error: "Current account balance is lower than this inflow amount, so it cannot be reversed safely." },
        { status: 409 },
      );
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const claimed = await tx.capitalInflow.updateMany({
          where: { id: inflowId, status: inflow.status },
          data: {
            status: "CANCELLED",
            remark: inflow.remark
              ? `${inflow.remark}\nCancelled by operator`
              : "Cancelled by operator",
            reviewedAt: new Date(),
            reviewedById: session.sub,
          },
        });
        if (claimed.count !== 1) {
          throw new Error("Capital inflow status changed, please refresh and retry");
        }

        let accountUpdate: { id: string; balance: unknown; totalInflow?: unknown } = account;
        if (shouldReverseBalance) {
          const ledgerResult = await writeFundAccountLedgerEntryAndUpdateAccount(tx, {
            fundAccountId: accountId,
            type: "ADJUSTMENT",
            direction: "DEBIT",
            amount: inflow.amount,
            totalInflowDelta: inflowAmount * -1,
            referenceType: "capital_inflow_reversal",
            referenceId: inflowId,
            operatorId: session.sub,
            description: "Reverse cancelled capital inflow",
            metadata: {
              originalReferenceType: "capital_inflow",
              originalReferenceId: inflowId,
              transactionId: inflow.transactionId,
              channel: inflow.channel,
            },
          });
          accountUpdate = ledgerResult.account;
        }

        await writeAuditLogInTransaction(tx, {
          userId: session.sub,
          action: "cancel",
          entityType: "capital_inflow",
          entityId: inflowId,
          oldValue: {
            fundAccountId: accountId,
            accountName: account.accountName,
            amount: inflowAmount,
            transactionId: inflow.transactionId,
            status: inflow.status,
          },
          newValue: {
            status: "CANCELLED",
            reviewedById: session.sub,
            balanceAfter: Number(accountUpdate.balance),
          },
          changeSummary: "Cancel capital inflow and write reversal journal when needed",
        });

        return { accountUpdate };
      });

      return NextResponse.json({
        success: true,
        status: "CANCELLED",
        balance: Number(result.accountUpdate.balance),
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Capital inflow cancellation failed" },
        { status: 409 },
      );
    }
  });
}
