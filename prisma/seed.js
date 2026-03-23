const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const defaultRates = {
  upfrontFlatRate: 5,
  fee5hRate: 2,
  fee24hRate: 3,
  fee48hRate: 4,
  fee7dRate: 6,
  overdueGraceHours: 0,
  overdueRatePerDayBefore7: 1,
  overdueRatePerDayBefore30: 2,
  overdueRatePerDayAfter30: 3,
};

const feeKeys = {
  upfrontFlatRate: "loan_upfront_flat_rate",
  fee5hRate: "loan_fee_5h_rate",
  fee24hRate: "loan_fee_24h_rate",
  fee48hRate: "loan_fee_48h_rate",
  fee7dRate: "loan_fee_7d_rate",
  overdueGraceHours: "loan_overdue_grace_hours",
  overdueRatePerDayBefore7: "loan_overdue_rate_per_day_before_7",
  overdueRatePerDayBefore30: "loan_overdue_rate_per_day_before_30",
  overdueRatePerDayAfter30: "loan_overdue_rate_per_day_after_30",
};

const defaultContractHtml = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>借款合同</title>
  </head>
  <body style="font-family: sans-serif; padding: 20px;">
    <h2>借款合同</h2>
    <p>合同编号：{{ contract_no }}</p>
    <p>甲方（出借方）：【系统配置】</p>
    <p>乙方（借款人）：{{ customer_name }}</p>
    <p>证件号：{{ customer_id_number }}</p>
    <p>联系电话：{{ customer_phone }}</p>
    <p>借款金额：{{ loan_amount }} 欧元（大写：{{ loan_amount_cn }}）</p>
    <p>借款期限：{{ term_value }}{{ term_unit }}</p>
    <p>利率/费用：{{ interest_rate }}；服务费：{{ service_fee }}</p>
    <p>应还总额：{{ total_repay }}</p>
    <p>还款摘要：{{ repay_schedule_summary }}</p>
    <p>签署日期：{{ sign_date }} {{ sign_time }} {{ sign_location }}</p>
    <p>乙方确认已阅读并同意上述条款，自愿签署本合同。</p>
  </body>
