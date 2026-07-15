import { randomUUID } from "crypto";
import { prisma } from "./prisma";

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 180;
const MAX_CLAIM_ATTEMPTS = 4;
const PENDING_MARKER = "IDEMPOTENCY_PENDING_V1";
const HTTP_RESPONSE_MARKER = "IDEMPOTENCY_HTTP_RESPONSE_V1";

type PendingRecord = {
  marker: typeof PENDING_MARKER;
  token: string;
  startedAt: string;
};

type StoredHttpResponse = {
  marker: typeof HTTP_RESPONSE_MARKER;
  status: number;
  bodyText: string;
  contentType: string | null;
};

type IdempotencyClaim =
  | { state: "acquired"; pendingJson: string }
  | { state: "cached"; result: unknown }
  | { state: "in_progress" };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function parseStoredResult(resultJson: string): unknown {
  try {
    return JSON.parse(resultJson);
  } catch {
    return undefined;
  }
}

function isPendingRecord(value: unknown): value is PendingRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "marker" in value &&
    (value as { marker?: unknown }).marker === PENDING_MARKER
  );
}

function isStoredHttpResponse(value: unknown): value is StoredHttpResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "marker" in value &&
    (value as { marker?: unknown }).marker === HTTP_RESPONSE_MARKER
  );
}

async function claimIdempotencyKey(key: string): Promise<IdempotencyClaim> {
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt += 1) {
    const now = new Date();
    const pendingJson = JSON.stringify({
      marker: PENDING_MARKER,
      token: randomUUID(),
      startedAt: now.toISOString(),
    } satisfies PendingRecord);

    try {
      await prisma.idempotencyKey.create({
        data: {
          key,
          resultJson: pendingJson,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        },
      });
      return { state: "acquired", pendingJson };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }

    const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (!existing) continue;

    if (existing.expiresAt.getTime() <= now.getTime()) {
      await prisma.idempotencyKey.deleteMany({
        where: { key, expiresAt: { lte: now } },
      });
      continue;
    }

    const stored = parseStoredResult(existing.resultJson);
    if (stored === undefined || isPendingRecord(stored)) {
      return { state: "in_progress" };
    }
    return { state: "cached", result: stored };
  }

  return { state: "in_progress" };
}

async function completeIdempotencyKey(
  key: string,
  pendingJson: string,
  result: StoredHttpResponse,
): Promise<void> {
  const updated = await prisma.idempotencyKey.updateMany({
    where: { key, resultJson: pendingJson },
    data: {
      resultJson: JSON.stringify(result),
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    },
  });

  if (updated.count !== 1) {
    console.error("[idempotency] claim ownership was lost before completion", { key });
  }
}

async function releaseIdempotencyKey(key: string, pendingJson: string): Promise<void> {
  await prisma.idempotencyKey
    .deleteMany({ where: { key, resultJson: pendingJson } })
    .catch((error) => {
      console.error("[idempotency] failed to release request claim", { key, error });
    });
}

function replayCachedResponse(result: unknown): Response {
  if (isStoredHttpResponse(result)) {
    const headers = new Headers({ "Idempotency-Replayed": "true" });
    if (result.contentType) headers.set("Content-Type", result.contentType);
    return new Response(result.bodyText || null, { status: result.status, headers });
  }

  return Response.json(result, {
    headers: { "Idempotency-Replayed": "true" },
  });
}

export async function withIdempotencyResponse(
  key: string | null,
  operation: () => Promise<Response>,
): Promise<Response> {
  if (!key) {
    return Response.json(
      {
        error: "X-Idempotency-Key is required for this operation",
        code: "IDEMPOTENCY_KEY_REQUIRED",
      },
      { status: 428 },
    );
  }

  const claim = await claimIdempotencyKey(key);
  if (claim.state === "cached") return replayCachedResponse(claim.result);
  if (claim.state === "in_progress") {
    return Response.json(
      {
        error: "An identical request is already being processed",
        code: "IDEMPOTENCY_IN_PROGRESS",
      },
      { status: 409, headers: { "Retry-After": "2" } },
    );
  }

  let response: Response;
  try {
    response = await operation();
  } catch (error) {
    await releaseIdempotencyKey(key, claim.pendingJson);
    throw error;
  }

  if (!response.ok) {
    await releaseIdempotencyKey(key, claim.pendingJson);
    return response;
  }

  try {
    const bodyText = await response.clone().text();
    await completeIdempotencyKey(key, claim.pendingJson, {
      marker: HTTP_RESPONSE_MARKER,
      status: response.status,
      bodyText,
      contentType: response.headers.get("content-type"),
    });
    response.headers.set("Idempotency-Replayed", "false");
  } catch (error) {
    console.error("[idempotency] business succeeded but response caching failed", {
      key,
      error,
    });
  }

  return response;
}

export function getIdempotencyKey(req: Request): string | null {
  return req.headers.get("x-idempotency-key");
}

export function getScopedIdempotencyKey(
  req: Request,
  scopeParts: Array<string | number | null | undefined>,
): string | null {
  const rawKey = getIdempotencyKey(req)?.trim();
  if (!rawKey || rawKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null;

  const scope = scopeParts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(":");

  return scope ? `${scope}:${rawKey}` : rawKey;
}

export async function optimisticUpdate(
  table: string,
  id: string,
  expectedUpdatedAt: Date,
  data: Record<string, unknown>,
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
