#!/usr/bin/env node
/**
 * 全链路健康检查 — 不需要启 dev server，纯静态依赖探测
 *
 * 用法：node scripts/health-check.js
 *
 * 检查项：
 *   1) 关键环境变量是否到位
 *   2) Prisma client 是否可加载
 *   3) 数据库连接是否可达（含基础设施新表是否存在）
 *   4) 单测是否通过（vitest run）
 *   5) TypeScript 是否无错（tsc --noEmit）
 *
 * 任一项失败会以非 0 退出，并打印断点 + 修复建议。
 */
"use strict";

// 手动加载 .env（避免引入 dotenv 依赖）
const fs = require("node:fs");
const path = require("node:path");
function loadDotenv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let [, key, val] = m;
    val = val.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotenv();

const REQUIRED_ENV = [
  ["DATABASE_URL", "运行时数据库连接（推荐 pooler URL）"],
  ["DIRECT_URL", "Prisma migrate/seed 用直连"],
  ["JWT_SECRET", "JWT 签名密钥（非默认值）"],
  ["CRON_SECRET", "四个 cron 路由强校验密钥"],
  ["ALLOWED_ORIGINS", "CORS 白名单，逗号分隔"],
];

const FORBIDDEN_JWT = "loan-system-secret-change-in-production";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} ${name}${detail ? " — " + detail : ""}`);
}

async function checkEnv() {
  let allOk = true;
  for (const [key, desc] of REQUIRED_ENV) {
    const value = process.env[key];
    if (!value || value.trim() === "") {
      record(`env.${key}`, false, `缺失（${desc}）`);
      allOk = false;
    } else if (key === "JWT_SECRET" && value === FORBIDDEN_JWT) {
      record(`env.${key}`, false, "仍是默认占位值，应用启动时会 throw");
      allOk = false;
    } else {
      record(`env.${key}`, true);
    }
  }
  return allOk;
}

async function checkPrismaClient() {
  try {
    const { PrismaClient } = require("@prisma/client");
    const client = new PrismaClient();
    const hasInfra =
      typeof client.idempotencyKey?.findUnique === "function" &&
      typeof client.rateLimitBucket?.findUnique === "function";
    await client.$disconnect();
    if (!hasInfra) {
      record("prisma.client", false, "client 缺少 idempotencyKey / rateLimitBucket（需 npx prisma generate）");
      return false;
    }
    record("prisma.client", true);
    return true;
  } catch (err) {
    record("prisma.client", false, `加载失败：${err.message}`);
    return false;
  }
}

async function checkDatabase() {
  let client;
  try {
    const { PrismaClient } = require("@prisma/client");
    client = new PrismaClient();
    await client.$queryRawUnsafe("SELECT 1");
    record("db.connect", true);
  } catch (err) {
    record("db.connect", false, err.message.split("\n")[0]);
    if (client) await client.$disconnect().catch(() => {});
    return false;
  }

  let allOk = true;
  const tablesToProbe = [
    ["users", "应已存在"],
    ["customers", "应已存在"],
    ["disbursements", "应已存在"],
    ["rate_limit_buckets", "P0-9 新表，缺则需 npm run db:push"],
    ["idempotency_keys", "P0-10 新表，缺则需 npm run db:push"],
  ];
  for (const [table, hint] of tablesToProbe) {
    try {
      await client.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`);
      record(`db.table.${table}`, true);
    } catch (err) {
      const msg = /does not exist/.test(err.message)
        ? `表不存在（${hint}）`
        : err.message.split("\n")[0];
      record(`db.table.${table}`, false, msg);
      allOk = false;
    }
  }

  await client.$disconnect().catch(() => {});
  return allOk;
}

function runCmd(label, cmd) {
  return new Promise((resolve) => {
    const { spawn } = require("node:child_process");
    const child = spawn(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) {
        record(label, true);
        resolve(true);
      } else {
        const tail = stderr.trim().split("\n").slice(-3).join(" | ");
        record(label, false, `exit ${code}${tail ? " | " + tail : ""}`);
        resolve(false);
      }
    });
  });
}

(async () => {
  console.log("=== DAIKUAN 全链路健康检查 ===\n");
  const ok1 = await checkEnv();
  const ok2 = await checkPrismaClient();
  const ok3 = ok2 ? await checkDatabase() : (record("db.connect", false, "Prisma client 异常，跳过 DB 检查"), false);
  console.log("");

  const ok4 = await runCmd("typecheck (tsc --noEmit)", "npx tsc --noEmit");
  const ok5 = await runCmd("vitest run", "npx vitest run --reporter=dot");

  console.log("\n=== 汇总 ===");
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    console.log("全部通过 ✓ 全链路就绪");
    process.exit(0);
  }
  console.log(`失败 ${failed.length} 项：`);
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail ?? ""}`);

  console.log("\n建议：");
  if (failed.some((f) => f.name.startsWith("env."))) {
    console.log("  • 补齐缺失的 env（参见 .env.example）");
  }
  if (failed.some((f) => f.name === "db.connect")) {
    console.log("  • 数据库不可达：检查 Supabase 项目状态，或 docker compose up -d 用本地 Postgres");
  }
  if (failed.some((f) => /db\.table\.(rate_limit_buckets|idempotency_keys)/.test(f.name))) {
    console.log("  • 缺基础设施表：npm run db:push");
  }
  if (failed.some((f) => f.name === "prisma.client")) {
    console.log("  • Prisma client 失效：npx prisma generate");
  }
  process.exit(1);
})();
