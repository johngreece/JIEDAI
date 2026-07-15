import type { PermissionCode } from "./permissions";

export type AdminRoutePolicy = {
  path: string;
  anyOf?: readonly PermissionCode[];
  superAdminOnly?: boolean;
};

export type AdminAccessContext = {
  permissions: readonly string[];
  isSuperAdmin: boolean;
};

export const ADMIN_ROUTE_POLICIES: readonly AdminRoutePolicy[] = [
  { path: "/admin/settings/loan-fee", anyOf: ["settings:view"] },
  { path: "/admin/message-deliveries", anyOf: ["audit:view"] },
  { path: "/admin/funder-interest-settlements", anyOf: ["settlement:view"] },
  { path: "/admin/funder-withdrawals", anyOf: ["withdrawal:view"] },
  { path: "/admin/finance-reconciliation", anyOf: ["ledger:view"] },
  { path: "/admin/loan-applications", anyOf: ["loan:view"] },
  { path: "/admin/repayment-plans", anyOf: ["repayment:view"] },
  { path: "/admin/launch-readiness", anyOf: ["dashboard:view"] },
  { path: "/admin/capital-inflows", anyOf: ["inflow:view"] },
  { path: "/admin/disbursements", anyOf: ["disbursement:view"] },
  { path: "/admin/notifications", anyOf: ["dashboard:view"] },
  { path: "/admin/restructures", anyOf: ["loan:view"] },
  { path: "/admin/audit-logs", anyOf: ["audit:view"] },
  { path: "/admin/repayments", anyOf: ["repayment:view"] },
  { path: "/admin/extensions", anyOf: ["extension:view"] },
  { path: "/admin/customers", anyOf: ["customer:view"] },
  { path: "/admin/settlement", anyOf: ["ledger:view"] },
  { path: "/admin/templates", anyOf: ["settings:view"] },
  { path: "/admin/products", anyOf: ["settings:view"] },
  { path: "/admin/register", anyOf: ["customer:create"] },
  { path: "/admin/funders", superAdminOnly: true },
  { path: "/admin/overdue", anyOf: ["overdue:view"] },
  { path: "/admin/ledger", anyOf: ["ledger:view"] },
  { path: "/admin/users", anyOf: ["user:view"] },
  { path: "/admin/roles", anyOf: ["role:manage", "user:view"] },
  {
    path: "/admin/finance",
    anyOf: ["inflow:view", "ledger:view", "settlement:view", "withdrawal:view"],
  },
  { path: "/admin/dashboard", anyOf: ["dashboard:view"] },
  { path: "/admin", anyOf: ["dashboard:view"] },
];

function matchesPath(pathname: string, policyPath: string) {
  if (policyPath === "/admin") {
    return pathname === policyPath;
  }
  return pathname === policyPath || pathname.startsWith(`${policyPath}/`);
}

export function findAdminRoutePolicy(pathname: string) {
  return ADMIN_ROUTE_POLICIES.find((policy) => matchesPath(pathname, policy.path));
}

export function canAccessAdminPolicy(
  policy: AdminRoutePolicy | undefined,
  context: AdminAccessContext
) {
  if (context.isSuperAdmin || context.permissions.includes("*")) {
    return true;
  }

  if (!policy || policy.superAdminOnly) {
    return false;
  }

  return Boolean(
    policy.anyOf?.some((permission) => context.permissions.includes(permission))
  );
}

export function canAccessAdminPath(
  pathname: string,
  context: AdminAccessContext
) {
  return canAccessAdminPolicy(findAdminRoutePolicy(pathname), context);
}
