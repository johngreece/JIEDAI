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

  const duplicateActivePlans = await prisma.$queryRaw<
    Array<{ applicationId: string; activeCount: bigint }>
  >`
    SELECT
      "application_id" AS "applicationId",
      COUNT(*)::bigint AS "activeCount"
    FROM "repayment_plans"
    WHERE "status" = 'ACTIVE'
    GROUP BY "application_id"
    HAVING COUNT(*) > 1
    LIMIT 10
  `;

  if (duplicateActivePlans.length > 0) {
    const conflicts = duplicateActivePlans.map(({ applicationId, activeCount }) => ({
      applicationId,
      activeCount: Number(activeCount),
    }));

    throw new Error(`Cannot enforce one active repayment plan per application: ${JSON.stringify(conflicts)}`);
  }

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "repayment_plans_one_active_per_application"
    ON "repayment_plans"("application_id")
    WHERE "status" = 'ACTIVE'
  `);

  console.log(JSON.stringify({
    ok: true,
    tables: ["rate_limit_buckets", "idempotency_keys"],
    indexes: ["repayment_plans_one_active_per_application"],
  }, null, 2));
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
