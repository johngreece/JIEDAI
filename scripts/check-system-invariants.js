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
const healthCheckSource = read("scripts/health-check.js");
const capacityCheckSource = read("scripts/check-free-tier-capacity.mjs");
const bootstrapSource = read("prisma/seed-bootstrap.js");
const ensureInfraSource = read("scripts/ensure-infra-tables.ts");
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
check(
  ensureInfraSource.includes("repayment_plans_one_active_per_application") &&
    ensureInfraSource.includes("WHERE \"status\" = 'ACTIVE'"),
  "PostgreSQL must enforce at most one active repayment plan per application"
);
check(
  packageJson.scripts?.["db:push"]?.includes("prisma-with-env.mjs"),
  "database maintenance commands must load .env.local through prisma-with-env.mjs"
);
check(
  healthCheckSource.includes('require("@next/env")') &&
    healthCheckSource.includes("loadEnvConfig(process.cwd())"),
  "health check must load the same Next.js environment files as the application"
);
check(
  packageJson.scripts?.["ops:check-capacity"] === "node scripts/check-free-tier-capacity.mjs" &&
    capacityCheckSource.includes("pg_database_size(current_database())") &&
    capacityCheckSource.includes("FROM storage.objects"),
  "standalone free-tier capacity checks must read live Supabase database and Storage usage"
);

