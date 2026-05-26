import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "count" INTEGER NOT NULL DEFAULT 0,
      "reset_at" TIMESTAMP(3) NOT NULL,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "rate_limit_buckets_reset_at_idx"
    ON "rate_limit_buckets"("reset_at")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "idempotency_keys" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "result_json" TEXT NOT NULL,
      "expires_at" TIMESTAMP(3) NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "idempotency_keys_expires_at_idx"
    ON "idempotency_keys"("expires_at")
  `);

  console.log(JSON.stringify({ ok: true, tables: ["rate_limit_buckets", "idempotency_keys"] }, null, 2));
}

main()
  .catch((error) => {
    console.error("[ensure-infra-tables] FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
