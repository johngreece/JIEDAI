import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js Edge Middleware
 * - CORS：仅对白名单 origin 回写 Allow-Origin，与 Allow-Credentials: true 兼容
 * - 安全头：X-Content-Type-Options / X-Frame-Options / Referrer-Policy
 *
 * 注意：当 Allow-Credentials 为 true 时，浏览器禁止 Allow-Origin 为 "*"。
 * 必须用具体源串回显，否则跨域 fetch 会被拒。
 */
export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });

  const origin = req.headers.get("origin") ?? "";
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // 开发环境放行 localhost；生产仅放行白名单
  const isDevLocalhost =
    process.env.NODE_ENV === "development" &&
    (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"));
  const isAllowed = origin !== "" && (allowedOrigins.includes(origin) || isDevLocalhost);

  if (isAllowed) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }

  // 同源请求（无 Origin 头）或非白名单跨域：不下发 CORS 头，浏览器自然拒绝
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Idempotency-Key");
  res.headers.set("Access-Control-Max-Age", "86400");

  // 安全响应头
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // OPTIONS 预检请求：白名单内 204，否则 403
  if (req.method === "OPTIONS") {
    if (!isAllowed && origin !== "") {
      return new NextResponse(null, { status: 403, headers: res.headers });
    }
    return new NextResponse(null, { status: 204, headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: ["/api/:path*", "/client/:path*"],
};
