import { NextRequest, NextResponse } from "next/server";
import { getFunderSession } from "@/lib/auth";
import { ensureActiveFunderSession, requireActiveFunderSession } from "@/lib/portal-session";
import { requirePermission } from "@/lib/rbac";
import { FunderContractService } from "@/services/funder-contract.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/funder/contracts
 * 获取资金方合同列表
 */
export async function GET(req: NextRequest) {
  const session = await requireActiveFunderSession();
  if (session instanceof Response) return session;

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
    const activeFunderSession = await ensureActiveFunderSession(funderSession);
    if (activeFunderSession instanceof Response) return activeFunderSession;

    funderId = activeFunderSession.sub;
    generatedBy = "资金方自助";
  } else {
    const adminSession = await requirePermission(["contract:generate"]);
    if (adminSession instanceof Response) return adminSession;
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
