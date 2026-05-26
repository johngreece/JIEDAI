import { NextResponse } from "next/server";
import { getSession, isAdmin, isClient, isFunder } from "@/lib/auth";
import { ensureActiveClientSession, ensureActiveFunderSession } from "@/lib/portal-session";
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
    const activeClientSession = await ensureActiveClientSession(session);
    if (activeClientSession instanceof Response) return activeClientSession;

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

  if (isFunder(session)) {
    const activeFunderSession = await ensureActiveFunderSession(session);
    if (activeFunderSession instanceof Response) return activeFunderSession;

    const funder = await prisma.funder.findFirst({
      where: { id: session.sub, deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        loginPhone: true,
        contactPerson: true,
        contactEmail: true,
      },
    });
    if (!funder) {
      return NextResponse.json({ error: "Funder not found" }, { status: 404 });
    }
    return NextResponse.json({
      id: funder.id,
      name: funder.name,
      phone: funder.loginPhone,
      contactPerson: funder.contactPerson,
      contactEmail: funder.contactEmail,
      portal: "funder",
    });
  }

  return NextResponse.json({ error: "Invalid session" }, { status: 401 });
}
