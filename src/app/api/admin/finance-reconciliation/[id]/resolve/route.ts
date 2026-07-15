import { NextResponse } from "next/server";
import { z } from "zod";

import { writeAuditLogInTransaction } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const resolutionSchema = z.object({
  status: z.enum(["RESOLVED", "IGNORED"]),
  note: z.string().trim().min(3).max(1000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;

  const parsed = resolutionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "请提供处理结果和至少 3 个字符的说明" },
      { status: 400 },
    );
  }

  const { id } = await params;
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.financeReconciliationFinding.findUnique({
      where: { id },
      include: { run: { select: { id: true, openFindingCount: true } } },
    });
    if (!current) return { state: "missing" as const };

    const claimed = await tx.financeReconciliationFinding.updateMany({
      where: { id, status: "OPEN" },
      data: {
        status: parsed.data.status,
        resolutionNote: parsed.data.note,
        resolvedById: session.sub,
        resolvedAt: new Date(),
      },
    });
    if (claimed.count !== 1) return { state: "conflict" as const };

    const finding = await tx.financeReconciliationFinding.findUniqueOrThrow({
      where: { id },
    });

    await tx.financeReconciliationRun.update({
      where: { id: current.run.id },
      data: {
        openFindingCount: { decrement: current.run.openFindingCount > 0 ? 1 : 0 },
      },
    });

    await writeAuditLogInTransaction(tx, {
      userId: session.sub,
      action: "reconcile",
      entityType: "finance_reconciliation",
      entityId: finding.id,
      oldValue: {
        status: current.status,
        resolutionNote: current.resolutionNote,
      },
      newValue: {
        status: finding.status,
        resolutionNote: finding.resolutionNote,
        runId: current.run.id,
      },
      changeSummary:
        parsed.data.status === "IGNORED" ? "带说明忽略对账差异" : "标记对账差异已处理",
    });

    return { state: "updated" as const, finding };
  });

  if (result.state === "missing") {
    return NextResponse.json({ error: "对账差异不存在" }, { status: 404 });
  }
  if (result.state === "conflict") {
    return NextResponse.json({ error: "该差异已被其他操作处理" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, finding: result.finding });
}
