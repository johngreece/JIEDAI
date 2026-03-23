import { NextResponse } from "next/server";
import { getAdminSession, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperAdmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const list = await prisma.fundAccount.findMany({
    where: {
      isActive: true,
      funder: {
        deletedAt: null,
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      funder: { select: { id: true, name: true } },
    },
    take: 200,
  });

  return NextResponse.json({
    items: list.map((item) => ({
      id: item.id,
      accountName: item.accountName,
      bankName: item.bankName,
      accountNo: item.accountNo,
      balance: Number(item.balance),
      totalInflow: Number(item.totalInflow),
      totalOutflow: Number(item.totalOutflow),
      totalProfit: Number(item.totalProfit),
      funder: item.funder,
    })),
  });
}
