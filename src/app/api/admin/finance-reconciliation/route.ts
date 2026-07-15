import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { FinanceReconciliationService } from "@/services/finance-reconciliation.service";

export const dynamic = "force-dynamic";

function serializeRun<T extends { summaryJson: string | null }>(run: T) {
  return {
    ...run,
    summary: run.summaryJson ? JSON.parse(run.summaryJson) : null,
    summaryJson: undefined,
  };
}

export async function GET(req: Request) {
  const session = await requirePermission(["ledger:view"]);
  if (session instanceof Response) return session;

  const requestedRunId = new URL(req.url).searchParams.get("runId");
  const runs = await prisma.financeReconciliationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const selectedRunId = requestedRunId ?? runs[0]?.id;
  const selectedRun = selectedRunId
    ? await prisma.financeReconciliationRun.findUnique({
        where: { id: selectedRunId },
        include: {
          findings: {
            orderBy: [{ status: "asc" }, { severity: "asc" }, { createdAt: "asc" }],
          },
        },
      })
    : null;

  return NextResponse.json({
    runs: runs.map(serializeRun),
    selectedRun: selectedRun ? serializeRun(selectedRun) : null,
  });
}

export async function POST() {
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;

  try {
    const run = await FinanceReconciliationService.runManual(session.sub);
    if (!run) {
      return NextResponse.json({ error: "对账批次创建失败" }, { status: 500 });
    }

    await writeAuditLog({
      userId: session.sub,
      action: "reconcile",
      entityType: "finance_reconciliation",
      entityId: run.id,
      newValue: {
        status: run.status,
        findingCount: run.findingCount,
        openFindingCount: run.openFindingCount,
      },
      changeSummary: "执行全历史资金对账扫描",
    });

    return NextResponse.json({ ok: true, run: serializeRun(run) });
  } catch (error) {
    return NextResponse.json(
      {
        error: "资金对账执行失败",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
