import { NextResponse } from "next/server";
import { z } from "zod";
import { isSuperAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { checkIdempotencyKey, getScopedIdempotencyKey, saveIdempotencyResult } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeFundAccountLedgerEntryAndUpdateAccount } from "@/services/fund-account-ledger.service";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  amount: z.number().positive(),
  channel: z.string().min(1).default("BANK_TRANSFER"),
  inflowDate: z.string().datetime().optional(),
  remark: z.string().max(500).optional(),
});

async function requireSuperAdminSession(requiredPermissions: string[]) {
  const session = await requirePermission(requiredPermissions);
  if (session instanceof Response) return session;
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return session;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdminSession(["ledger:view"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const inflows = await prisma.capitalInflow.findMany({
    where: { fundAccountId: id },
    orderBy: { inflowDate: "desc" },
    take: 20,
  });

  const inflowIds = inflows.map((item) => item.id);
  const attachments = inflowIds.length
    ? await prisma.attachment.findMany({
        where: {
          entityType: "capital_inflow",
          entityId: { in: inflowIds },
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          entityId: true,
          fileName: true,
          fileUrl: true,
          fileSize: true,
          mimeType: true,
          category: true,
          createdAt: true,
        },
      })
    : [];

  const proofsByInflowId = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const current = proofsByInflowId.get(attachment.entityId) ?? [];
    current.push(attachment);
    proofsByInflowId.set(attachment.entityId, current);
  }

  return NextResponse.json({
    items: inflows.map((item) => ({
      ...item,
      amount: Number(item.amount),
      proofs: proofsByInflowId.get(item.id) ?? [],
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdminSession(["settings:edit"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const idemKey = getScopedIdempotencyKey(req, ["admin", session.sub, "capital-inflow-direct", id]);
  const cached = await checkIdempotencyKey(idemKey);
  if (cached) return NextResponse.json(cached);

  const account = await prisma.fundAccount.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!account || !account.isActive) {
    return NextResponse.json({ error: "资金账户不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const inflowDate = parsed.data.inflowDate ? new Date(parsed.data.inflowDate) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    const inflow = await tx.capitalInflow.create({
      data: {
        fundAccountId: id,
        amount: parsed.data.amount,
        channel: parsed.data.channel,
        inflowDate,
        status: "CONFIRMED",
        remark: parsed.data.remark,
      },
    });

    const ledgerResult = await writeFundAccountLedgerEntryAndUpdateAccount(tx, {
      fundAccountId: id,
      type: "CAPITAL_INFLOW",
      direction: "CREDIT",
      amount: parsed.data.amount,
      totalInflowDelta: parsed.data.amount,
      referenceType: "capital_inflow",
      referenceId: inflow.id,
      operatorId: session.sub,
      description: `Capital injected via ${parsed.data.channel}`,
      metadata: {
        channel: parsed.data.channel,
        inflowDate: inflowDate.toISOString(),
        remark: parsed.data.remark ?? null,
      },
    });

    return { inflow, accountUpdate: ledgerResult.account };
  });

  await writeAuditLog({
    userId: session.sub,
    action: "confirm",
    entityType: "capital_inflow",
    entityId: result.inflow.id,
    newValue: {
      fundAccountId: id,
      amount: Number(result.inflow.amount),
      channel: result.inflow.channel,
      status: result.inflow.status,
      balanceAfter: Number(result.accountUpdate.balance),
    },
    changeSummary: "Create and immediately confirm capital inflow from admin portal",
  }).catch((error) => console.error("[AuditLog] capital-inflow-direct-confirm", error));

  const responseBody = {
    inflow: {
      ...result.inflow,
      amount: Number(result.inflow.amount),
    },
    account: {
      id: result.accountUpdate.id,
      balance: Number(result.accountUpdate.balance),
      totalInflow: Number(result.accountUpdate.totalInflow),
    },
  };
  await saveIdempotencyResult(idemKey, responseBody);

  return NextResponse.json(responseBody, { status: 201 });
}
