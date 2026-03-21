import { NextRequest, NextResponse } from "next/server";
import { getClientSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createContractSignAccessToken } from "@/lib/contract-sign-session";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录客户端" }, { status: 401 });
  }

  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id },
    select: {
      id: true,
      customerId: true,
      status: true,
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  }

  if (contract.customerId !== session.sub) {
    return NextResponse.json({ error: "无权访问该合同" }, { status: 403 });
  }

  if (contract.status === "SIGNED") {
    return NextResponse.json({ error: "合同已签署" }, { status: 400 });
  }

  const token = await createContractSignAccessToken({
    contractId: contract.id,
    customerId: contract.customerId,
  });

  const url = new URL(req.url);
  const origin = url.origin;
  const signUrl = `${origin}/client/sign/contract/${contract.id}?accessToken=${encodeURIComponent(token)}&mode=mobile`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(signUrl)}`;

  return NextResponse.json({
    signUrl,
    qrImageUrl,
    expiresInSeconds: 900,
  });
}
