import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredRow = {
  key: string;
  resultJson: string;
  expiresAt: Date;
  createdAt: Date;
};

const database = vi.hoisted(() => {
  const rows = new Map<string, StoredRow>();

  return {
    rows,
    idempotencyKey: {
      create: vi.fn(async ({ data }: { data: Omit<StoredRow, "createdAt"> }) => {
        if (rows.has(data.key)) throw { code: "P2002" };
        const row = { ...data, createdAt: new Date() };
        rows.set(data.key, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
        return rows.get(where.key) ?? null;
      }),
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: { key: string; resultJson?: string; expiresAt?: { lte: Date } };
        }) => {
          const row = rows.get(where.key);
          if (!row) return { count: 0 };
          if (where.resultJson !== undefined && row.resultJson !== where.resultJson) {
            return { count: 0 };
          }
          if (where.expiresAt?.lte && row.expiresAt.getTime() > where.expiresAt.lte.getTime()) {
            return { count: 0 };
          }
          rows.delete(where.key);
          return { count: 1 };
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { key: string; resultJson: string };
          data: { resultJson: string; expiresAt: Date };
        }) => {
          const row = rows.get(where.key);
          if (!row || row.resultJson !== where.resultJson) return { count: 0 };
          rows.set(where.key, { ...row, ...data });
          return { count: 1 };
        },
      ),
    },
  };
});

vi.mock("./prisma", () => ({
  prisma: {
    idempotencyKey: database.idempotencyKey,
  },
}));

import { withIdempotencyResponse } from "./idempotency";

describe("atomic idempotency execution", () => {
  beforeEach(() => {
    database.rows.clear();
    vi.clearAllMocks();
  });

  it("rejects a write operation that omits the idempotency key", async () => {
    const operation = vi.fn(async () => Response.json({ unsafe: true }));

    const response = await withIdempotencyResponse(null, operation);

    expect(response.status).toBe(428);
    expect(await response.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("allows one concurrent owner, rejects an in-flight duplicate, and replays success", async () => {
    let startFirst: (() => void) | undefined;
    let finishFirst: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startFirst = resolve;
    });
    const finish = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const firstOperation = vi.fn(async () => {
      startFirst?.();
      await finish;
      return Response.json({ id: "result-1" }, { status: 201 });
    });
    const duplicateOperation = vi.fn(async () => Response.json({ id: "duplicate" }));

    const first = withIdempotencyResponse("scope:key-1", firstOperation);
    await started;

    const concurrent = await withIdempotencyResponse("scope:key-1", duplicateOperation);
    expect(concurrent.status).toBe(409);
    expect(concurrent.headers.get("retry-after")).toBe("2");
    expect(await concurrent.json()).toMatchObject({ code: "IDEMPOTENCY_IN_PROGRESS" });
    expect(duplicateOperation).not.toHaveBeenCalled();

    finishFirst?.();
    const firstResponse = await first;
    expect(firstResponse.status).toBe(201);
    expect(firstResponse.headers.get("idempotency-replayed")).toBe("false");

    const replay = await withIdempotencyResponse("scope:key-1", duplicateOperation);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await replay.json()).toEqual({ id: "result-1" });
    expect(duplicateOperation).not.toHaveBeenCalled();
  });

  it("releases the claim after an unsuccessful response so a corrected retry can run", async () => {
    const failed = await withIdempotencyResponse("scope:key-2", async () => {
      return Response.json({ error: "invalid" }, { status: 400 });
    });

    expect(failed.status).toBe(400);
    expect(database.rows.has("scope:key-2")).toBe(false);

    const retryOperation = vi.fn(async () => Response.json({ ok: true }));
    const retry = await withIdempotencyResponse("scope:key-2", retryOperation);
    expect(retry.status).toBe(200);
    expect(retryOperation).toHaveBeenCalledOnce();
  });

  it("releases the claim when the operation throws", async () => {
    await expect(
      withIdempotencyResponse("scope:key-3", async () => {
        throw new Error("transaction rolled back");
      }),
    ).rejects.toThrow("transaction rolled back");

    expect(database.rows.has("scope:key-3")).toBe(false);
  });

  it("does not expose a successful business operation as failed when caching fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    database.idempotencyKey.updateMany.mockRejectedValueOnce(new Error("cache unavailable"));

    const response = await withIdempotencyResponse("scope:key-4", async () => {
      return Response.json({ ok: true });
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(database.rows.has("scope:key-4")).toBe(true);

    const duplicate = await withIdempotencyResponse("scope:key-4", async () => {
      return Response.json({ duplicate: true });
    });
    expect(duplicate.status).toBe(409);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
