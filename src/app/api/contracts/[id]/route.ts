import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id },
    select: {
      id: true,
      contractNo: true,
      content: true,
      status: true,
      signedAt: true,
    },
  });
  if (!contract) {
    return NextResponse.json({ error: "合同不存在" }, { status: 404 });
  }
  return NextResponse.json(contract);
}
