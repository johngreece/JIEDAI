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
  const repayment = await prisma.repayment.findUnique({
    where: { id },
    select: {
      id: true,
      repaymentNo: true,
      amount: true,
      status: true,
    },
  });
  if (!repayment) {
    return NextResponse.json({ error: "还款记录不存在" }, { status: 404 });
  }
  return NextResponse.json({
    id: repayment.id,
    repaymentNo: repayment.repaymentNo,
    amount: Number(repayment.amount),
    status: repayment.status,
  });
}
