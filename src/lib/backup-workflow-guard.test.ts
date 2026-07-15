import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workflow = readFileSync(
  path.join(root, ".github", "workflows", "weekly-backup.yml"),
  "utf8",
);

describe("weekly encrypted backup guard", () => {
  it("backs up both PostgreSQL and private Storage", () => {
    expect(workflow).toContain("pg_dump");
    expect(workflow).toContain("--schema=public");
    expect(workflow).toContain("export-supabase-storage.mjs");
    expect(workflow).toContain("database-metrics.txt");
  });

  it("restore-tests the encrypted archive before publishing it", () => {
    const restoreIndex = workflow.indexOf("Decrypt and restore-test backup");
    const uploadIndex = workflow.indexOf("Upload encrypted backup only");

    expect(workflow).toContain("openssl enc -aes-256-cbc");
    expect(workflow).toContain("-pbkdf2 -iter 200000");
    expect(workflow).toContain("pg_restore");
    expect(workflow).toContain("--exit-on-error");
    expect(workflow).toContain("diff --unified");
    expect(restoreIndex).toBeGreaterThan(0);
    expect(uploadIndex).toBeGreaterThan(restoreIndex);
  });

  it("uploads only the encrypted artifact with short retention", () => {
    const uploadStep = workflow.match(
      /- name: Upload encrypted backup only[\s\S]*?(?=\n\s+- name:)/,
    )?.[0];

    expect(uploadStep).toContain("path: ${{ env.ENCRYPTED_BACKUP }}");
    expect(uploadStep).toContain("retention-days: 21");
    expect(uploadStep).not.toContain("database.dump");
    expect(uploadStep).not.toContain("internal-backup.tar.gz\n");
  });
});
