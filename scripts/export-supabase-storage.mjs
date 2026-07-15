#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  encodeObjectPath,
  getStorageApiConfig,
  listAllStorageObjects,
  resolveSafeObjectPath,
  storageApiHeaders,
} from "./supabase-storage-backup-utils.mjs";

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function main() {
  const outputDirectory = path.resolve(
    argumentValue("--output", process.env.STORAGE_BACKUP_DIR || ".backup/storage"),
  );
  const objectsDirectory = path.join(outputDirectory, "objects");
  const config = getStorageApiConfig();

  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  if ((await readdir(outputDirectory)).length > 0) {
    throw new Error(`Storage backup directory must be empty: ${outputDirectory}`);
  }
  await mkdir(objectsDirectory, { recursive: true, mode: 0o700 });

  const listedObjects = await listAllStorageObjects(config);
  const files = [];

  for (const object of listedObjects) {
    const response = await fetch(
      `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeObjectPath(object.path)}`,
      { headers: storageApiHeaders(config, ""), cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Supabase Storage download failed for ${object.path} (${response.status})`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (object.listedSize !== null && object.listedSize !== bytes.byteLength) {
      throw new Error(
        `Supabase Storage size changed during export for ${object.path}: listed ${object.listedSize}, downloaded ${bytes.byteLength}`,
      );
    }

    const destination = resolveSafeObjectPath(objectsDirectory, object.path);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, bytes, { mode: 0o600 });
    files.push({
      path: object.path,
      size: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      contentType: response.headers.get("content-type") || "application/octet-stream",
    });
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    bucket: config.bucket,
    totalFiles: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    files,
  };
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );

  console.log(
    `Exported ${manifest.totalFiles} private Storage objects (${manifest.totalBytes} bytes) from bucket ${manifest.bucket}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
