#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const MIB = 1024 * 1024;
const DEFAULT_DATABASE_LIMIT = 500 * MIB;
const DEFAULT_STORAGE_LIMIT = 1024 * MIB;
const WARNING_RATIO = 0.75;
const FAILURE_RATIO = 0.9;

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function positiveInteger(value, name, fallback) {
  const parsed = Number(value === undefined || value === "" ? fallback : value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function nonNegativeInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}

function formatBytes(bytes) {
  return `${(bytes / MIB).toFixed(1)} MiB`;
}

function evaluate(label, used, limit) {
  const ratio = used / limit;
  const summary = `${label}: ${formatBytes(used)} / ${formatBytes(limit)} (${(ratio * 100).toFixed(1)}%)`;
  if (ratio >= FAILURE_RATIO) return { level: "failure", summary };
  if (ratio >= WARNING_RATIO) return { level: "warning", summary };
  return { level: "ok", summary };
}

async function loadLiveUsage() {
  const { loadEnvConfig } = require("@next/env");
  const { PrismaClient } = require("@prisma/client");
  loadEnvConfig(process.cwd());

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        pg_database_size(current_database())::text AS "databaseBytes",
        COALESCE((
          SELECT SUM(
            CASE
              WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint
              ELSE 0
            END
          )
          FROM storage.objects
        ), 0)::text AS "storageBytes"
    `);
    const usage = rows[0];
    if (!usage) throw new Error("Supabase capacity query returned no result");
    return {
      databaseBytes: positiveInteger(usage.databaseBytes, "database bytes"),
      storageBytes: nonNegativeInteger(usage.storageBytes, "storage bytes"),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const databaseArgument = argumentValue("--database-bytes");
  const storageManifest = argumentValue("--storage-manifest");
  if (Boolean(databaseArgument) !== Boolean(storageManifest)) {
    throw new Error("--database-bytes and --storage-manifest must be provided together");
  }

  let databaseBytes;
  let storageBytes;
  if (databaseArgument && storageManifest) {
    databaseBytes = positiveInteger(databaseArgument, "database bytes");
    const manifest = JSON.parse(await readFile(storageManifest, "utf8"));
    storageBytes = nonNegativeInteger(manifest?.totalBytes, "Storage manifest totalBytes");
  } else {
    ({ databaseBytes, storageBytes } = await loadLiveUsage());
  }

  const databaseLimit = positiveInteger(
    process.env.FREE_TIER_DATABASE_LIMIT_BYTES,
    "FREE_TIER_DATABASE_LIMIT_BYTES",
    DEFAULT_DATABASE_LIMIT,
  );
  const storageLimit = positiveInteger(
    process.env.FREE_TIER_STORAGE_LIMIT_BYTES,
    "FREE_TIER_STORAGE_LIMIT_BYTES",
    DEFAULT_STORAGE_LIMIT,
  );
  const results = [
    evaluate("Database", databaseBytes, databaseLimit),
    evaluate("Private Storage", storageBytes, storageLimit),
  ];

  for (const result of results) {
    console.log(result.summary);
    if (process.env.GITHUB_ACTIONS === "true" && result.level !== "ok") {
      console.log(`::${result.level === "failure" ? "error" : "warning"}::${result.summary}`);
    }
  }

  if (results.some((result) => result.level === "failure")) {
    console.error("Free-tier capacity is at or above the 90% operational red line");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
