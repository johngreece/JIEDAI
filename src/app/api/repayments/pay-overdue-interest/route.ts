import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLogInTransaction } from "@/lib/audit";
import { buildOverdueInterestLedgerReferenceId } from "@/lib/ledger-reference";
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

  let result: {
    overdueAmount: number;
    penaltyAmount: number;
  };

  try {
    result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM overdue_records WHERE id = ${overdueRecordId} FOR UPDATE
        `;

        const record = await tx.overdueRecord.findUnique({
          where: { id: overdueRecordId },
        });

        if (!record) {
          throw new Error("OVERDUE_RECORD_NOT_FOUND");
        }

        if (record.status !== "OVERDUE") {
          throw new Error("OVERDUE_RECORD_RESOLVED");
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
        if (paidDates.has(date)) {
          throw new Error("OVERDUE_INTEREST_DATE_PAID");
        }
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
          referenceId: buildOverdueInterestLedgerReferenceId(overdueRecordId, date),
          customerId: record.customerId,
          operatorId: session.sub,
          description: `逾期日利息支付 (${date})`,
        });

        await writeAuditLogInTransaction(tx, {
          userId: session.sub,
          action: "pay_overdue_interest",
          entityType: "overdue_record",
          entityId: overdueRecordId,
          oldValue: {
            status: record.status,
            overdueAmount: Number(record.overdueAmount),
            penaltyAmount: Number(record.penaltyAmount),
          },
          newValue: {
            date,
            amount,
            overdueAmount: breakdown.totalOutstanding,
            penaltyAmount: breakdown.outstandingPenalty,
          },
          changeSummary: `支付逾期日利息 ${amount} 欧 (${date})`,
        });

        return {
          overdueAmount: breakdown.totalOutstanding,
          penaltyAmount: breakdown.outstandingPenalty,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "OVERDUE_RECORD_NOT_FOUND") {
      return NextResponse.json({ error: "逾期记录不存在" }, { status: 404 });
    }
    if (message === "OVERDUE_RECORD_RESOLVED") {
      return NextResponse.json({ error: "该逾期记录已解除" }, { status: 400 });
    }
    if (message === "OVERDUE_INTEREST_DATE_PAID" || (error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "该日期的逾期日利息已支付，不能重复入账" }, { status: 409 });
    }
    return NextResponse.json({ error: "逾期日利息支付失败" }, { status: 500 });
  }

  return NextResponse.json({
    id: overdueRecordId,
    paidDate: date,
    amount,
    overdueAmount: result.overdueAmount,
    penaltyAmount: result.penaltyAmount,
  });
}
