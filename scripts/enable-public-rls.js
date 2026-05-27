const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function listPublicTables() {
  return prisma.$queryRawUnsafe(`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> '_prisma_migrations'
    ORDER BY c.relname
  `);
}

async function main() {
  const before = await listPublicTables();
  const disabledBefore = before.filter((table) => !table.rls_enabled);

  for (const table of disabledBefore) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE public.${quoteIdentifier(table.table_name)} ENABLE ROW LEVEL SECURITY`,
    );
  }

  const after = await listPublicTables();
  const disabledAfter = after.filter((table) => !table.rls_enabled);

  const result = {
    ok: disabledAfter.length === 0,
    totalTables: after.length,
    enabledNow: disabledBefore.map((table) => table.table_name),
    disabledAfter: disabledAfter.map((table) => table.table_name),
    note:
      "RLS is enabled without public policies. PostgREST anon/auth roles are denied by default; the server-side Prisma owner connection continues to use the application API.",
  };

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[enable-public-rls] FAILED");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
