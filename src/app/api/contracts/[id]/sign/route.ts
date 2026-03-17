import { NextRequest, NextResponse } from "next/server";
import { getSession, isClient } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";

const bodySchema = z.object({
  signatureData: z.string(),
  signerType: z.string().default("customer"),
  signerName: z.string().default(""),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id: contractId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
  });
  if (!contract) {
    return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  }
  if (contract.status !== "DRAFT" && contract.status !== "PENDING_SIGN") {
    return NextResponse.json({ error: "合同已签署或已作废" }, { status: 400 });
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const deviceInfo = req.headers.get("user-agent") ?? undefined;
  const signerName = isClient(session) ? session.name : parsed.data.signerName;

  const now = new Date();
  await prisma.$transaction([
    prisma.signature.create({
      data: {
        contractId,
        signerType: parsed.data.signerType,
        signerName,
        signatureData: parsed.data.signatureData,
        ipAddress: ip,
        deviceInfo,
        signedAt: now,
      },
    }),
    prisma.contract.update({
      where: { id: contractId },
      data: { status: "SIGNED", signedAt: now },
    }),
  ]);

  await writeAuditLog({
    userId: session.sub,
    action: "sign",
    entityType: "contract",
    entityId: contractId,
    newValue: { signerType: parsed.data.signerType },
    ipAddress: ip,
    userAgent: deviceInfo,
  });

  return NextResponse.json({ ok: true, signedAt: now.toISOString() });
}
