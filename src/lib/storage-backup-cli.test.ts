import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "storage-backup-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runNode(
  script: string,
  args: string[],
  env: Record<string, string | undefined> = {},
) {
  return spawnSync(process.execPath, [path.join(repositoryRoot, "scripts", script), ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function writeStorageBackup(directory: string, content = Buffer.from("private-proof")) {
  const objectPath = "capital-inflows/account/proof.pdf";
  const objectFile = path.join(directory, "objects", ...objectPath.split("/"));
  mkdirSync(path.dirname(objectFile), { recursive: true });
  writeFileSync(objectFile, content);
  writeFileSync(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      version: 1,
      generatedAt: new Date(0).toISOString(),
      bucket: "internal-files",
      totalFiles: 1,
      totalBytes: content.byteLength,
      files: [
        {
          path: objectPath,
          size: content.byteLength,
          sha256: createHash("sha256").update(content).digest("hex"),
          contentType: "application/pdf",
        },
      ],
    }),
  );
  return objectFile;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Storage backup CLI", () => {
  it("validates a complete backup without uploading it", () => {
    const directory = temporaryDirectory();
    writeStorageBackup(directory);

    const result = runNode("import-supabase-storage.mjs", ["--input", directory]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Validated 1 private Storage objects");
    expect(result.stdout).toContain("no files uploaded without --apply");
  });

  it("rejects a file changed after the manifest was written", () => {
    const directory = temporaryDirectory();
    const objectFile = writeStorageBackup(directory);
    writeFileSync(objectFile, "tampered");

    const result = runNode("import-supabase-storage.mjs", ["--input", directory]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/size mismatch|checksum mismatch/);
  });

  it("rejects object paths that escape the restore directory", () => {
    const directory = temporaryDirectory();
    writeFileSync(
      path.join(directory, "manifest.json"),
      JSON.stringify({
        version: 1,
        bucket: "internal-files",
        totalFiles: 1,
        totalBytes: 0,
        files: [
          {
            path: "../outside",
            size: 0,
            sha256: "0".repeat(64),
            contentType: "application/octet-stream",
          },
        ],
      }),
    );

    const result = runNode("import-supabase-storage.mjs", ["--input", directory]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsafe Storage object path");
  });

  it("fails when database capacity reaches the 90 percent red line", () => {
    const directory = temporaryDirectory();
    writeStorageBackup(directory, Buffer.alloc(1));

    const result = runNode(
      "check-free-tier-capacity.mjs",
      [
        "--database-bytes",
        "90",
        "--storage-manifest",
        path.join(directory, "manifest.json"),
      ],
      {
        FREE_TIER_DATABASE_LIMIT_BYTES: "100",
        FREE_TIER_STORAGE_LIMIT_BYTES: "100",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("90% operational red line");
  });
});
