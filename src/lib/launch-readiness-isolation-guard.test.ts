import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("launch readiness fixture isolation", () => {
  it("rejects notification fixture writes before authentication or database access", () => {
    const route = source(
      "src/app/api/admin/launch-readiness/notification-scenarios/route.ts",
    );
    const guard = route.indexOf("if (!isIsolatedRegressionRuntime())");
    const permission = route.indexOf("const session = await requirePermission");

    expect(guard).toBeGreaterThan(-1);
    expect(permission).toBeGreaterThan(guard);
    expect(route).toContain("available only in an isolated regression runtime");
  });

  it("publishes the server-side capability and disables production fixture controls", () => {
    const readRoute = source("src/app/api/admin/launch-readiness/route.ts");
    const page = source(
      "src/components/admin/pages/LaunchReadinessPageClient.tsx",
    );

    expect(readRoute).toContain(
      "scenarioFixturesEnabled: isIsolatedRegressionRuntime()",
    );
    expect(page).toContain("disabled={running || !data?.scenarioFixturesEnabled}");
    expect(page).toContain("生产环境禁止场景写入");
    expect(page).not.toContain("db:seed-demo");
  });
});
