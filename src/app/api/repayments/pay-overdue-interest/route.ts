import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { writeLedgerEntry } from "@/services/ledger.service";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac";
import { calculateOverdueBreakdown, DEFAULT_OVERDUE, type OverdueConfig } from "@/lib/interest-engine";

export const dynamic = "force-dynamic";

const payInterestSchema = z.object({
  overdueRecordId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
});

type OverdueDetail = {
  baseAmount?: number;
  paidDates?: string[];
  overdueConfig?: OverdueConfig;
  overdueStartDate?: string;
  dailyRecords?: Array<{ date: string; paid?: boolean }>;
};

export async function POST(req: Request) {
  const session = await requirePermission(["repayment:allocate"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = payInterestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const { overdueRecordId, date, amount } = parsed.data;

  const record = await prisma.overdueRecord.findUnique({
    where: { id: overdueRecordId },
  });

  if (!record) {
    return NextResponse.json({ error: "逾期记录不存在" }, { status: 404 });
  }

  if (record.status !== "OVERDUE") {
    return NextResponse.json({ error: "该逾期记录已解除" }, { status: 400 });
  }

  let detail: OverdueDetail = {};
  if (record.overdueFeeDetail) {
    try {
      detail = JSON.parse(record.overdueFeeDetail) as OverdueDetail;
    } catch {
      detail = {};
    }
  }

  const paidDates = new Set(detail.paidDates ?? []);
  paidDates.add(date);
  detail.paidDates = Array.from(paidDates).sort();

  const overdueConfig = detail.overdueConfig ?? DEFAULT_OVERDUE;
  const overdueStartDate = detail.overdueStartDate ? new Date(detail.overdueStartDate) : new Date(record.createdAt.getTime());
  const baseAmount = Number(detail.baseAmount ?? Number(record.overdueAmount) - Number(record.penaltyAmount));
  const breakdown = calculateOverdueBreakdown({
    baseAmount,
    overdueDays: record.overdueDays,
    overdueConfig,
    overdueStartDate,
    paidDates: detail.paidDates,
  });

  detail.dailyRecords = breakdown.dailyRecords;
  detail.baseAmount = baseAmount;
  detail.overdueConfig = overdueConfig;
  detail.overdueStartDate = overdueStartDate.toISOString();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.overdueRecord.update({
      where: { id: overdueRecordId },
      data: {
        overdueAmount: breakdown.totalOutstanding,
        penaltyAmount: breakdown.outstandingPenalty,
        overdueFeeDetail: JSON.stringify(detail),
      },
    });

    await writeLedgerEntry(tx, {
      type: "PENALTY",
      direction: "DEBIT",
      amount,
      referenceType: "overdue_interest",
      referenceId: overdueRecordId,
      customerId: record.customerId,
      operatorId: session.sub,
      description: `逾期日利息支付 (${date})`,
    });
  });

  await writeAuditLog({
    userId: session.sub,
    action: "pay_overdue_interest",
    entityType: "overdue_record",
    entityId: overdueRecordId,
    oldValue: null,
    newValue: { date, amount },
    changeSummary: `支付逾期日利息 ${amount} 欧 (${date})`,
  }).catch((error) => console.error("[AuditLog] pay-overdue-interest", error));

  return NextResponse.json({
    id: overdueRecordId,
    paidDate: date,
    amount,
    overdueAmount: breakdown.totalOutstanding,
    penaltyAmount: breakdown.outstandingPenalty,
  });
}
