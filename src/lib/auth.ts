import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "loan-system-secret-change-in-production"
);
const COOKIE_NAME = "loan_session";

export type JWTPayload = {
  sub: string;
  username: string;
  roles: string[];
  scope?: Record<string, unknown>;
  iat?: number;
  exp?: number;
};

export async function createToken(payload: Omit<JWTPayload, "iat" | "exp">) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function hasRole(session: JWTPayload | null, role: string): boolean {
  return session?.roles?.includes(role) ?? false;
}

export function isSuperAdmin(session: JWTPayload | null): boolean {
  return hasRole(session, "super_admin");
}
