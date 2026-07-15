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

const packageJson = JSON.parse(read("package.json"));
const seedSource = read("prisma/seed.js");
const bootstrapSource = read("prisma/seed-bootstrap.js");
check(
  !packageJson.scripts?.["db:seed-demo"] && !packageJson.scripts?.["db:clear-business-data"],
  "production package scripts must not expose demo data creation or destructive business-data clearing"
);
check(
  !fs.existsSync(path.join(root, "scripts/seed-demo-data.js")) &&
    !fs.existsSync(path.join(root, "scripts/clear-business-mock-data.js")),
  "demo financial seed and destructive business-data clearing scripts must stay removed"
);
check(
  seedSource.includes("ensureBootstrapAdmin") &&
    bootstrapSource.includes("BOOTSTRAP_ADMIN_PASSWORD"),
  "database seed must use the fail-closed bootstrap admin flow"
);
check(
  !/bcrypt\.hash\(\s*["'`]/.test(seedSource) &&
    !/passwordHash\s*:\s*["'`]/.test(seedSource),
  "database seed must not contain a hard-coded administrator password or hash"
);

const mutatingRegressionScripts = [
  "scripts/full-regression.js",
  "scripts/launch-readiness-smoke.js",
  "scripts/test-external-touchpoints.ts",
  "scripts/test-message-delivery-queue.ts",
];
for (const file of mutatingRegressionScripts) {
  const source = read(file);
  check(
    source.includes("requireIsolatedRegressionDatabase"),
    `${file} must fail closed unless it uses an isolated regression database`
  );
}

const scriptFiles = walk("scripts").filter((file) => /\.(ts|js|mjs)$/.test(file));
for (const file of scriptFiles) {
  const source = read(file);
  check(
    !/bcrypt\.hash\(\s*["'`][^"'`]+["'`]/.test(source),
    `${file} must not hash a hard-coded fixture password`
  );
}

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

const backupWorkflow = read(".github/workflows/weekly-backup.yml");
const backupRequirements = [
  [/cron:\s*["']30 2 \* \* 0["']/, "encrypted backup must run weekly"],
  [/permissions:\s*\r?\n\s+contents:\s*read/, "backup workflow permissions must be read-only"],
  [/pg_dump[\s\S]*--schema=public/, "backup workflow must dump the public database schema"],
  [/export-supabase-storage\.mjs/, "backup workflow must export private Storage objects"],
  [/openssl enc -aes-256-cbc[\s\S]*-pbkdf2[\s\S]*-iter 200000/, "backup workflow must use strong password-based encryption"],
  [/pg_restore[\s\S]*--exit-on-error/, "backup workflow must perform a failing restore test"],
  [/backup-database-metrics\.sql/, "backup workflow must compare restored financial metrics"],
  [/actions\/upload-artifact@v4/, "backup workflow must publish an encrypted artifact"],
  [/retention-days:\s*21/, "backup artifacts must use the 21-day retention policy"],
  [/check-free-tier-capacity\.mjs/, "backup workflow must enforce free-tier capacity red lines"],
];
for (const [pattern, message] of backupRequirements) check(pattern.test(backupWorkflow), message);
check(
  /path:\s*\$\{\{ env\.ENCRYPTED_BACKUP \}\}/.test(backupWorkflow),
  "backup workflow may upload only the encrypted archive"
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

console.log(`System invariants passed: EUR only, regression writes isolated, private file storage and encrypted restore-tested backups enforced, ${sourceFiles.length} source files scanned, daily Hobby cron valid.`);
