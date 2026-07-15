import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeProofAttachment } from "@/lib/proof-attachment";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission(["inflow:view"]);
  if (session instanceof Response) return session;

  const [inflows, accounts] = await Promise.all([
    prisma.capitalInflow.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 300,
      include: {
        fundAccount: {
          select: {
            id: true,
            accountName: true,
            bankName: true,
            accountNo: true,
            funder: { select: { id: true, name: true } },
          },
        },
        reviewedBy: { select: { id: true, realName: true } },
      },
    }),
    prisma.fundAccount.findMany({
      where: { isActive: true, funder: { isActive: true, deletedAt: null } },
      orderBy: [{ funder: { name: "asc" } }, { accountName: "asc" }],
      select: {
        id: true,
        accountName: true,
        bankName: true,
        accountNo: true,
        balance: true,
        funder: { select: { id: true, name: true } },
      },
    }),
  ]);

  const inflowIds = inflows.map((item) => item.id);
  const proofs = inflowIds.length
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

  const proofsByInflowId = new Map<string, typeof proofs>();
  for (const proof of proofs) {
    const current = proofsByInflowId.get(proof.entityId) ?? [];
    current.push(proof);
    proofsByInflowId.set(proof.entityId, current);
  }

  return NextResponse.json({
    items: inflows.map((item) => ({
      id: item.id,
      amount: Number(item.amount),
      channel: item.channel,
      transactionId: item.transactionId,
      senderBank: item.senderBank,
      senderAccount: item.senderAccount,
      inflowDate: item.inflowDate,
      status: item.status,
      remark: item.remark,
      reviewedAt: item.reviewedAt,
      reviewedBy: item.reviewedBy,
      createdAt: item.createdAt,
      fundAccount: item.fundAccount,
      proofs: (proofsByInflowId.get(item.id) ?? []).map(serializeProofAttachment),
    })),
    accounts: accounts.map((account) => ({ ...account, balance: Number(account.balance) })),
  });
}
