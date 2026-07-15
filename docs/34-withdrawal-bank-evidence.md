# Funder withdrawal bank evidence

## Decision

`APPROVED` means that the withdrawal has actually been paid from a fund account. It is not a desk-only approval state. The operator must therefore provide bank evidence before the system debits the account.

The admin action is labelled as payment confirmation in the UI while the stored status remains `APPROVED` for compatibility with statements, notifications and reconciliation.

## Required evidence

Every approved withdrawal stores:

- the debited `FundAccount` through a database foreign key;
- an account-scoped bank transaction ID;
- the payer bank and account-number snapshot;
- a protected `Attachment` with `entityType=funder_withdrawal`;
- the approving administrator and approval time;
- the transaction ID in fund-account journal metadata and the audit log.

A proof can be a private Supabase Storage object or an HTTPS evidence link. Private files are limited by the shared proof policy to supported image/PDF types and 10 MB.

## Transaction boundary

The serializable approval transaction performs the following operations together:

1. claims the pending withdrawal;
2. selects and debits an eligible fund account;
3. rejects a duplicate transaction ID for that account;
4. stores the payer-account snapshot on the withdrawal;
5. creates the proof attachment;
6. writes the audit record.

Any database failure rolls back the debit, status change, attachment row and audit row. If a private file was uploaded before the database transaction, the API attempts to delete it after a failure.

## Authorization

- `withdrawal:view` controls the admin list.
- `withdrawal:review` controls payment confirmation and rejection.
- the standard `finance` role receives both permissions during secure seed and infrastructure sync.
- funders can only read proof attachments for their own withdrawal records.
- clients cannot read funder-withdrawal attachments.

## Reconciliation

Daily financial reconciliation emits an error when an approved withdrawal lacks either:

- transaction ID or payer-account snapshot; or
- a non-deleted protected proof attachment.

This makes bank evidence part of release and operational health rather than a UI-only field.

## Production migration

Before applying the schema, verify that existing `account_id` values are not orphaned and that no approved withdrawal lacks an account. The July 2026 production preflight found zero withdrawal rows and zero orphan references.

After `prisma db push`, run `npm run db:ensure-infra` to install the dedicated finance-role permissions.
