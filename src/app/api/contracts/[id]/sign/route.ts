import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isClient } from "@/lib/auth";
import {
  formatClientProfileCompletionError,
  getClientProfileCompletion,
  serializeClientProfileCompletion,
} from "@/lib/client-profile";
import { verifyContractSignAccessToken } from "@/lib/contract-sign-session";
import {
  isValidSignatureDataUrl,
  stampCustomerSignatureOnContract,
} from "@/lib/contract-signature";
import { ensureActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";
import {
  LoanTransitionConflictError,
  transitionLoanApplication,
} from "@/services/loan-transition.service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  signatureData: z.string().optional(),
  reuseSavedSignature: z.boolean().optional().default(false),
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

  const contract = await prisma.contract.findFirst({
    where: { id: contractId, customerId: session.sub, deletedAt: null },
    include: {
      application: {
        select: { status: true },
      },
    },
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

  if (contract.contractType === "MAIN" && contract.application.status !== "APPROVED") {
    return NextResponse.json(
      { error: "借款申请当前状态不允许签署主合同" },
      { status: 409 }
    );
  }

  const customer = await prisma.customer.findUnique({
    where: { id: session.sub },
    select: {
      phone: true,
      address: true,
      taxNumber: true,
      idNumber: true,
      passportNumber: true,
      residencePermitNumber: true,
      residencePermitExpiry: true,
      profileCompletedAt: true,
      kyc: {
        select: {
          kycType: true,
          documentUrl: true,
          status: true,
          expiresAt: true,
        },
      },
    },
  });
  const profileCompletion = customer ? getClientProfileCompletion(customer) : null;
  if (!profileCompletion?.profileComplete) {
    return NextResponse.json(
      {
        error: profileCompletion
          ? formatClientProfileCompletionError(profileCompletion, "客户资料未完善，不能签署合同")
          : "客户账号不存在",
        profileCompletion: profileCompletion
          ? serializeClientProfileCompletion(profileCompletion)
          : null,
      },
      { status: 409 }
    );
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

  let resolvedSignatureData = parsed.data.signatureData;
  let signatureSource: "new" | "saved" = "new";
  let reusedSignatureSignedAt: Date | null = null;

  if (parsed.data.reuseSavedSignature || !resolvedSignatureData) {
    const savedSignature = await prisma.signature.findFirst({
      where: {
        signerType: "customer",
        contract: { customerId: session.sub },
      },
      orderBy: { signedAt: "desc" },
      select: {
        signatureData: true,
        signedAt: true,
      },
    });

    if (!savedSignature) {
      return NextResponse.json({ error: "请先在手写区签字" }, { status: 400 });
    }

    resolvedSignatureData = savedSignature.signatureData;
    signatureSource = "saved";
    reusedSignatureSignedAt = savedSignature.signedAt;
  }

  if (!isValidSignatureDataUrl(resolvedSignatureData)) {
    return NextResponse.json({ error: "签名图片格式不正确，请重新签名" }, { status: 400 });
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const deviceInfo = req.headers.get("user-agent") ?? undefined;
  const signerName = session.name;
  const now = new Date();
  const contractHash = createHash("sha256").update(contract.content).digest("hex");
  const signedContent = stampCustomerSignatureOnContract(contract.content, {
    signatureData: resolvedSignatureData,
    signerName,
    signedAt: now,
  });

  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.contract.updateMany({
        where: {
          id: contractId,
          customerId: session.sub,
          deletedAt: null,
          status: contract.status,
        },
        data: { status: "SIGNED", signedAt: now, content: signedContent },
      });
      if (claimed.count !== 1) {
        throw new Error("CONTRACT_STATUS_CHANGED");
      }

      await tx.signature.create({
        data: {
          contractId,
          signerType: "customer",
          signerName,
          signatureData: resolvedSignatureData,
          ipAddress: ip,
          deviceInfo,
          locationInfo: JSON.stringify({
            contractHash,
            signChannel: parsed.data.signChannel,
            signatureSource,
            reusedSignatureSignedAt: reusedSignatureSignedAt?.toISOString() ?? null,
            confirmations: parsed.data.confirmations,
            signedPortal: session.portal,
          }),
          signedAt: now,
        },
      });

      if (contract.contractType === "MAIN") {
        await transitionLoanApplication(tx, {
          applicationId: contract.applicationId,
          from: contract.application.status,
          to: "CONTRACTED",
          action: "SIGN_CONTRACT",
          auditAction: "sign",
          changeSummary: "Main contract signed",
          auditNewValue: { contractId },
        });
      }
    });
  } catch (error) {
    if (
      error instanceof LoanTransitionConflictError ||
      (error instanceof Error && error.message === "CONTRACT_STATUS_CHANGED")
    ) {
      return NextResponse.json(
        { error: "合同或借款申请状态已变化，请刷新后重试" },
        { status: 409 }
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true, signedAt: now.toISOString() });
}
