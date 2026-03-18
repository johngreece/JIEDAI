/**
 * 简易内存限流器（单实例）
 * 生产环境建议替换为 Redis 实现
 *
 * 用法:
 *   const limiter = createRateLimiter({ windowMs: 60000, max: 30 });
 *   const result = limiter.check(ip);
 *   if (!result.allowed) return Response.json(..., { status: 429 });
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(opts: { windowMs: number; max: number }) {
  const store = new Map<string, RateLimitEntry>();

  // 每分钟清理过期条目
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 60_000);

  return {
    check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
      const now = Date.now();
      let entry = store.get(key);

      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + opts.windowMs };
        store.set(key, entry);
      }

      entry.count++;

      return {
        allowed: entry.count <= opts.max,
        remaining: Math.max(0, opts.max - entry.count),
        resetAt: entry.resetAt,
      };
    },
  };
}

// ── 预定义限流器 ──

/** 登录接口：1 分钟最多 10 次 */
export const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

/** 一般 API：1 分钟最多 60 次 */
export const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

/** 获取请求者 IP */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/** 限流检查响应 */
export function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return Response.json(
    { code: "E99006", message: "请求过于频繁，请稍后再试" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    }
  );
}
