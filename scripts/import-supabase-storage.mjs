#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import {
  encodeObjectPath,
  getStorageApiConfig,
  resolveSafeObjectPath,
  sha256File,
  storageApiHeaders,
} from "./supabase-storage-backup-utils.mjs";

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function assertManifest(manifest) {
  if (
    manifest?.version !== 1 ||
    typeof manifest.bucket !== "string" ||
    !Array.isArray(manifest.files) ||
    !Number.isSafeInteger(manifest.totalFiles) ||
    !Number.isSafeInteger(manifest.totalBytes)
  ) {
    throw new Error("Storage backup manifest is invalid or unsupported");
  }
}

async function main() {
  const inputDirectory = path.resolve(
    argumentValue("--input", process.env.STORAGE_BACKUP_DIR || ".backup/storage"),
  );
  const apply = process.argv.includes("--apply");
  const manifest = JSON.parse(await readFile(path.join(inputDirectory, "manifest.json"), "utf8"));
  assertManifest(manifest);

  const seenPaths = new Set();
  let totalBytes = 0;
  for (const file of manifest.files) {
    if (
      typeof file?.path !== "string" ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      typeof file.contentType !== "string"
    ) {
      throw new Error("Storage backup manifest contains an invalid file entry");
    }
    if (seenPaths.has(file.path)) throw new Error(`Duplicate Storage path in manifest: ${file.path}`);
    seenPaths.add(file.path);

    const filePath = resolveSafeObjectPath(path.join(inputDirectory, "objects"), file.path);
    const stat = await lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Storage backup entry is not a regular file: ${file.path}`);
    }
    if (stat.size !== file.size) {
      throw new Error(`Storage backup size mismatch for ${file.path}`);
    }
    if ((await sha256File(filePath)) !== file.sha256) {
      throw new Error(`Storage backup checksum mismatch for ${file.path}`);
    }
    totalBytes += file.size;
  }

  if (manifest.totalFiles !== manifest.files.length || manifest.totalBytes !== totalBytes) {
    throw new Error("Storage backup manifest totals do not match its file entries");
  }

  if (!apply) {
    console.log(
      `Validated ${manifest.totalFiles} private Storage objects (${manifest.totalBytes} bytes); no files uploaded without --apply`,
    );
    return;
  }

  const config = getStorageApiConfig();
  if (config.bucket !== manifest.bucket) {
    throw new Error(
      `Storage bucket mismatch: backup uses ${manifest.bucket}, configured target is ${config.bucket}`,
    );
  }

  for (const file of manifest.files) {
    const filePath = resolveSafeObjectPath(path.join(inputDirectory, "objects"), file.path);
    const response = await fetch(
      `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeObjectPath(file.path)}`,
      {
        method: "POST",
        headers: {
          ...storageApiHeaders(config, file.contentType || "application/octet-stream"),
          "cache-control": "3600",
          "x-upsert": "false",
        },
        body: await readFile(filePath),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Storage restore failed for ${file.path} (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`,
      );
    }
  }

  console.log(`Restored ${manifest.totalFiles} private Storage objects to bucket ${manifest.bucket}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
