# Capital inflow bank evidence

## Decision

A capital inflow becomes usable only after the incoming EUR bank transfer is supported by structured evidence. A funder submission starts as `PENDING`; a finance direct entry is immediately `CONFIRMED` because the operator supplies and reviews the same evidence in one action.

## Required evidence

Every capital inflow stores:

- an account-scoped bank transaction ID;
- the sender bank and sender account or IBAN snapshot;
- a protected `Attachment` with `entityType=capital_inflow`;
- the reviewing administrator and review time when confirmed, rejected or cancelled;
- the bank identity in the fund-account journal metadata and audit log.

The database unique constraint on `(fund_account_id, transaction_id)` is the final duplicate-transfer guard. Files use the shared private proof policy and can also be represented by an HTTPS evidence link.

## Workflows

### Funder submission

1. The active funder selects one of its own active accounts.
2. The funder supplies amount, transaction ID, sender snapshot and proof.
3. The API stores a `PENDING` record and proof attachment atomically.
4. Finance confirms or rejects the request through `/admin/capital-inflows`.
5. Confirmation atomically claims the status, verifies the protected proof, credits the fund account, writes the journal and records the audit trail.

### Finance direct entry

1. Finance supplies the same bank evidence and an idempotency key.
2. One database transaction creates the confirmed inflow, proof attachment, account credit, journal and audit record.
3. A failed database transaction removes a newly uploaded private file on a best-effort basis.

### Cancellation

Only `inflow:cancel` can cancel an inflow. A confirmed inflow is never deleted: cancellation writes a debit reversal journal and retains the original record and proof.

## Authorization

- `inflow:view` controls the admin list and protected proof downloads.
- `inflow:create` controls finance direct entry.
- `inflow:review` controls confirmation and rejection.
- `inflow:cancel` controls reversal and is not granted to the standard finance role.
- the standard finance role receives view, create and review during secure seed and infrastructure sync.
- funders can only submit to and read inflows belonging to their own accounts.

## Reconciliation

Daily financial reconciliation emits an error when a confirmed capital inflow lacks either:

- transaction ID, sender snapshot or reviewer trail; or
- a non-deleted protected proof attachment.

## Production migration

The July 2026 production preflight found zero capital inflow rows and zero proof orphans. This allows the evidence columns and account-scoped unique constraint to be introduced without legacy backfill. After `prisma db push`, run `npm run db:ensure-infra` to install finance-role permissions.
