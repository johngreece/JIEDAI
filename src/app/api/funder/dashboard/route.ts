import { NextResponse } from "next/server";
import { requireActiveFunderSession } from "@/lib/portal-session";
import { describeFunderRule } from "@/lib/funder-cooperation";
import { prisma } from "@/lib/prisma";
import { FunderInterestService } from "@/services/funder-interest.service";
import { FunderInterestSettlementService } from "@/services/funder-interest-settlement.service";
import { serializeProofAttachment } from "@/lib/proof-attachment";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireActiveFunderSession();
  if (session instanceof Response) return session;

  const funder = await prisma.funder.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      cooperationMode: true,
      monthlyRate: true,
      weeklyRate: true,
      withdrawalCooldownDays: true,
      profitShareRatio: true,
      accounts: {
        where: { isActive: true },
        select: {
          id: true,
          accountName: true,
          bankName: true,
          balance: true,
          totalInflow: true,
          totalOutflow: true,
          totalProfit: true,
        },
      },
    },
  });

  if (!funder) {
    return NextResponse.json({ error: "资金方不存在" }, { status: 404 });
  }

  const earnings = await FunderInterestService.getEarnings(session.sub);
  const interestSettlements = await FunderInterestSettlementService.listForFunder(session.sub);

  const withdrawals = await prisma.funderWithdrawal.findMany({
    where: { funderId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const accountIds = funder.accounts.map((account) => account.id);
  const recentDisbursements = accountIds.length
    ? await prisma.disbursement.findMany({
        where: { fundAccountId: { in: accountIds } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          disbursementNo: true,
          amount: true,
          netAmount: true,
          feeAmount: true,
          status: true,
          disbursedAt: true,
          batchNo: true,
          payerBank: true,
          payerAccount: true,
          application: {
            select: {
              customer: { select: { name: true } },
            },
          },
        },
      })
    : [];
  const recentDisbursementIds = recentDisbursements.map((item) => item.id);
  const disbursementProofs = recentDisbursementIds.length
    ? await prisma.attachment.findMany({
        where: {
          entityType: "disbursement",
          entityId: { in: recentDisbursementIds },
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          entityId: true,
          fileName: true,
          fileUrl: true,
          mimeType: true,
          createdAt: true,
        },
      })
    : [];
  const proofsByDisbursementId = new Map<string, typeof disbursementProofs>();
  for (const proof of disbursementProofs) {
    const current = proofsByDisbursementId.get(proof.entityId) ?? [];
    current.push(proof);
    proofsByDisbursementId.set(proof.entityId, current);
  }

  const ruleGuide = describeFunderRule({
    cooperationMode: funder.cooperationMode,
    monthlyRate: Number(funder.monthlyRate),
    weeklyRate: Number(funder.weeklyRate),
    profitShareRatio: Number(funder.profitShareRatio || 0),
  });

  return NextResponse.json({
    funder: {
      ...funder,
      monthlyRate: Number(funder.monthlyRate),
      weeklyRate: Number(funder.weeklyRate),
      profitShareRatio: Number(funder.profitShareRatio || 0),
      accounts: funder.accounts.map((account) => ({
        ...account,
        balance: Number(account.balance),
        totalInflow: Number(account.totalInflow),
        totalOutflow: Number(account.totalOutflow),
        totalProfit: Number(account.totalProfit),
      })),
    },
    earnings,
    interestSettlements: interestSettlements.slice(0, 8),
    interestSettlementSummary: FunderInterestSettlementService.summarize(interestSettlements),
    ruleGuide,
    withdrawals: withdrawals.map((item) => ({
      id: item.id,
      amount: Number(item.amount),
      type: item.type,
      status: item.status,
      includeInterest: item.includeInterest,
      interestAmount: Number(item.interestAmount),
      remark: item.remark,
      createdAt: item.createdAt,
      approvedAt: item.approvedAt,
      rejectedReason: item.rejectedReason,
    })),
    recentDisbursements: recentDisbursements.map((item) => ({
      id: item.id,
      disbursementNo: item.disbursementNo,
      amount: Number(item.amount),
      netAmount: Number(item.netAmount),
      feeAmount: Number(item.feeAmount),
      status: item.status,
      disbursedAt: item.disbursedAt,
      transactionId: item.batchNo,
      payerBank: item.payerBank,
      payerAccount: item.payerAccount,
      proofs: (proofsByDisbursementId.get(item.id) ?? []).map(serializeProofAttachment),
      customerName: item.application?.customer?.name ?? "-",
    })),
  });
}
