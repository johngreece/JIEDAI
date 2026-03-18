import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js Edge Middleware
 * - CORS 头设置
 * - API 请求安全头
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // ── CORS 头 ──
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") ?? [];

  // 开发环境放行 localhost
  if (
    process.env.NODE_ENV === "development" ||
    allowedOrigins.includes(origin) ||
    origin.startsWith("http://localhost")
  ) {
    res.headers.set("Access-Control-Allow-Origin", origin || "*");
  }

  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Idempotency-Key");
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Max-Age", "86400");

  // ── 安全头 ──
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // ── OPTIONS 预检请求直接返回 ──
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: ["/api/:path*"],
};
