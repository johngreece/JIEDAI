const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

async function main() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "message_delivery_attempts",
      "message_deliveries",
      "notifications",
      "attachments",
      "audit_logs",
      "overdue_records",
      "repayment_confirmations",
      "repayment_allocations",
      "repayments",
      "repayment_schedule_items",
      "repayment_plans",
      "disbursements",
      "contracts",
      "loan_approvals",
      "loan_applications",
      "restructures",
      "extensions",
      "customer_kyc",
      "funder_notifications",
      "funder_contracts",
      "funder_withdrawals",
      "fund_profit_shares",
      "capital_inflows",
      "fund_accounts",
      "customers",
      "funders"
    RESTART IDENTITY CASCADE
  `);

  const summary = await Promise.all([
    prisma.customer.count(),
    prisma.funder.count(),
    prisma.loanApplication.count(),
    prisma.disbursement.count(),
    prisma.repayment.count(),
    prisma.fundAccount.count(),
    prisma.capitalInflow.count(),
    prisma.notification.count(),
    prisma.messageDelivery.count(),
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        customers: summary[0],
        funders: summary[1],
        loanApplications: summary[2],
        disbursements: summary[3],
        repayments: summary[4],
        fundAccounts: summary[5],
        capitalInflows: summary[6],
        notifications: summary[7],
        messageDeliveries: summary[8],
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("[clear-business-mock-data] FAILED");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
