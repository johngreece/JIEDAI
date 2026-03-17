import { NextResponse } from "next/server";
import { getSession, isAdmin, isClient } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isAdmin(session)) {
    const user = await prisma.user.findUnique({
      where: { id: session.sub, deletedAt: null },
      select: {
        id: true,
        username: true,
        email: true,
        realName: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...user,
      portal: "admin",
      roles: session.roles,
    });
  }

  if (isClient(session)) {
    const customer = await prisma.customer.findUnique({
      where: { id: session.sub, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...customer,
      portal: "client",
    });
  }

  return NextResponse.json({ error: "Invalid session" }, { status: 401 });
}
