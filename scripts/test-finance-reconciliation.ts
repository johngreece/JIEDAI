import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [{ FinanceReconciliationService }, { prisma }] = await Promise.all([
    import("../src/services/finance-reconciliation.service"),
    import("../src/lib/prisma"),
  ]);

  try {
    if (process.argv.includes("--persist-daily")) {
      const run = await FinanceReconciliationService.runDaily();
      console.log(
        JSON.stringify(
          {
            ok: run.status === "CLEAN" || run.openFindingCount === 0,
            runKey: run.runKey,
            status: run.status,
            findingCount: run.findingCount,
            openFindingCount: run.openFindingCount,
          },
          null,
          2,
        ),
      );
      if (run.status === "FAILED" || run.openFindingCount > 0) process.exitCode = 1;
      return;
    }

    const result = await FinanceReconciliationService.inspectCurrent();
    const payload = {
      ok: result.findings.length === 0,
      findingCount: result.findings.length,
      summary: result.summary,
      findings: result.findings,
    };

    console.log(JSON.stringify(payload, null, 2));
    if (!payload.ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[finance-reconciliation] FAILED");
  console.error(error);
  process.exitCode = 1;
});
