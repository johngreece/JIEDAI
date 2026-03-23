import { NextRequest, NextResponse } from "next/server";
import { getFunderSession, getAdminSession } from "@/lib/auth";
import { FunderContractService } from "@/services/funder-contract.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/funder/contracts/[id]
 * 获取合同详情
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const funderSession = await getFunderSession();
  const adminSession = await getAdminSession();

  if (!funderSession && !adminSession) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { id } = await params;
  const contract = await FunderContractService.get(id);
  if (!contract) {
    return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  }

  // 资金方只能查看自己的合同
  if (funderSession && contract.funderId !== funderSession.sub) {
    return NextResponse.json({ error: "无权查看" }, { status: 403 });
  }

  return NextResponse.json(contract);
}
