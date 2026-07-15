# KYC Verification And Credit Gate

## Problem closed

Previously, a self-uploaded document in `UPLOADED` state counted as a valid KYC document. A customer could therefore unlock profile completion, the EUR 30,000 base credit limit, loan application, contract signing, and disbursement without internal review.

## Current invariant

- `UPLOADED` means the file exists and is waiting for internal review.
- Only an unexpired document in `VERIFIED` state satisfies the KYC gate.
- `REJECTED` documents must be replaced before they can be reviewed again.
- Re-uploading any document resets it to `UPLOADED`, clears prior review metadata, lowers the base limit to EUR 10,000, and clears profile completion.
- Verifying all three required documents raises the base limit to EUR 30,000.
- A manual `creditLimitOverride` remains independent of the calculated base limit.

The shared `getClientProfileCompletion` helper is used by application, risk, approval, contract signing, and disbursement paths. Those paths therefore enforce the same verified-document definition.

## Review flow

1. The customer or an administrator uploads one of the three required documents.
2. The document enters `UPLOADED` state and the client sees "waiting for internal review".
3. An administrator previews the document from the customer detail page.
4. The administrator either verifies it or rejects it with a required reason.
5. The review transaction updates the document, recalculates profile completion and base credit, and writes the old/new values to `audit_logs`.

Concurrent reviews use an expected-state update. If another request changes the document first, the later request receives HTTP 409 instead of overwriting the newer state.

## Deployment and operations

No database migration is required. Existing `CustomerKyc.status`, `verifiedAt`, `expiresAt`, and `remark` columns are reused, which preserves Supabase and free-tier deployment constraints.

Existing records in `UPLOADED` state intentionally become pending review. Internal staff must verify them from **Admin > Customers > Customer detail > Document management** before the related customer can pass protected loan lifecycle gates.

## Verification

- Unit test: `src/lib/client-profile.test.ts`
- Type check: `npm run typecheck`
- Full regression: `npm test`
- Repository invariants: `npm run verify`
- Production build: `npm run build`
