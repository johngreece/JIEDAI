# Admin page RBAC closure

## Scope

The admin workspace now uses the database role-permission assignments as the
single runtime source for page access and navigation visibility.

The change closes three separate paths that must stay aligned:

1. API routes continue to enforce operation-level permissions with
   `requirePermission`.
2. Server Components that prefetch business data authorize before calling
   Prisma-backed loaders.
3. The sidebar, dashboard shortcuts, finance shortcuts, direct admin routes,
   and nested detail routes use the shared route policy.

## Runtime flow

`src/app/admin/(main)/layout.tsx` loads an active administrator session and
resolves its current permission codes through `getAdminPermissionCodes`.
Those codes are passed to `AdminWorkspaceShell` and published through
`AdminAccessProvider` for client-side navigation controls.

`src/lib/admin-access-policy.ts` maps each admin route family to one or more
permissions. Nested detail pages inherit the policy of their module. Unknown
admin routes fail closed for non-super-admin accounts. Funder administration
remains super-admin only because its APIs also enforce that restriction.

## Server-side data boundary

The following server-rendered pages read business data before the browser can
call an API and therefore keep explicit server-side authorization:

- dashboard: `dashboard:view`
- customers: `customer:view`
- loan applications: `loan:view`
- repayments: `repayment:view`
- funders: active super administrator

Client-side route hiding is only a usability layer. It does not replace the
page guard above or the API permission check.

## Change rule

When adding an admin module:

1. Add its route family to `ADMIN_ROUTE_POLICIES`.
2. Guard every server-side business-data prefetch before the data call.
3. Protect every API read and mutation with the matching permission.
4. Add or update policy tests and the system invariant check.
5. Verify at least one allowed role and one denied role before release.

The route policy intentionally uses OR semantics to match `requirePermission`.
Mutation buttons remain governed by their dedicated API permissions even when
the containing page is visible through a read permission.