const prismaSchema = read("prisma/schema.prisma");
const restructureCreateSource = read("src/app/api/restructures/route.ts");
const restructureApproveSource = read("src/app/api/restructures/[id]/approve/route.ts");
const disbursementConfirmSource = read("src/app/api/disbursements/[id]/confirm-paid/route.ts");
const withdrawalRouteSource = read("src/app/api/funder-withdrawals/route.ts");
const withdrawalServiceSource = read("src/services/funder-interest.service.ts");
const inflowCreateSource = read("src/app/api/fund-accounts/[id]/inflows/route.ts");
const inflowReviewSource = read("src/app/api/fund-accounts/[id]/inflows/[inflowId]/route.ts");
const clientRepaymentSource = read("src/app/api/client/repayments/route.ts");
const adminRepaymentSource = read("src/app/api/repayments/route.ts");
const repaymentConfirmSource = read("src/lib/repayment-confirm.ts");
const financeReconciliationSource = read("src/services/finance-reconciliation.service.ts");
const interestSettlementServiceSource = read("src/services/funder-interest-settlement.service.ts");
const interestSettlementRouteSource = read("src/app/api/funder-interest-settlements/route.ts");
const legacySettlementServiceSource = read("src/services/settlement.service.ts");
const legacySettlementRouteSource = read("src/app/api/settlement/route.ts");
const settlementPageSource = read("src/components/admin/pages/SettlementPageClient.tsx");
const launchReadinessMutationRouteSource = read(
  "src/app/api/admin/launch-readiness/notification-scenarios/route.ts"
);
const launchReadinessReadRouteSource = read(
  "src/app/api/admin/launch-readiness/route.ts"
);
const launchReadinessPageSource = read(
  "src/components/admin/pages/LaunchReadinessPageClient.tsx"
);
for (const field of ["remainingPrincipal", "remainingInterest", "remainingFee"]) {
  check(
    prismaSchema.includes(field),
    `repayment schedule schema must persist ${field}`
  );
}
for (const field of ["oldPlanVersion", "remainingPenalty", "projectedInterest"]) {
  check(
    prismaSchema.includes(field),
    `restructure schema must persist ${field}`
  );
}
check(
  restructureCreateSource.includes("loadRestructurePlanSnapshot") &&
    restructureCreateSource.includes("withIdempotencyResponse") &&
    !restructureCreateSource.includes("remainingPrincipal: z.number") &&
    !restructureCreateSource.includes("remainingInterest: z.number"),
  "restructure creation must use idempotent database-authoritative balances"
);
check(
  restructureApproveSource.includes("restructureBalancesMatch") &&
    restructureApproveSource.includes("generateRestructurePlan") &&
    restructureApproveSource.includes("record.oldPlanVersion !== oldPlan.version"),
  "restructure approval must revalidate balances, plan version and pricing"
);
check(
  prismaSchema.includes("@@unique([fundAccountId, batchNo])"),
  "bank transaction IDs must be unique within each fund account"
);
check(
  disbursementConfirmSource.includes("parseDisbursementEvidenceRequest") &&
    disbursementConfirmSource.includes('entityType: "disbursement"') &&
    disbursementConfirmSource.includes("proofAttachmentId") &&
    disbursementConfirmSource.includes("payerAccount") &&
    disbursementConfirmSource.includes("payerBank"),
  "disbursement confirmation must persist bank identity, private proof, journal metadata and audit evidence"
);
check(
  prismaSchema.includes("transactionId       String    @unique @map(\"transaction_id\")") &&
    prismaSchema.includes("payerBank           String    @map(\"payer_bank\")") &&
    prismaSchema.includes("payerAccount        String    @map(\"payer_account\")"),
  "repayments must persist globally unique transaction identity and payer account evidence"
);
check(
  clientRepaymentSource.includes("validateRepaymentPaymentEvidence") &&
    clientRepaymentSource.includes('entityType: "repayment"') &&
    adminRepaymentSource.includes("validateRepaymentPaymentEvidence") &&
    adminRepaymentSource.includes('category: "REPAYMENT_PAYMENT_PROOF"'),
  "client and admin repayment registration must require protected payment evidence"
);
check(
  repaymentConfirmSource.includes("REPAYMENT_BANK_EVIDENCE_MISSING") &&
    repaymentConfirmSource.includes("REPAYMENT_PAYMENT_PROOF_MISSING") &&
    repaymentConfirmSource.includes("proofAttachmentId") &&
    financeReconciliationSource.includes('code: "REPAYMENT_BANK_EVIDENCE_MISSING"') &&
    financeReconciliationSource.includes('code: "REPAYMENT_PAYMENT_PROOF_MISSING"'),
  "repayment confirmation and reconciliation must fail closed on missing payment evidence"
);
check(
  prismaSchema.includes("@@unique([accountId, transactionId])") &&
    prismaSchema.includes("account FundAccount? @relation(fields: [accountId], references: [id])"),
  "funder withdrawals must reference a fund account and enforce account-scoped transaction IDs"
);
check(
  withdrawalRouteSource.includes('requirePermission(["withdrawal:review"])') &&
    withdrawalRouteSource.includes("validateBankTransactionEvidence") &&
    withdrawalRouteSource.includes("storeProofFile") &&
    withdrawalServiceSource.includes('entityType: "funder_withdrawal"') &&
    withdrawalServiceSource.includes("transactionId: evidence.transactionId"),
  "withdrawal payout confirmation must require dedicated permission and protected bank evidence"
);
check(
  seedSource.includes('"withdrawal:view"') &&
    seedSource.includes('"withdrawal:review"') &&
    ensureInfraSource.includes('finance:withdrawal:view') &&
    ensureInfraSource.includes('finance:withdrawal:review'),
  "finance role seed and infrastructure sync must include dedicated withdrawal permissions"
);
check(
  prismaSchema.includes("@@unique([fundAccountId, transactionId])") &&
    prismaSchema.includes('reviewedBy  User?       @relation("CapitalInflowReviewer"'),
  "capital inflows must enforce account-scoped transaction IDs and reviewer ownership"
);
check(
  inflowCreateSource.includes("validateCapitalInflowEvidence") &&
    inflowCreateSource.includes('entityType: "capital_inflow"') &&
    inflowCreateSource.includes("reviewedById: session.sub") &&
    inflowReviewSource.includes("Capital inflow bank evidence is missing") &&
    inflowReviewSource.includes('requirePermission(["inflow:review"])') &&
    inflowReviewSource.includes("withIdempotencyResponse"),
  "capital inflow create and review must require protected bank evidence, reviewer trail, dedicated permission and idempotency"
);
check(
  seedSource.includes('"inflow:view"') &&
    seedSource.includes('"inflow:create"') &&
    seedSource.includes('"inflow:review"') &&
    ensureInfraSource.includes("finance:inflow:view") &&
    ensureInfraSource.includes("finance:inflow:create") &&
    ensureInfraSource.includes("finance:inflow:review"),
  "finance role seed and infrastructure sync must include dedicated capital inflow permissions"
);
check(
  interestSettlementServiceSource.includes('POSTED_BY_PLATFORM: "POSTED_BY_PLATFORM"') &&
    interestSettlementServiceSource.includes('FUNDER_DISPUTED: "FUNDER_DISPUTED"') &&
    !interestSettlementServiceSource.includes('PAID_BY_PLATFORM:') &&
    !interestSettlementServiceSource.includes('FUNDER_REJECTED:'),
  "funder interest settlements must use internal posting states instead of direct bank-payment states"
);
const settlementPostSection = interestSettlementServiceSource.slice(
  interestSettlementServiceSource.indexOf("static async postByPlatform"),
  interestSettlementServiceSource.indexOf("static async confirmByFunder")
);
const settlementConfirmSection = interestSettlementServiceSource.slice(
  interestSettlementServiceSource.indexOf("static async confirmByFunder"),
  interestSettlementServiceSource.indexOf("static async disputeByFunder")
);
check(
  !settlementPostSection.includes("writeFundAccountLedgerEntryAndUpdateAccount") &&
    settlementConfirmSection.includes("writeFundAccountLedgerEntryAndUpdateAccount") &&
    settlementConfirmSection.includes('referenceType: "funder_interest_settlement"') &&
    settlementConfirmSection.includes("totalProfitDelta"),
  "interest settlement publication must not credit funds; funder confirmation must atomically credit the internal account"
);
check(
  interestSettlementRouteSource.includes('requirePermission(["settlement:view"])') &&
    interestSettlementRouteSource.includes('requirePermission(["settlement:manage"])') &&
    seedSource.includes('"settlement:view"') &&
    seedSource.includes('"settlement:manage"') &&
    ensureInfraSource.includes("finance:settlement:view") &&
    ensureInfraSource.includes("finance:settlement:manage"),
  "finance role seed and infrastructure sync must include dedicated settlement permissions"
);
check(
  !legacySettlementRouteSource.includes("export async function POST") &&
    !legacySettlementRouteSource.includes("persist-funder-shares") &&
    !legacySettlementRouteSource.includes("settle-funder-share") &&
    !/fundProfitShare\.(create|update|delete|upsert)\s*\(/.test(legacySettlementServiceSource),
  "legacy FundProfitShare reporting must remain read-only; settlement writes belong to FunderInterestSettlement"
);
check(
  legacySettlementServiceSource.includes("interestSettlements:") &&
    settlementPageSource.includes("item.settlementSummary") &&
    !settlementPageSource.includes("item.existingSettlement"),
  "finance settlement reporting must display status from FunderInterestSettlement"
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
check(
    launchReadinessMutationRouteSource.includes("if (!isIsolatedRegressionRuntime())") &&
    launchReadinessMutationRouteSource.indexOf("if (!isIsolatedRegressionRuntime())") <
      launchReadinessMutationRouteSource.indexOf(
        "const session = await requirePermission"
      ),
  "launch-readiness notification fixtures must fail closed before authentication or database access"
);
check(
  launchReadinessReadRouteSource.includes(
    "scenarioFixturesEnabled: isIsolatedRegressionRuntime()"
  ) &&
    launchReadinessPageSource.includes(
      "disabled={running || !data?.scenarioFixturesEnabled}"
    ) &&
    !launchReadinessPageSource.includes("db:seed-demo"),
  "production launch readiness must remain read-only and must not offer demo fixture injection"
);

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
  if (!/\.test\.[jt]sx?$/.test(file) && source.includes("dangerouslySetInnerHTML")) {
    errors.push(`${file} renders raw HTML; stored contract HTML must use ContractHtmlFrame`);
  }
}

const contractFrameSource = read("src/components/ContractHtmlFrame.tsx");
const contractDocumentSource = read("src/lib/contract-html.ts");
check(
  contractFrameSource.includes('sandbox=""') &&
    contractFrameSource.includes('referrerPolicy="no-referrer"'),
  "contract HTML iframe must remain sandboxed and suppress referrers"
);
check(
  contractDocumentSource.includes("default-src 'none'") &&
    contractDocumentSource.includes("script-src 'none'") &&
    contractDocumentSource.includes("connect-src 'none'") &&
    contractDocumentSource.includes("form-action 'none'"),
  "contract HTML iframe must retain its fail-closed Content Security Policy"
);

const privateUploadFiles = [
  "src/app/api/client/documents/route.ts",
  "src/app/api/customers/[id]/documents/route.ts",
  "src/lib/proof-attachment.ts",
  "src/app/api/disbursements/[id]/confirm-paid/route.ts",
  "src/app/api/client/repayments/route.ts",
  "src/app/api/repayments/route.ts",
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
check(
  read("src/app/api/attachments/[id]/file/route.ts").includes("customerId: session.sub") &&
    read("src/app/api/attachments/[id]/file/route.ts").includes('attachment.entityType !== "repayment"'),
  "client repayment proof downloads must enforce customer ownership"
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
check(
  !backupWorkflow.includes("${{ runner.temp }}"),
  "backup workflow must initialize runner-temporary paths at step runtime"
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

console.log(`System invariants passed: EUR only, authoritative repayment components and restructure repricing enforced, disbursement, repayment, withdrawal and capital inflow bank evidence required, regression writes isolated, private file storage and encrypted restore-tested backups enforced, ${sourceFiles.length} source files scanned, daily Hobby cron valid.`);
