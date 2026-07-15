#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const MIB = 1024 * 1024;
const DEFAULT_DATABASE_LIMIT = 500 * MIB;
const DEFAULT_STORAGE_LIMIT = 1024 * MIB;
const WARNING_RATIO = 0.75;
const FAILURE_RATIO = 0.9;

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? "" : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function positiveInteger(value, name, fallback) {
  const parsed = Number(value === undefined || value === "" ? fallback : value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
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

async function main() {
  const databaseBytes = positiveInteger(argumentValue("--database-bytes"), "database bytes");
  const manifest = JSON.parse(await readFile(argumentValue("--storage-manifest"), "utf8"));
  if (!Number.isSafeInteger(manifest?.totalBytes) || manifest.totalBytes < 0) {
    throw new Error("Storage manifest does not contain a valid totalBytes value");
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
    evaluate("Private Storage", manifest.totalBytes, storageLimit),
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
