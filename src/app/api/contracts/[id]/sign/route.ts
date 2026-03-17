import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";

const bodySchema = z.object({
  signAction: z.enum(["handwrite", "checkbox", "sms_verify", "e_sign"]),
  signImageUrl: z.string().optional(),
  signData: z.record(z.unknown()).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id: contractId } = await params();
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { application: true },
  });
  if (!contract) {
    return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  }
  if (contract.status !== "pending_sign") {
    return NextResponse.json({ error: "合同已签署或已作废" }, { status: 400 });
  }

  const customerId = contract.application.customerId;
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  const now = new Date();
  await prisma.$transaction([
    prisma.signature.create({
      data: {
        contractId,
        signerType: "customer",
        signerUserId: session.sub,
        signerCustomerId: customerId,
        signAction: parsed.data.signAction,
        signData: parsed.data.signData ?? undefined,
        signImageUrl: parsed.data.signImageUrl ?? undefined,
        signedAt: now,
        ipAddress: ip,
        userAgent,
      },
    }),
    prisma.contract.update({
      where: { id: contractId },
      data: { status: "signed", signedAt: now },
    }),
  ]);

  await writeAuditLog({
    userId: session.sub,
    action: "sign",
    entityType: "contract",
    entityId: contractId,
    newValue: { signAction: parsed.data.signAction },
    ipAddress: ip,
    userAgent,
  });

  return NextResponse.json({ ok: true, signedAt: now.toISOString() });
}
