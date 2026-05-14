/**
 * 演示数据 / Demo data seed
 *
 * 目的：让管理端首页"今日借款 / 今日应还 / 今日逾期"三条工作流以及资金方相关卡片立刻有数据可看。
 *
 * 产出：
 *  - 1 个资金方（含登录手机号+密码、1 个银行账户、€100,000 已确认入金）
 *  - 3 个客户（含登录密码、不同信用额度）
 *  - 3 笔借款：
 *      1. 客户 A：DRAFT 状态，今天创建（出现在"今日借款申请"）
 *      2. 客户 B：DISBURSED，还款计划今天到期（出现在"今日应还名单"）
 *      3. 客户 C：DISBURSED，还款计划过期 5 天 + OverdueRecord（出现在"今日逾期名单"）
 *
 * 幂等性：所有 upsert / find-or-create 都按业务唯一键，重复执行不会重复造数。
 *
 * 运行：npm run db:seed-demo
 */

const { PrismaClient, Prisma } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

function dayStart(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function dayEnd(offset = 0) {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

async function findAdminUser() {
  const admin = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!admin) {
    throw new Error("找不到 admin 用户，请先运行 `npm run db:seed`");
  }
  return admin;
}

async function findProduct() {
  const product = await prisma.loanProduct.findUnique({ where: { code: "UPFRONT_7D" } });
  if (!product) {
    throw new Error("找不到 UPFRONT_7D 产品，请先运行 `npm run db:seed`");
  }
  return product;
}

async function seedFunder() {
  const passwordHash = await bcrypt.hash("funder123", 12);
  const funder = await prisma.funder.upsert({
    where: { name: "演示资金方 A" },
    create: {
      name: "演示资金方 A",
      type: "INDIVIDUAL",
      loginPhone: "13900139001",
      passwordHash,
      cooperationMode: "FIXED_MONTHLY",
      monthlyRate: new Prisma.Decimal("2"),
      withdrawalCooldownDays: 1,
      contactPerson: "李资方",
      contactPhone: "13900139001",
      isActive: true,
    },
    update: {
      passwordHash,
      isActive: true,
      deletedAt: null,
    },
  });

  let account = await prisma.fundAccount.findFirst({
    where: { funderId: funder.id, accountName: "演示账户-招商" },
  });
  if (!account) {
    account = await prisma.fundAccount.create({
      data: {
        funderId: funder.id,
        accountName: "演示账户-招商",
        bankName: "招商银行",
        accountNo: `DEMO-${funder.id.slice(0, 8)}`,
        balance: new Prisma.Decimal(0),
        totalInflow: new Prisma.Decimal(0),
        totalOutflow: new Prisma.Decimal(0),
        totalProfit: new Prisma.Decimal(0),
        isActive: true,
      },
    });
  }

  // 入金 €100,000，使用 upsert by referenceId 避免重复
  const existingInflow = await prisma.capitalInflow.findFirst({
    where: { fundAccountId: account.id, remark: "demo-seed-100k" },
  });
  if (!existingInflow) {
    await prisma.$transaction(async (tx) => {
      const inflow = await tx.capitalInflow.create({
        data: {
          fundAccountId: account.id,
          amount: new Prisma.Decimal(100000),
          channel: "BANK_TRANSFER",
          inflowDate: new Date(),
          status: "CONFIRMED",
          remark: "demo-seed-100k",
        },
      });

      const balanceBefore = new Prisma.Decimal(account.balance);
      const balanceAfter = balanceBefore.add(100000);

      await tx.fundAccountJournal.create({
        data: {
          entryNo: `DEMO-JNL-${Date.now()}`,
          fundAccountId: account.id,
          type: "CAPITAL_INFLOW",
          direction: "CREDIT",
          amount: new Prisma.Decimal(100000),
          balanceBefore,
          balanceAfter,
          referenceType: "capital_inflow",
          referenceId: inflow.id,
          description: "Demo seed capital injection",
        },
      });

      await tx.fundAccount.update({
        where: { id: account.id },
        data: {
          balance: balanceAfter,
          totalInflow: { increment: 100000 },
        },
      });
    });
  }

  return { funder, account };
}

async function seedCustomer({ name, phone, idNumber, creditLimit }) {
  const passwordHash = await bcrypt.hash("client123", 12);
  return prisma.customer.upsert({
    where: { phone },
    create: {
      name,
      phone,
      idNumber,
      passwordHash,
      creditLimit: new Prisma.Decimal(creditLimit),
      riskLevel: "NORMAL",
      source: "demo-seed",
    },
    update: {
      passwordHash,
      deletedAt: null,
    },
  });
}

async function ensureApplication({ applicationNo, customerId, productId, amount, status, createdAt, adminId }) {
  let app = await prisma.loanApplication.findUnique({ where: { applicationNo } });
  if (app) return app;

  app = await prisma.loanApplication.create({
    data: {
      applicationNo,
      customerId,
      productId,
      amount: new Prisma.Decimal(amount),
      termValue: 7,
      termUnit: "DAY",
      purpose: "演示数据",
      status,
      createdById: adminId,
      createdAt,
      updatedAt: createdAt,
      approvedAt: status === "DRAFT" ? null : createdAt,
    },
  });
  return app;
}

async function ensureDisbursement({ application, account, adminId, disbursedAt, feeRate = 0.05 }) {
  const existing = await prisma.disbursement.findUnique({
    where: { applicationId: application.id },
  });
  if (existing) return existing;

  const amount = new Prisma.Decimal(application.amount);
  const feeAmount = amount.mul(feeRate);
  const netAmount = amount.sub(feeAmount);

  return prisma.disbursement.create({
    data: {
      disbursementNo: `DEMO-DISB-${application.applicationNo}`,
      applicationId: application.id,
      fundAccountId: account.id,
      amount,
      feeAmount,
      netAmount,
      status: "PAID",
      disbursedAt,
      operatorId: adminId,
      remark: "demo-seed disbursement",
    },
  });
}

async function ensureRepaymentPlan({ application, dueDate, principal }) {
  const totalPrincipal = new Prisma.Decimal(principal);
  const totalInterest = totalPrincipal.mul(0.05);
  const totalDue = totalPrincipal.add(totalInterest);
  const desiredStatus = dueDate < new Date() ? "OVERDUE" : "PENDING";

  const existing = await prisma.repaymentPlan.findFirst({
    where: { applicationId: application.id, status: "ACTIVE" },
    include: { scheduleItems: true },
  });

  if (existing) {
    const firstItem = existing.scheduleItems[0];
    if (firstItem) {
      await prisma.repaymentScheduleItem.update({
        where: { id: firstItem.id },
        data: {
          dueDate,
          status: desiredStatus,
          remaining: totalDue,
        },
      });
    }
    return prisma.repaymentPlan.findUnique({
      where: { id: existing.id },
      include: { scheduleItems: true },
    });
  }

  return prisma.repaymentPlan.create({
    data: {
      planNo: `DEMO-PLAN-${application.applicationNo}`,
      applicationId: application.id,
      totalPrincipal,
      totalInterest,
      totalFee: new Prisma.Decimal(0),
      totalPeriods: 1,
      status: "ACTIVE",
      scheduleItems: {
        create: [
          {
            periodNumber: 1,
            dueDate,
            principal: totalPrincipal,
            interest: totalInterest,
            fee: new Prisma.Decimal(0),
            totalDue,
            remaining: totalDue,
            status: desiredStatus,
          },
        ],
      },
    },
    include: { scheduleItems: true },
  });
}

async function ensureOverdueRecord({ customerId, applicationId, scheduleItemId, overdueDays, overdueAmount, penaltyAmount }) {
  const existing = await prisma.overdueRecord.findFirst({
    where: { scheduleItemId, status: "OVERDUE" },
  });
  if (existing) return existing;

  return prisma.overdueRecord.create({
    data: {
      customerId,
      applicationId,
      scheduleItemId,
      overdueDays,
      overdueAmount: new Prisma.Decimal(overdueAmount),
      penaltyAmount: new Prisma.Decimal(penaltyAmount),
      gracePeriodDays: 0,
      status: "OVERDUE",
    },
  });
}

async function main() {
  console.log("[demo-seed] 开始");

  const admin = await findAdminUser();
  const product = await findProduct();
  const { account } = await seedFunder();
  console.log("[demo-seed] 资金方 + 账户 + €100,000 入金 OK");

  const customerA = await seedCustomer({
    name: "演示客户 A（今天申请）",
    phone: "13800138001",
    idNumber: "110101199001010001",
    creditLimit: 20000,
  });
  const customerB = await seedCustomer({
    name: "演示客户 B（今天到期）",
    phone: "13800138002",
    idNumber: "110101199001010002",
    creditLimit: 20000,
  });
  const customerC = await seedCustomer({
    name: "演示客户 C（已逾期）",
    phone: "13800138003",
    idNumber: "110101199001010003",
    creditLimit: 20000,
  });
  console.log("[demo-seed] 3 个客户 OK (密码统一为 client123)");

  // 场景 1: 今天创建的 DRAFT 申请
  await ensureApplication({
    applicationNo: "DEMO-APP-TODAY-001",
    customerId: customerA.id,
    productId: product.id,
    amount: 10000,
    status: "DRAFT",
    createdAt: new Date(),
    adminId: admin.id,
  });
  console.log("[demo-seed] 场景1：今日新申请 OK");

  // 场景 2: 已放款，今天到期
  const appB = await ensureApplication({
    applicationNo: "DEMO-APP-DUE-TODAY-001",
    customerId: customerB.id,
    productId: product.id,
    amount: 8000,
    status: "DISBURSED",
    createdAt: dayStart(-7),
    adminId: admin.id,
  });
  await ensureDisbursement({
    application: appB,
    account,
    adminId: admin.id,
    disbursedAt: dayStart(-7),
  });
  await ensureRepaymentPlan({
    application: appB,
    dueDate: dayEnd(0),
    principal: 8000,
  });
  console.log("[demo-seed] 场景2：今日到期还款 OK");

  // 场景 3: 已放款，逾期 5 天
  const appC = await ensureApplication({
    applicationNo: "DEMO-APP-OVERDUE-001",
    customerId: customerC.id,
    productId: product.id,
    amount: 12000,
    status: "DISBURSED",
    createdAt: dayStart(-12),
    adminId: admin.id,
  });
  await ensureDisbursement({
    application: appC,
    account,
    adminId: admin.id,
    disbursedAt: dayStart(-12),
  });
  const planC = await ensureRepaymentPlan({
    application: appC,
    dueDate: dayStart(-5),
    principal: 12000,
  });
  const scheduleItemC = (planC.scheduleItems ?? (await prisma.repaymentScheduleItem.findMany({
    where: { planId: planC.id },
  })))[0];
  await ensureOverdueRecord({
    customerId: customerC.id,
    applicationId: appC.id,
    scheduleItemId: scheduleItemC.id,
    overdueDays: 5,
    overdueAmount: 12600,
    penaltyAmount: 600,
  });
  console.log("[demo-seed] 场景3：逾期 5 天 OK");

  console.log("\n[demo-seed] 完成 — 现在去 http://localhost:3001/admin/dashboard 看");
  console.log("登录入口：");
  console.log("  管理端：admin / Wanjin888@");
  console.log("  客户端：13800138001 / client123  (演示客户 A)");
  console.log("  客户端：13800138002 / client123  (演示客户 B - 今天到期)");
  console.log("  客户端：13800138003 / client123  (演示客户 C - 已逾期)");
  console.log("  资金方：13900139001 / funder123  (演示资金方 A)");
}

main()
  .catch((error) => {
    console.error("[demo-seed] 失败");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
