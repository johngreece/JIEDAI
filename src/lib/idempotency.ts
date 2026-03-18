/**
 * 幂等性 + 乐观锁工具
 *
 * 1. 幂等键（Idempotency Key）: 通过请求头 X-Idempotency-Key 防止重复提交
 * 2. 乐观锁: 通过 version/updatedAt 字段检测并发冲突
 */

import { prisma } from "./prisma";

// ── 幂等性 ──

const idempotencyStore = new Map<string, { result: unknown; expiresAt: number }>();
const IDEMPOTENCY_TTL = 10 * 60 * 1000; // 10 分钟

// 定期清理
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore) {
    if (entry.expiresAt <= now) idempotencyStore.delete(key);
  }
}, 60_000);

/**
 * 检查幂等键是否已存在
 * @returns 如果已存在，返回之前的结果；否则返回 null
 */
export function checkIdempotencyKey(key: string | null): unknown | null {
  if (!key) return null;
  const entry = idempotencyStore.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.result;
  }
  return null;
}

/**
 * 保存幂等键结果
 */
export function saveIdempotencyResult(key: string | null, result: unknown) {
  if (!key) return;
  idempotencyStore.set(key, {
    result,
    expiresAt: Date.now() + IDEMPOTENCY_TTL,
  });
}

/**
 * 从请求头获取幂等键
 */
export function getIdempotencyKey(req: Request): string | null {
  return req.headers.get("x-idempotency-key");
}

// ── 乐观锁 ──

/**
 * 使用 Prisma 的 $executeRaw 实现乐观锁更新
 * 通过 updatedAt 检测并发冲突
 *
 * @returns 更新的行数（0 = 并发冲突）
 */
export async function optimisticUpdate(
  table: string,
  id: string,
  expectedUpdatedAt: Date,
  data: Record<string, unknown>
): Promise<number> {
  const setClauses = Object.entries(data)
    .map(([key]) => `"${toSnakeCase(key)}" = $${key}`)
    .join(", ");

  // 使用 Prisma.$executeRawUnsafe 是不安全的，改用事务 + findUnique 实现
  // 更安全的方式：在事务中先 findUnique 校验 updatedAt
  return prisma.$transaction(async (tx) => {
    const current = await (tx as any)[table].findUnique({
      where: { id },
      select: { updatedAt: true },
    });

    if (!current) return 0;

    // 比较时间戳（毫秒级）
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      return 0; // 并发冲突
    }

    await (tx as any)[table].update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });

    return 1;
  });
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
