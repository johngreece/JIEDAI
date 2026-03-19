import { NextRequest, NextResponse } from "next/server";
import { getFunderSession, getAdminSession } from "@/lib/auth";
import { FunderContractService } from "@/services/funder-contract.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/funder/contracts
 * 获取资金方合同列表
 */
export async function GET(req: NextRequest) {
  const session = await getFunderSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const contracts = await FunderContractService.list(session.sub);
  return NextResponse.json(contracts);
}

/**
 * POST /api/funder/contracts  body: { funderId?: string }
 * 生成合同（资金方自己或管理端指定 funderId）
 */
export async function POST(req: NextRequest) {
  let funderId: string;
  let generatedBy: string | undefined;

  const funderSession = await getFunderSession();
  if (funderSession) {
    funderId = funderSession.sub;
    generatedBy = "资金方自助";
  } else {
    const adminSession = await getAdminSession();
    if (!adminSession) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const body = await req.json();
    if (!body.funderId) {
      return NextResponse.json({ error: "请提供 funderId" }, { status: 400 });
    }
    funderId = body.funderId;
    generatedBy = `管理员: ${adminSession.username}`;
  }

  const contract = await FunderContractService.generateContract(funderId, generatedBy);
  return NextResponse.json(contract, { status: 201 });
}
