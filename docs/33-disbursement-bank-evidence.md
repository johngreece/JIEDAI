# Disbursement Bank Evidence

Updated: 2026-07-15

## Objective

Every transition from `PENDING` to `PAID` must be explainable without relying on an operator's memory. The confirmation records the external bank transaction, the payer account snapshot, the receipt, the financial journals, and the audit entry as one business operation.

## Confirmation contract

- `X-Idempotency-Key` is mandatory.
- `transactionId` is mandatory and accepts 3-120 bank-safe characters.
- A JPG, PNG, WebP, or PDF receipt up to 10 MB, or an HTTPS evidence link, is mandatory.
- `(fundAccountId, transactionId)` is unique. A bank reference cannot confirm two disbursements from the same account.
- `payerBank` and `payerAccount` are copied from the selected fund account at confirmation time. Browser-supplied payer identity is not trusted.

## Atomic write set

The Prisma transaction performs all of the following:

1. Re-reads the pending disbursement, signed contract, customer eligibility, product pricing, and fund account.
2. Claims `PENDING -> PAID` with an expected-state update.
3. Stores the `disbursement` proof attachment.
4. Transitions the loan application and creates the repayment plan when required.
5. Appends the customer ledger and fund account journal entries.
6. Writes the operator audit record with transaction and attachment identifiers.

Private file bytes are uploaded before the database transaction because Supabase Storage and PostgreSQL cannot share one transaction. If the database transaction fails, the uploaded object is deleted on a best-effort cleanup path. HTTPS evidence links do not create Storage objects.

## Access control

- Administrators need `ledger:view` to read a proof.
- Funders can read only proofs attached to disbursements from their own fund accounts.
- Client sessions cannot read funder bank evidence.
- Responses use `private, no-store` and `X-Content-Type-Options: nosniff` for stored files.

## Deliberate boundary

This slice does not claim that one disbursement is funded by one historical capital inflow. Repayment credits and interest settlements can replenish the same fund account, so a single `capitalInflowId` foreign key would create false accounting attribution. True source-lot tracing must allocate every credit and debit journal entry, not only capital inflows.

## Verification

- `npm run check:invariants`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run db:push`
