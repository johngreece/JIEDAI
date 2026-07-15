import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { serializeProofAttachment } from "@/lib/proof-attachment";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requirePermission(["repayment:view"]);
  if (session instanceof Response) return session;

  const list = await prisma.repayment.findMany({
    where: { status: { in: ["PENDING_CONFIRM", "CUSTOMER_CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
    include: {
      plan: { select: { id: true, planNo: true, applicationId: true } },
      allocations: { select: { id: true, itemId: true, amount: true, type: true } },
    },
    take: 200,
  });

  const appIds = list.map((x) => x.plan.applicationId);
  const apps = appIds.length
    ? await prisma.loanApplication.findMany({
        where: { id: { in: appIds } },
        select: {
          id: true,
          applicationNo: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      })
    : [];
  const appMap = new Map(apps.map((x) => [x.id, x]));
  const proofs = list.length
    ? await prisma.attachment.findMany({
        where: {
          entityType: "repayment",
          entityId: { in: list.map((item) => item.id) },
          category: "REPAYMENT_PAYMENT_PROOF",
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
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
  const proofMap = new Map(
    proofs.map((proof) => [proof.entityId, serializeProofAttachment(proof)]),
  );

  return NextResponse.json({
    items: list.map((x) => ({
      id: x.id,
      repaymentNo: x.repaymentNo,
      amount: Number(x.amount),
      status: x.status,
      paymentMethod: x.paymentMethod,
      transactionId: x.transactionId,
      payerBank: x.payerBank,
      payerAccount: x.payerAccount,
      proof: proofMap.get(x.id) ?? null,
      receivedAt: x.receivedAt,
      plan: x.plan,
      application: appMap.get(x.plan.applicationId) ?? null,
      allocations: x.allocations.map((a) => ({ ...a, amount: Number(a.amount) })),
    })),
  });
}
