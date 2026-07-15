import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("portal page session guards", () => {
  it("redirects inactive or invalid portal sessions before protected pages render", () => {
    const adminLayout = source("src/app/admin/(main)/layout.tsx");
    const clientLayout = source("src/app/client/(main)/layout.tsx");
    const funderLayout = source("src/app/funder/(main)/layout.tsx");

    expect(adminLayout).toContain("await getActiveAdminSession()");
    expect(adminLayout).toContain('redirect("/admin/login")');
    expect(clientLayout).toContain("await getActiveClientSession()");
    expect(clientLayout).toContain('redirect("/client/login")');
    expect(funderLayout).toContain("await getActiveFunderSession()");
    expect(funderLayout).toContain('redirect("/funder/login")');
  });

  it("checks the live admin account and role before RBAC authorization", () => {
    const sessions = source("src/lib/portal-session.ts");
    const rbac = source("src/lib/rbac.ts");
    const currentUser = source("src/app/api/auth/me/route.ts");

    expect(sessions).toContain("export async function getActiveAdminSession");
    expect(sessions).toContain("deletedAt: null, isActive: true");
    expect(sessions).toContain("roles: [user.role.code]");
    expect(rbac.match(/getActiveAdminSession\(\)/g)).toHaveLength(2);
    expect(currentUser).toContain("await getActiveAdminSession()");
  });
});
