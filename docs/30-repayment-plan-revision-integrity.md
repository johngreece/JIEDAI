# Repayment plan revision integrity

Updated: 2026-07-15

## Problem closed

Extension and restructure decisions previously used inconsistent UI and API action values. Their approval flows also read a pending request and active repayment plan before performing unconditional updates. Concurrent approvals could therefore create more than one active plan, and an extension could restore already-paid schedule amounts.

## Decision contract

1. Browser commands are `APPROVE` and `REJECT` for both workflows.
2. Persisted decision statuses remain `APPROVED` and `REJECTED`.
3. Shared lifecycle modules own the command-to-status mapping used by pages and API schemas.
4. A decision claims its request with a conditional `updateMany` from `PENDING`. A stale or repeated decision returns HTTP `409`.

## Plan replacement contract

1. Extension application, extension approval, restructure application, and restructure approval run at `Serializable` isolation.
2. Approval requires exactly one active repayment plan.
3. A restructure application stores the active plan ID. Approval fails if that plan is no longer active.
4. The old plan is conditionally changed from `ACTIVE` to `SUPERSEDED` using its current version before the replacement plan is inserted.
5. The replacement plan ID is allocated first so `supersededBy` is written atomically.
6. Audit entries and related ledger entries are written in the same database transaction.
7. PostgreSQL index `repayment_plans_one_active_per_application` enforces at most one `ACTIVE` plan per application.

## Extension balance rules

Only schedule items with a positive `remaining` balance receive extension fees and a shifted due date. The replacement remaining amount is the previous remaining amount plus its allocated fee, so paid principal, interest, and fees are never restored. Fee shares are rounded to four decimals and the final outstanding item receives the exact rounding remainder.

All due-date shifts use calendar-day arithmetic rather than fixed millisecond offsets so daylight-saving transitions cannot change the local due time.

## Operations

Run `npm run db:ensure-infra` after provisioning or restoring a database. The command checks for duplicate active plans before creating the partial unique index and aborts with the conflicting application IDs if cleanup is required.

`src/lib/repayment-plan-revision-guard.test.ts` protects the conditional claims, serializable transactions, transactional audits, and active-plan replacement markers. The system invariant check protects the production index declaration.
