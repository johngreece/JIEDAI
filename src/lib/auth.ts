import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "loan-system-secret-change-in-production"
);
const ADMIN_COOKIE = "admin_session";
const CLIENT_COOKIE = "client_session";
const FUNDER_COOKIE = "funder_session";

// ── Admin JWT ──────────────────────────────────────────────
export type AdminPayload = {
  sub: string;
  username: string;
  roles: string[];
  portal: "admin";
  iat?: number;
  exp?: number;
};

export async function createAdminToken(payload: Omit<AdminPayload, "iat" | "exp" | "portal">) {
  return new SignJWT({ ...payload, portal: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function getAdminSession(): Promise<AdminPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const p = payload as unknown as AdminPayload;
    if (p.portal !== "admin") return null;
    return p;
  } catch {
    return null;
  }
}

export function setAdminCookie(token: string) {
  return {
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  };
}

// ── Client JWT ─────────────────────────────────────────────
export type ClientPayload = {
  sub: string;
  name: string;
  phone: string;
  portal: "client";
  iat?: number;
  exp?: number;
};

export async function createClientToken(payload: Omit<ClientPayload, "iat" | "exp" | "portal">) {
  return new SignJWT({ ...payload, portal: "client" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function getClientSession(): Promise<ClientPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CLIENT_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const p = payload as unknown as ClientPayload;
    if (p.portal !== "client") return null;
    return p;
  } catch {
    return null;
  }
}

export function setClientCookie(token: string) {
  return {
    name: CLIENT_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  };
}

// ── Funder JWT ─────────────────────────────────────────────
export type FunderPayload = {
  sub: string;
  name: string;
  phone: string;
  portal: "funder";
  iat?: number;
  exp?: number;
};

export async function createFunderToken(payload: Omit<FunderPayload, "iat" | "exp" | "portal">) {
  return new SignJWT({ ...payload, portal: "funder" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function getFunderSession(): Promise<FunderPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(FUNDER_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const p = payload as unknown as FunderPayload;
    if (p.portal !== "funder") return null;
    return p;
  } catch {
    return null;
  }
}

export function setFunderCookie(token: string) {
  return {
    name: FUNDER_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  };
}

// ── Backward compat (used by shared APIs) ──────────────────
export type JWTPayload = AdminPayload | ClientPayload | FunderPayload;

export async function getSession(): Promise<JWTPayload | null> {
  const admin = await getAdminSession();
  if (admin) return admin;
  const funder = await getFunderSession();
  if (funder) return funder;
  return getClientSession();
}

export function hasRole(session: JWTPayload | null, role: string): boolean {
  if (!session || session.portal !== "admin") return false;
  return session.roles?.includes(role) ?? false;
}

export function isSuperAdmin(session: JWTPayload | null): boolean {
  return hasRole(session, "super_admin");
}

export function isAdmin(session: JWTPayload | null): session is AdminPayload {
  return session?.portal === "admin";
}

export function isClient(session: JWTPayload | null): session is ClientPayload {
  return session?.portal === "client";
}

export function isFunder(session: JWTPayload | null): session is FunderPayload {
  return session?.portal === "funder";
}
