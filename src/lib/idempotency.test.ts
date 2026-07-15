import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { getScopedIdempotencyKey } from "@/lib/idempotency";

describe("idempotency key scoping", () => {
  it("returns null when the request has no idempotency header", () => {
    const req = new Request("http://localhost/api/client/loan-applications");

    expect(getScopedIdempotencyKey(req, ["client", "c1", "loan-application"])).toBeNull();
  });

  it("scopes the key by portal actor and business action", () => {
    const req = new Request("http://localhost/api/client/loan-applications", {
      headers: { "x-idempotency-key": "submit-1" },
    });

    expect(getScopedIdempotencyKey(req, ["client", "c1", "loan-application"])).toBe(
      "client:c1:loan-application:submit-1"
    );
  });

  it("rejects blank or oversized keys instead of storing unsafe values", () => {
    const blank = new Request("http://localhost/api/client/loan-applications", {
      headers: { "x-idempotency-key": "   " },
    });
    const oversized = new Request("http://localhost/api/client/loan-applications", {
      headers: { "x-idempotency-key": "x".repeat(181) },
    });

    expect(getScopedIdempotencyKey(blank, ["client", "c1", "loan-application"])).toBeNull();
    expect(getScopedIdempotencyKey(oversized, ["client", "c1", "loan-application"])).toBeNull();
  });

  it("requires every scoped API route to use the atomic response wrapper", () => {
    const apiRoot = path.join(process.cwd(), "src/app/api");
    const routeFiles: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolute);
        if (entry.isFile() && entry.name === "route.ts") routeFiles.push(absolute);
      }
    };
    visit(apiRoot);

    const scopedRoutes = routeFiles.filter((file) =>
      readFileSync(file, "utf8").includes("getScopedIdempotencyKey("),
    );
    expect(scopedRoutes.length).toBeGreaterThan(0);

    for (const file of scopedRoutes) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("withIdempotencyResponse(");
      expect(source, file).not.toContain("checkIdempotencyKey(");
      expect(source, file).not.toContain("saveIdempotencyResult(");
    }
  });
});
