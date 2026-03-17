import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const list = await prisma.fundAccount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      funder: { select: { id: true, name: true } },
    },
    take: 200,
  });

  return NextResponse.json({
    items: list.map((x) => ({
      id: x.id,
      accountName: x.accountName,
      bankName: x.bankName,
      accountNo: x.accountNo,
      balance: Number(x.balance),
      funder: x.funder,
    })),
  });
}
