import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isClient } from "@/lib/auth";
import { verifyContractSignAccessToken } from "@/lib/contract-sign-session";
import { ensureActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  signatureData: z.string(),
  accessToken: z.string().optional(),
  signChannel: z.enum(["mobile-direct", "mobile-qr"]).default("mobile-direct"),
  confirmations: z.object({
    readAllTerms: z.boolean(),
    confirmCapitalizedInterest: z.boolean(),
    confirmLegalFee: z.boolean(),
  }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  if (!isClient(session)) {
    return NextResponse.json({ error: "只有客户本人可以签署该合同" }, { status: 403 });
  }

  const activeClientSession = await ensureActiveClientSession(session);
  if (activeClientSession instanceof Response) return activeClientSession;

  const { id: contractId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (
    !parsed.data.confirmations.readAllTerms ||
    !parsed.data.confirmations.confirmCapitalizedInterest ||
    !parsed.data.confirmations.confirmLegalFee
  ) {
    return NextResponse.json({ error: "请先完成关键条款确认" }, { status: 400 });
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

  if (contract.customerId !== session.sub) {
    return NextResponse.json({ error: "无权签署该合同" }, { status: 403 });
  }

  if (parsed.data.accessToken) {
    try {
      const tokenPayload = await verifyContractSignAccessToken(parsed.data.accessToken);
      if (tokenPayload.contractId !== contractId || tokenPayload.customerId !== session.sub) {
        return NextResponse.json({ error: "签署令牌无效" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "签署令牌已失效" }, { status: 403 });
    }
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const deviceInfo = req.headers.get("user-agent") ?? undefined;
  const signerName = session.name;
  const now = new Date();
  const contractHash = createHash("sha256").update(contract.content).digest("hex");

  await prisma.$transaction(async (tx) => {
    await tx.signature.create({
      data: {
        contractId,
        signerType: "customer",
        signerName,
        signatureData: parsed.data.signatureData,
        ipAddress: ip,
        deviceInfo,
        locationInfo: JSON.stringify({
          contractHash,
          signChannel: parsed.data.signChannel,
          confirmations: parsed.data.confirmations,
          signedPortal: session.portal,
        }),
        signedAt: now,
      },
    });

    await tx.contract.update({
      where: { id: contractId },
      data: { status: "SIGNED", signedAt: now },
    });

    if (contract.contractType === "MAIN") {
      await tx.loanApplication.update({
        where: { id: contract.applicationId },
        data: { status: "CONTRACTED" },
      });
    }
  });

  return NextResponse.json({ ok: true, signedAt: now.toISOString() });
}
