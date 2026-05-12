/**
 * 限流器（数据库持久化，serverless 多实例可用）
 *
 * 用法：
 *   const result = await checkRateLimit("login:" + ip, { windowMs: 60_000, max: 10 });
 *   if (!result.allowed) return rateLimitResponse(result.resetAt);
 *
 * 策略：
 *   - 命中 key 已存在且未过期 → 在事务内自增 count 并比较 max
 *   - 不存在或已过期 → upsert 重置窗口
 *   - 失败/异常 fallback 为放行（避免数据库故障打挂登录入口），但记录日志
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type RateLimitOptions = { windowMs: number; max: number };
export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number };

export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.rateLimitBucket.findUnique({ where: { key } });
      if (!existing || existing.resetAt.getTime() <= now) {
        const resetAt = new Date(now + opts.windowMs);
        await tx.rateLimitBucket.upsert({
          where: { key },
          create: { key, count: 1, resetAt },
          update: { count: 1, resetAt },
        });
        return { count: 1, resetAt };
      }
      const updated = await tx.rateLimitBucket.update({
        where: { key },
        data: { count: { increment: 1 } },
      });
      return { count: updated.count, resetAt: existing.resetAt };
    });

    return {
      allowed: result.count <= opts.max,
      remaining: Math.max(0, opts.max - result.count),
      resetAt: result.resetAt.getTime(),
    };
  } catch (err) {
    console.error("[rate-limit] check failed, fail-open", err);
    return { allowed: true, remaining: opts.max, resetAt: now + opts.windowMs };
  }
}

// ── 预定义限流策略 ──
export const LOGIN_LIMIT: RateLimitOptions = { windowMs: 60_000, max: 10 };
export const API_LIMIT: RateLimitOptions = { windowMs: 60_000, max: 60 };

/** 登录限流：1 分钟最多 10 次 */
export const loginLimiter = {
  check: (key: string) => checkRateLimit(key, LOGIN_LIMIT),
};

/** 通用 API 限流：1 分钟最多 60 次 */
export const apiLimiter = {
  check: (key: string) => checkRateLimit(key, API_LIMIT),
};

/** 获取请求者 IP */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // 取代理链首个非空 IP（X-Forwarded-For 标准：client, proxy1, proxy2…）
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/** 限流响应 */
export function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return Response.json(
    { code: "E99006", message: "请求过于频繁，请稍后再试" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    }
  );
}

/** 清理过期 bucket（可由 cron 调用） */
export async function cleanupExpiredRateLimitBuckets(): Promise<number> {
  const now = new Date();
  const res = await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lte: now } } });
  return res.count;
}

// 兼容旧调用方式（同步签名）—— 保留 createRateLimiter 但内部改为异步
export function createRateLimiter(opts: RateLimitOptions) {
  return {
    check: (key: string) => checkRateLimit(key, opts),
  };
}

export type { Prisma };
