import { describe, expect, it } from "vitest";

import {
  canAccessAdminPath,
  findAdminRoutePolicy,
} from "./admin-access-policy";

describe("admin route access policy", () => {
  it("allows finance users into finance workflows but not super-admin areas", () => {
    const finance = {
      permissions: [
        "dashboard:view",
        "inflow:view",
        "ledger:view",
        "settlement:view",
        "withdrawal:view",
      ],
      isSuperAdmin: false,
    };

    expect(canAccessAdminPath("/admin/finance", finance)).toBe(true);
    expect(canAccessAdminPath("/admin/finance-reconciliation", finance)).toBe(true);
    expect(canAccessAdminPath("/admin/funder-withdrawals", finance)).toBe(true);
    expect(canAccessAdminPath("/admin/funders", finance)).toBe(false);
    expect(canAccessAdminPath("/admin/users", finance)).toBe(false);
  });

  it("inherits access policy on nested detail routes", () => {
    const manager = {
      permissions: ["customer:view", "loan:view", "overdue:view"],
      isSuperAdmin: false,
    };

    expect(canAccessAdminPath("/admin/customers/customer-1", manager)).toBe(true);
    expect(canAccessAdminPath("/admin/loan-applications/loan-1", manager)).toBe(true);
    expect(canAccessAdminPath("/admin/disbursements/disbursement-1", manager)).toBe(false);
  });

  it("fails closed for unknown admin routes", () => {
    const operator = {
      permissions: ["dashboard:view"],
      isSuperAdmin: false,
    };

    expect(findAdminRoutePolicy("/admin/unknown-module")).toBeUndefined();
    expect(canAccessAdminPath("/admin/unknown-module", operator)).toBe(false);
  });

  it("allows super administrators through every known or unknown admin route", () => {
    const superAdmin = { permissions: ["*"], isSuperAdmin: true };

    expect(canAccessAdminPath("/admin/funders", superAdmin)).toBe(true);
    expect(canAccessAdminPath("/admin/unknown-module", superAdmin)).toBe(true);
  });
});
