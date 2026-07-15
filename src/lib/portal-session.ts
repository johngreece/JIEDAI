import {
  getAdminSession,
  getClientSession,
  getFunderSession,
  type AdminPayload,
  type ClientPayload,
  type FunderPayload,
} from "./auth";
import { prisma } from "./prisma";

export async function getActiveAdminSession(): Promise<AdminPayload | null> {
  const session = await getAdminSession();
  if (!session) return null;

  const user = await prisma.user.findFirst({
    where: { id: session.sub, deletedAt: null, isActive: true },
    select: {
      username: true,
      role: { select: { code: true } },
    },
  });

  return user
    ? {
        ...session,
        username: user.username,
        roles: [user.role.code],
      }
    : null;
}

export async function getActiveClientSession(): Promise<ClientPayload | null> {
  const session = await getClientSession();
  if (!session) return null;

  const customer = await prisma.customer.findFirst({
    where: { id: session.sub, deletedAt: null },
    select: { id: true },
  });

  return customer ? session : null;
}

export async function getActiveFunderSession(): Promise<FunderPayload | null> {
  const session = await getFunderSession();
  if (!session) return null;

  const funder = await prisma.funder.findFirst({
    where: { id: session.sub, deletedAt: null, isActive: true },
    select: { id: true },
  });

  return funder ? session : null;
}

export async function requireActiveClientSession(): Promise<ClientPayload | Response> {
  const session = await getClientSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return ensureActiveClientSession(session);
}

export async function requireActiveFunderSession(): Promise<FunderPayload | Response> {
  const session = await getFunderSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return ensureActiveFunderSession(session);
}

export async function ensureActiveClientSession(
  session: ClientPayload
): Promise<ClientPayload | Response> {
  const customer = await prisma.customer.findFirst({
    where: { id: session.sub, deletedAt: null },
    select: { id: true },
  });

  return customer
    ? session
    : Response.json({ error: "客户账号已停用或不存在，请重新登录" }, { status: 403 });
}

export async function ensureActiveFunderSession(
  session: FunderPayload
): Promise<FunderPayload | Response> {
  const funder = await prisma.funder.findFirst({
    where: { id: session.sub, deletedAt: null, isActive: true },
    select: { id: true },
  });

  return funder
    ? session
    : Response.json({ error: "资金方账号已停用或不存在，请重新登录" }, { status: 403 });
}
