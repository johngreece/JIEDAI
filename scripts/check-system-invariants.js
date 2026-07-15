#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(directory) {
  const absolute = path.join(root, directory);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(relative) : [relative];
  });
}

const systemConfig = read("src/lib/system-config.ts");
check(
  /SYSTEM_CURRENCY\s*=\s*["']EUR["']/.test(systemConfig),
  "src/lib/system-config.ts must keep SYSTEM_CURRENCY fixed to EUR"
);

const sourceFiles = walk("src").filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
const forbiddenCurrencies = /\b(USD|CNY|RMB|GBP|JPY|CHF)\b/g;
for (const file of sourceFiles) {
  const source = read(file);
  const matches = [...source.matchAll(forbiddenCurrencies)];
  if (matches.length > 0) {
    errors.push(`${file} declares forbidden currency codes: ${[...new Set(matches.map((m) => m[0]))].join(", ")}`);
  }
  if (
    file !== path.join("src", "lib", "system-config.ts") &&
    !/\.test\.[jt]sx?$/.test(file) &&
    /\bcurrency\s*:\s*["'`]/.test(source)
  ) {
    errors.push(`${file} hard-codes a currency outside src/lib/system-config.ts`);
  }
}

const privateUploadFiles = [
  "src/app/api/client/documents/route.ts",
  "src/app/api/customers/[id]/documents/route.ts",
  "src/lib/proof-attachment.ts",
];
for (const file of privateUploadFiles) {
  const source = read(file);
  check(!/toString\(["']base64["']\)/.test(source), `${file} must not write Base64 files into Postgres`);
  check(!/data:\$\{[^}]+\};base64/.test(source), `${file} must not construct data URLs for new uploads`);
}
check(
  read("src/app/api/client/documents/route.ts").includes("uploadPrivateFile({"),
  "client KYC uploads must use private Supabase Storage"
);
check(
  read("src/app/api/customers/[id]/documents/route.ts").includes("uploadPrivateFile({"),
  "admin KYC uploads must use private Supabase Storage"
);
check(
  read("src/lib/proof-attachment.ts").includes("uploadPrivateFile({"),
  "financial proof uploads must use private Supabase Storage"
);
check(
  read("src/app/api/customer-documents/[id]/file/route.ts").includes("customerId: session.sub"),
  "client KYC downloads must enforce customer ownership"
);
check(
  read("src/app/api/attachments/[id]/file/route.ts").includes("funderId: session.sub"),
  "funder proof downloads must enforce funder ownership"
);

const vercelConfig = JSON.parse(read("vercel.json"));
const crons = Array.isArray(vercelConfig.crons) ? vercelConfig.crons : [];
check(crons.length === 1, "Vercel Hobby deployment must expose exactly one daily cron");
if (crons.length === 1) {
  check(crons[0].path === "/api/cron/daily", "the only Vercel cron must call /api/cron/daily");
  check(
    /^\d{1,2}\s+\d{1,2}\s+\*\s+\*\s+\*$/.test(crons[0].schedule),
    "Vercel Hobby cron must run no more than once per day"
  );
}

if (errors.length > 0) {
  console.error("System invariant check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`System invariants passed: EUR only, private file storage enforced, ${sourceFiles.length} source files scanned, daily Hobby cron valid.`);
