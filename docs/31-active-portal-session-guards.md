# Active portal session guards

Updated: 2026-07-15

## Problem closed

Protected admin and client pages could render their application shell when the browser held no valid session. Their API requests then returned `401`, leaving an empty page and console errors instead of returning the operator to login. Admin authorization also trusted the role stored in a token for up to seven days after an account or role changed.

## Runtime contract

1. Admin, client, and funder protected layouts resolve an active database-backed session before rendering.
2. Missing, expired, deleted, or disabled accounts redirect to their portal login page.
3. The admin workspace remains a client component, but it is wrapped by a server layout that performs the session check first.
4. Admin API permission checks use `getActiveAdminSession()` and therefore reject disabled or deleted users.
5. The live role code from the user record replaces the role embedded in the token for every admin authorization check.
6. `/api/auth/me` applies the same active-admin check and returns the current database role.

## Regression protection

`src/lib/portal-session-guard.test.ts` verifies all three protected layouts, the live admin account lookup, RBAC integration, and the current-user endpoint. Browser smoke checks confirm that invalid sessions redirect before protected APIs are requested.