</html>
`;

const permissionDefinitions = [
  { code: "customer:view", module: "customer", name: "查看客户" },
  { code: "customer:create", module: "customer", name: "创建客户" },
  { code: "customer:edit", module: "customer", name: "编辑客户" },
  { code: "loan:view", module: "loan", name: "查看借款申请" },
  { code: "loan:create", module: "loan", name: "创建借款申请" },
  { code: "loan:risk", module: "loan", name: "风控审核" },
  { code: "loan:approve", module: "loan", name: "审批借款" },
  { code: "contract:view", module: "contract", name: "查看合同" },
  { code: "contract:generate", module: "contract", name: "生成合同" },
  { code: "disbursement:view", module: "disbursement", name: "查看放款" },
  { code: "disbursement:create", module: "disbursement", name: "创建放款" },
  { code: "disbursement:confirm", module: "disbursement", name: "确认打款" },
  { code: "repayment:view", module: "repayment", name: "查看还款" },
  { code: "repayment:create", module: "repayment", name: "登记还款" },
  { code: "repayment:allocate", module: "repayment", name: "分配还款" },
  { code: "overdue:view", module: "overdue", name: "查看逾期" },
  { code: "overdue:scan", module: "overdue", name: "执行逾期扫描" },
  { code: "extension:view", module: "extension", name: "查看展期" },
  { code: "extension:create", module: "extension", name: "申请展期" },
  { code: "extension:approve", module: "extension", name: "审批展期" },
  { code: "ledger:view", module: "ledger", name: "查看台账" },
  { code: "settings:view", module: "settings", name: "查看设置" },
  { code: "settings:edit", module: "settings", name: "修改设置" },
  { code: "user:view", module: "user", name: "查看用户" },
  { code: "user:create", module: "user", name: "创建用户" },
  { code: "user:edit", module: "user", name: "编辑用户" },
  { code: "role:manage", module: "user", name: "管理角色权限" },
  { code: "audit:view", module: "audit", name: "查看审计日志" },
  { code: "dashboard:view", module: "dashboard", name: "查看仪表板" },
];

async function seedSettings() {
  await prisma.contractTemplate.upsert({
    where: { code: "default_loan" },
    create: {
      code: "default_loan",
      name: "默认借款合同模板",
      content: defaultContractHtml.trim(),
      variables: [
        "contract_no",
        "customer_name",
        "customer_id_number",
        "customer_phone",
        "loan_amount",
        "loan_amount_cn",
        "term_value",
        "term_unit",
        "interest_rate",
        "service_fee",
        "total_repay",
        "repay_schedule_summary",
        "sign_date",
        "sign_time",
        "sign_location",
      ],
      version: 1,
      isActive: true,
    },
    update: {},
  });

  for (const [rateKey, settingKey] of Object.entries(feeKeys)) {
    await prisma.systemSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: JSON.stringify({ value: defaultRates[rateKey] }),
        group: "LOAN_FEE",
        remark: rateKey,
      },
      update: {},
    });
  }
}

async function seedRolesAndPermissions() {
  const superAdminRole = await prisma.role.upsert({
    where: { code: "super_admin" },
    create: { name: "超级管理员", code: "super_admin", isSystem: true, description: "最高权限" },
    update: { name: "超级管理员", description: "最高权限" },
  });
  const managerRole = await prisma.role.upsert({
    where: { code: "manager" },
    create: { name: "经理", code: "manager", description: "业务管理" },
    update: { name: "经理", description: "业务管理" },
  });
  const financeRole = await prisma.role.upsert({
    where: { code: "finance" },
    create: { name: "财务", code: "finance", description: "放款、还款、台账与对账" },
    update: { name: "财务", description: "放款、还款、台账与对账" },
  });
  const operatorRole = await prisma.role.upsert({
    where: { code: "operator" },
    create: { name: "操作员", code: "operator", description: "日常操作" },
    update: { name: "操作员", description: "日常操作" },
  });

  for (const permission of permissionDefinitions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: { name: permission.name, module: permission.module },
    });
  }

  const rolePermissions = {
    super_admin: permissionDefinitions.map((item) => item.code),
    manager: [
      "customer:view",
      "loan:view",
      "loan:risk",
      "loan:approve",
      "contract:view",
      "contract:generate",
      "repayment:view",
      "overdue:view",
      "extension:view",
      "extension:approve",
      "audit:view",
      "dashboard:view",
    ],
    finance: [
      "customer:view",
      "contract:view",
      "disbursement:view",
      "disbursement:create",
      "disbursement:confirm",
      "repayment:view",
      "repayment:create",
      "repayment:allocate",
      "ledger:view",
      "audit:view",
      "dashboard:view",
    ],
    operator: [
      "customer:view",
      "loan:view",
      "contract:view",
      "contract:generate",
      "disbursement:view",
      "disbursement:create",
      "disbursement:confirm",
      "repayment:view",
      "repayment:create",
      "repayment:allocate",
      "dashboard:view",
    ],
  };

  const roles = {
    super_admin: superAdminRole.id,
    manager: managerRole.id,
    finance: financeRole.id,
    operator: operatorRole.id,
  };

  for (const [roleCode, permissionCodes] of Object.entries(rolePermissions)) {
    const permissions = await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
      select: { id: true },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: roles[roleCode],
            permissionId: permission.id,
          },
        },
        create: {
          roleId: roles[roleCode],
          permissionId: permission.id,
        },
        update: {},
      });
    }
  }
}

async function seedAdminUsers() {
  const [superAdminRole, managerRole, financeRole, operatorRole] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { code: "super_admin" } }),
    prisma.role.findUniqueOrThrow({ where: { code: "manager" } }),
    prisma.role.findUniqueOrThrow({ where: { code: "finance" } }),
    prisma.role.findUniqueOrThrow({ where: { code: "operator" } }),
  ]);

  const adminPwd = await bcrypt.hash("Wanjin888@", 12);
  const managerPwd = await bcrypt.hash("manager123", 12);
  const financePwd = await bcrypt.hash("finance123", 12);
  const operatorPwd = await bcrypt.hash("operator123", 12);

  await prisma.user.upsert({
    where: { username: "admin" },
    create: {
      username: "admin",
      passwordHash: adminPwd,
      realName: "系统管理员",
      roleId: superAdminRole.id,
    },
    update: {
      passwordHash: adminPwd,
      roleId: superAdminRole.id,
      isActive: true,
      deletedAt: null,
    },
  });

  await prisma.user.upsert({
    where: { username: "manager" },
    create: {
      username: "manager",
      passwordHash: managerPwd,
      realName: "审批经理",
      phone: "13900000003",
      roleId: managerRole.id,
    },
    update: {
      passwordHash: managerPwd,
      phone: "13900000003",
      roleId: managerRole.id,
      isActive: true,
      deletedAt: null,
    },
  });

  await prisma.user.upsert({
    where: { username: "finance" },
    create: {
      username: "finance",
      passwordHash: financePwd,
      realName: "财务",
      phone: "13900000004",
      roleId: financeRole.id,
    },
    update: {
      passwordHash: financePwd,
      phone: "13900000004",
      roleId: financeRole.id,
      isActive: true,
      deletedAt: null,
    },
  });

  await prisma.user.upsert({
    where: { username: "operator" },
    create: {
      username: "operator",
      passwordHash: operatorPwd,
      realName: "操作员",
      phone: "13900000002",
      roleId: operatorRole.id,
    },
    update: {
      passwordHash: operatorPwd,
      phone: "13900000002",
      roleId: operatorRole.id,
      isActive: true,
      deletedAt: null,
    },
  });
}

async function seedLoanProducts() {
  const product1 = await prisma.loanProduct.upsert({
    where: { code: "UPFRONT_7D" },
    create: {
      name: "砍头息短期贷（7天）",
      code: "UPFRONT_7D",
      description: "砍头息模式：借 10000 到手 9500，7 天内任何时间还款均按固定 5% 执行",
      minAmount: 1000,
      maxAmount: 100000,
      minTermValue: 7,
      maxTermValue: 7,
      termUnit: "DAY",
      repaymentMethod: "ONE_TIME",
      allowEarlyRepay: true,
      allowExtension: true,
      maxExtensionTimes: 2,
    },
    update: {
      description: "砍头息模式：借 10000 到手 9500，7 天内任何时间还款均按固定 5% 执行",
      minTermValue: 7,
      maxTermValue: 7,
      isActive: true,
      deletedAt: null,
    },
  });

  const product2 = await prisma.loanProduct.upsert({
    where: { code: "FULL_AMOUNT_7D" },
    create: {
      name: "全额短期贷（7天）",
      code: "FULL_AMOUNT_7D",
      description: "全额到账模式：5小时 2%，24小时 3%，48小时 4%，7天内 6%",
      minAmount: 1000,
      maxAmount: 100000,
      minTermValue: 7,
      maxTermValue: 7,
      termUnit: "DAY",
      repaymentMethod: "ONE_TIME",
      allowEarlyRepay: true,
      allowExtension: true,
      maxExtensionTimes: 2,
    },
    update: {
      description: "全额到账模式：5小时 2%，24小时 3%，48小时 4%，7天内 6%",
      minTermValue: 7,
      maxTermValue: 7,
      isActive: true,
      deletedAt: null,
    },
  });

  const upfrontRules = [
    { name: "砍头息手续费", ruleType: "UPFRONT_FEE", rateValue: 5, conditionJson: null, priority: 100 },
    { name: "通道类型", ruleType: "CHANNEL", rateValue: 0, conditionJson: JSON.stringify({ type: "UPFRONT_DEDUCTION" }), priority: 99 },
    { name: "7天内固定费率", ruleType: "TIER_RATE", rateValue: 5, conditionJson: JSON.stringify({ maxHours: 168, maxDays: 7, label: "7天内固定5%" }), priority: 10 },
    { name: "逾期阶段1", ruleType: "OVERDUE_PHASE1", rateValue: 1, conditionJson: JSON.stringify({ startDay: 1, maxOverdueDay: 7, compound: true, label: "逾期第1-7天" }), priority: 5 },
    { name: "逾期阶段2", ruleType: "OVERDUE_PHASE2", rateValue: 2, conditionJson: JSON.stringify({ startDay: 8, maxOverdueDay: 30, compound: true, label: "逾期第8-30天" }), priority: 4 },
    { name: "逾期阶段3", ruleType: "OVERDUE_PHASE3", rateValue: 3, conditionJson: JSON.stringify({ startDay: 31, compound: true, label: "逾期第31天起" }), priority: 3 },
  ];

  const fullRules = [
    { name: "通道类型", ruleType: "CHANNEL", rateValue: 0, conditionJson: JSON.stringify({ type: "FULL_AMOUNT" }), priority: 99 },
    { name: "5小时内还款", ruleType: "TIER_RATE", rateValue: 2, conditionJson: JSON.stringify({ maxHours: 5, maxDays: 0, label: "5小时内还款" }), priority: 10 },
    { name: "24小时内还款", ruleType: "TIER_RATE", rateValue: 3, conditionJson: JSON.stringify({ maxHours: 24, maxDays: 1, label: "24小时内还款" }), priority: 9 },
    { name: "48小时内还款", ruleType: "TIER_RATE", rateValue: 4, conditionJson: JSON.stringify({ maxHours: 48, maxDays: 2, label: "48小时内还款" }), priority: 8 },
    { name: "7天内还款", ruleType: "TIER_RATE", rateValue: 6, conditionJson: JSON.stringify({ maxHours: 168, maxDays: 7, label: "48小时后至7天内还款" }), priority: 7 },
    { name: "逾期阶段1", ruleType: "OVERDUE_PHASE1", rateValue: 1, conditionJson: JSON.stringify({ startDay: 1, maxOverdueDay: 7, compound: true, label: "逾期第1-7天" }), priority: 5 },
    { name: "逾期阶段2", ruleType: "OVERDUE_PHASE2", rateValue: 2, conditionJson: JSON.stringify({ startDay: 8, maxOverdueDay: 30, compound: true, label: "逾期第8-30天" }), priority: 4 },
    { name: "逾期阶段3", ruleType: "OVERDUE_PHASE3", rateValue: 3, conditionJson: JSON.stringify({ startDay: 31, compound: true, label: "逾期第31天起" }), priority: 3 },
  ];

  for (const rule of upfrontRules) {
    await prisma.pricingRule.upsert({
      where: { id: `seed_upfront_${rule.ruleType}_${rule.priority}` },
      create: {
        id: `seed_upfront_${rule.ruleType}_${rule.priority}`,
        productId: product1.id,
        name: rule.name,
        ruleType: rule.ruleType,
        rateType: "PERCENTAGE",
        rateValue: rule.rateValue,
        conditionJson: rule.conditionJson,
        priority: rule.priority,
        isActive: true,
        effectiveFrom: new Date("2024-01-01"),
      },
      update: {
        name: rule.name,
        rateValue: rule.rateValue,
        conditionJson: rule.conditionJson,
        isActive: true,
      },
    });
  }

  for (const rule of fullRules) {
    await prisma.pricingRule.upsert({
      where: { id: `seed_full_${rule.ruleType}_${rule.priority}` },
      create: {
        id: `seed_full_${rule.ruleType}_${rule.priority}`,
        productId: product2.id,
        name: rule.name,
        ruleType: rule.ruleType,
        rateType: "PERCENTAGE",
        rateValue: rule.rateValue,
        conditionJson: rule.conditionJson,
        priority: rule.priority,
        isActive: true,
        effectiveFrom: new Date("2024-01-01"),
      },
      update: {
        name: rule.name,
        rateValue: rule.rateValue,
        conditionJson: rule.conditionJson,
        isActive: true,
      },
    });
  }
}

async function main() {
  await seedSettings();
  await seedRolesAndPermissions();
  await seedAdminUsers();
  await seedLoanProducts();

  console.log("Base system seed completed.");
  console.log("Admin account ready: admin / Wanjin888@");
  console.log("Seed now only writes system config, roles, admin users, products, and pricing rules.");
  console.log("No client, funder, loan application, or business mock data was created.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
