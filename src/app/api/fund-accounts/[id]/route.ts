import { NextResponse } from "next/server";
import { getAdminSession, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireSuperAdminSession() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return session;
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const existing = await prisma.fundAccount.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!existing || !existing.isActive) {
    return NextResponse.json({ error: "资金账户不存在" }, { status: 404 });
  }

  const [inflowCount, disbursementCount] = await Promise.all([
    prisma.capitalInflow.count({ where: { fundAccountId: id } }),
    prisma.disbursement.count({ where: { fundAccountId: id } }),
  ]);

  if (inflowCount > 0 || disbursementCount > 0) {
    await prisma.fundAccount.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true, mode: "deactivated" });
  }

  await prisma.fundAccount.delete({ where: { id } });
  return NextResponse.json({ success: true, mode: "deleted" });
}
