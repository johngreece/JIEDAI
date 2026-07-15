import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin, isClient } from "@/lib/auth";
import { verifyContractSignAccessToken } from "@/lib/contract-sign-session";
import { isValidSignatureDataUrl } from "@/lib/contract-signature";
import { prisma } from "@/lib/prisma";
import { ensureActiveClientSession } from "@/lib/portal-session";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { id } = await params;
  const accessToken = new URL(req.url).searchParams.get("accessToken");
  let contractWhere: Prisma.ContractWhereInput;

  if (isAdmin(session)) {
    const adminSession = await requirePermission(["contract:view"]);
    if (adminSession instanceof Response) return adminSession;
    contractWhere = { id, deletedAt: null };
  } else {
    if (!isClient(session)) {
      return NextResponse.json({ error: "无权访问该合同" }, { status: 403 });
    }

    const activeClientSession = await ensureActiveClientSession(session);
    if (activeClientSession instanceof Response) return activeClientSession;
    contractWhere = { id, customerId: session.sub, deletedAt: null };
  }

  const contract = await prisma.contract.findFirst({
    where: contractWhere,
    select: {
      id: true,
      contractNo: true,
      content: true,
      status: true,
      signedAt: true,
      expiryDate: true,
      customerId: true,
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  }

  if (isAdmin(session)) {
    return NextResponse.json(contract);
  }

  if (accessToken) {
    try {
      const tokenPayload = await verifyContractSignAccessToken(accessToken);
      if (tokenPayload.contractId !== contract.id || tokenPayload.customerId !== session.sub) {
        return NextResponse.json({ error: "签署令牌无效" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "签署令牌已失效" }, { status: 403 });
    }
  }

  const savedSignature = await prisma.signature.findFirst({
    where: {
      signerType: "customer",
      contract: { customerId: session.sub },
    },
    orderBy: { signedAt: "desc" },
    select: {
      signerName: true,
      signatureData: true,
      signedAt: true,
    },
  });

  return NextResponse.json({
    ...contract,
    savedSignature:
      savedSignature && isValidSignatureDataUrl(savedSignature.signatureData)
        ? savedSignature
        : null,
  });
}
