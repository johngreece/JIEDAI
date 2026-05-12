/**
 * 幂等性 + 乐观锁工具（数据库持久化）
 *
 * 1. 幂等键: 通过请求头 X-Idempotency-Key 防止重复提交。
 *    存储在 idempotency_keys 表（key 主键 + UNIQUE），多实例/重启场景下仍生效。
 * 2. 乐观锁: 通过 updatedAt 字段检测并发冲突。
 */

import { prisma } from "./prisma";

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 10 分钟

/**
 * 检查幂等键是否已存在；命中则返回先前结果
 */
export async function checkIdempotencyKey(key: string | null): Promise<unknown | null> {
  if (!key) return null;
  const row = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    // 过期：清理后视为未命中（容忍清理失败）
    await prisma.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
    return null;
  }
  try {
    return JSON.parse(row.resultJson);
  } catch {
    return null;
  }
}

/**
 * 保存幂等结果。重复 key 走 upsert（覆盖最新一次成功结果与新有效期）。
 */
export async function saveIdempotencyResult(key: string | null, result: unknown): Promise<void> {
  if (!key) return;
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);
  const resultJson = JSON.stringify(result);
  await prisma.idempotencyKey
    .upsert({
      where: { key },
      create: { key, resultJson, expiresAt },
      update: { resultJson, expiresAt },
    })
    .catch((err) => {
      // 幂等存储失败不应影响业务结果，仅记录
      console.error("[idempotency] save failed", err);
    });
}

export function getIdempotencyKey(req: Request): string | null {
  return req.headers.get("x-idempotency-key");
}

// ── 乐观锁 ──────────────────────────────────────────────────────────────

/**
 * 在事务内通过 updatedAt 时间戳实现乐观锁更新。
 * 返回 1 表示更新成功，0 表示并发冲突。
 */
export async function optimisticUpdate(
  table: string,
  id: string,
  expectedUpdatedAt: Date,
  data: Record<string, unknown>
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const current = await (tx as any)[table].findUnique({
      where: { id },
      select: { updatedAt: true },
    });

    if (!current) return 0;
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      return 0;
    }

    await (tx as any)[table].update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });

    return 1;
  });
}
