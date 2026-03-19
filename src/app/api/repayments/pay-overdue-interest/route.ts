/**
 * POST /api/repayments/pay-overdue-interest
 * 支付逾期每日利息（防止利息变本金）
 *
 * body: { overdueRecordId: string, date: string (YYYY-MM-DD), amount: number }
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { writeLedgerEntry } from "@/services/ledger.service";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const payInterestSchema = z.object({
  overdueRecordId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
});

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = payInterestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten() },
      { status: 400 }
    );
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

  // 解析逾期明细
  let detail: { dailyRecords?: Array<{ day: number; date: string; paid: boolean; [k: string]: unknown }>; paidDates?: string[]; [k: string]: unknown } = {};
  if (record.overdueFeeDetail) {
    try {
      detail = JSON.parse(record.overdueFeeDetail);
    } catch { /* ignore */ }
  }

  // 标记该日已付
  const dailyRecords = detail.dailyRecords ?? [];
  const targetDay = dailyRecords.find((r) => r.date === date);
  if (targetDay) {
    targetDay.paid = true;
    targetDay.capitalizedAmount = 0;
    targetDay.principalAtEnd = targetDay.principalAtStart;
  }

  // 更新 paidDates 列表
  const paidDates = new Set<string>(detail.paidDates ?? []);
  paidDates.add(date);
  detail.paidDates = Array.from(paidDates);
  detail.dailyRecords = dailyRecords;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 更新逾期记录
    await tx.overdueRecord.update({
      where: { id: overdueRecordId },
      data: {
        overdueFeeDetail: JSON.stringify(detail),
      },
    });

    // 台账记账: 逾期利息收入
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
    changeSummary: `支付逾期日利息 ${amount} 元 (${date})`,
  }).catch((e) => console.error("[AuditLog] pay-overdue-interest", e));

  return NextResponse.json({
    id: overdueRecordId,
    paidDate: date,
    amount,
  });
}
