# Atomic idempotency for write APIs

Updated: 2026-07-15

## Problem closed

The previous request flow checked for an idempotency key, executed the business operation, and only then saved the result. Two requests using the same key could both pass the initial read and mutate financial data concurrently.

All API routes that use `getScopedIdempotencyKey()` now execute through `withIdempotencyResponse()`.

## Runtime contract

1. A missing or invalid `X-Idempotency-Key` is rejected with HTTP `428` and code `IDEMPOTENCY_KEY_REQUIRED`.
2. The first valid request atomically creates a pending row in `idempotency_keys`. The primary key is the concurrency lock.
3. A concurrent request using the same scoped key receives HTTP `409`, code `IDEMPOTENCY_IN_PROGRESS`, and `Retry-After: 2`.
4. A successful response replaces the pending marker with the response status, content type, and body.
5. A later retry replays that response and includes `Idempotency-Replayed: true`.
6. Validation failures, non-2xx responses, and thrown exceptions release the pending claim so corrected requests can retry immediately.
7. If the business operation succeeds but response caching fails, the original success is returned and the pending claim is preserved. This prevents a retry from repeating an already committed mutation.
8. Pending and completed records expire after ten minutes. Expired claims are reclaimed with a conditional delete followed by a new primary-key claim.

## Ownership protection

Every pending row contains a random ownership token. Completion and release operations match both the key and the exact pending payload. An expired or replaced request therefore cannot overwrite the result of a newer owner.

## Covered routes

The wrapper protects client loan applications and repayment requests, disbursement creation and payment confirmation, repayment registration/allocation/receipt confirmation, capital inflows, funder withdrawals, and funder interest settlement decisions.

`src/lib/idempotency.test.ts` scans API route files and fails when a scoped route does not use the atomic wrapper. `src/lib/idempotency-concurrency.test.ts` verifies concurrent exclusion, successful replay, validation release, and exception release.
