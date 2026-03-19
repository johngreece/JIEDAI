const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const defaultRates = {
  sameDayRate: 2,
  nextDayRate: 3,
  day3Day7Rate: 5,
  otherDayRate: 5,
  overdueGraceHours: 24,
  overdueRatePerDayBefore14: 1,
  overdueRatePerDayAfter14: 2,
};

const feeKeys = {
  sameDayRate: "loan_fee_same_day_rate",
  nextDayRate: "loan_fee_next_day_rate",
  day3Day7Rate: "loan_fee_day3_day7_rate",
  otherDayRate: "loan_fee_other_day_rate",
  overdueGraceHours: "loan_overdue_grace_hours",
  overdueRateBefore14: "loan_overdue_rate_per_day_before_14",
  overdueRateAfter14: "loan_overdue_rate_per_day_after_14",
};

const defaultContractHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>借款合同</title></head>
<body style="font-family: sans-serif; padding: 20px;">
  <h2>借款合同</h2>
  <p>合同编号：{{ contract_no }}</p>
  <p>甲方（出借人）：【系统配置】</p>
  <p>乙方（借款人）：{{ customer_name }}</p>
  <p>证件号：{{ customer_id_number }}</p>
  <p>联系电话：{{ customer_phone }}</p>
  <p>借款金额：{{ loan_amount }} 欧元（大写：{{ loan_amount_cn }}）</p>
  <p>借款期限：{{ term_value }}{{ term_unit }}</p>
  <p>利率/费用：{{ interest_rate }}；服务费：{{ service_fee }}</p>
  <p>应还总额：{{ total_repay }}</p>
  <p>还款概要：{{ repay_schedule_summary }}</p>
  <p>签署日期：{{ sign_date }} {{ sign_time }} {{ sign_location }}</p>
  <p>乙方确认已阅读并同意上述条款，自愿签署本合同。</p>
</body></html>
`;

async function main() {
  // ── 合同模板 ──
  const template = await prisma.contractTemplate.upsert({
    where: { code: "default_loan" },
    create: {
      code: "default_loan",
      name: "默认借款合同模板",
      content: defaultContractHtml.trim(),
      variables: [
        "contract_no", "customer_name", "customer_id_number", "customer_phone",
        "loan_amount", "loan_amount_cn", "term_value", "term_unit",
        "interest_rate", "service_fee", "total_repay", "repay_schedule_summary",
        "sign_date", "sign_time", "sign_location",
      ],
      version: 1,
      isActive: true,
    },
    update: {},
  });
  console.log("ContractTemplate:", template.id);

  // ── 费率配置 ──
  for (const [key, settingKey] of Object.entries(feeKeys)) {
    const value = defaultRates[key];
    await prisma.systemSetting.upsert({
      where: { key: settingKey },
      create: { key: settingKey, value: JSON.stringify({ value }), group: "LOAN_FEE", remark: key },
      update: {},
    });
  }
  console.log("Loan fee system_settings seeded.");

  // ── 角色 ──
  const superAdminRole = await prisma.role.upsert({
    where: { code: "super_admin" },
    create: { name: "超级管理员", code: "super_admin", isSystem: true, description: "最高权限" },
    update: {},
  });
  const managerRole = await prisma.role.upsert({
    where: { code: "manager" },
    create: { name: "经理", code: "manager", description: "业务管理" },
    update: {},
  });
  const operatorRole = await prisma.role.upsert({
    where: { code: "operator" },
    create: { name: "操作员", code: "operator", description: "日常操作" },
    update: {},
  });
  console.log("Roles seeded:", superAdminRole.id, managerRole.id, operatorRole.id);

  // ── 权限 ──
  const permDefs = [
    { code: "customer:view", module: "customer", name: "查看客户" },
    { code: "customer:create", module: "customer", name: "创建客户" },
    { code: "customer:edit", module: "customer", name: "编辑客户" },
    { code: "loan:view", module: "loan", name: "查看贷款申请" },
    { code: "loan:create", module: "loan", name: "创建贷款申请" },
    { code: "loan:risk", module: "loan", name: "风控审核" },
    { code: "loan:approve", module: "loan", name: "审批贷款" },
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

  for (const p of permDefs) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: p,
      update: { name: p.name, module: p.module },
    });
  }
  console.log("Permissions seeded:", permDefs.length);

  // ── 默认管理员用户 ──
  const hashedPwd = await bcrypt.hash("admin123", 12);
  await prisma.user.upsert({
    where: { username: "admin" },
    create: {
      username: "admin",
      passwordHash: hashedPwd,
      realName: "系统管理员",
      roleId: superAdminRole.id,
    },
    update: {},
  });
  console.log("Default admin user seeded (admin / admin123).");

  // ── 前台操作员用户 ──
  const operatorPwd = await bcrypt.hash("operator123", 12);
  const operatorUser = await prisma.user.upsert({
    where: { username: "operator" },
    create: {
      username: "operator",
      passwordHash: operatorPwd,
      realName: "前台操作员",
      phone: "13900000002",
      roleId: operatorRole.id,
    },
    update: {},
  });
  console.log("Operator user seeded (operator / operator123).");

  // ── 为 operator 角色分配权限（放款、确认、签字、还款、客户查看、合同、仪表板） ──
  const operatorPermCodes = [
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
  ];
  const operatorPerms = await prisma.permission.findMany({
    where: { code: { in: operatorPermCodes } },
  });
  for (const perm of operatorPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: operatorRole.id, permissionId: perm.id },
      },
      create: { roleId: operatorRole.id, permissionId: perm.id },
      update: {},
    });
  }
  console.log("Operator role permissions assigned:", operatorPerms.length);

  // ── 默认客户账号 ──
  const customerPwd = await bcrypt.hash("customer123", 12);
  await prisma.customer.upsert({
    where: { phone: "13800000001" },
    create: {
      name: "张三",
      phone: "13800000001",
      passwordHash: customerPwd,
      idNumber: "110101199001011234",
      address: "北京市朝阳区",
    },
    update: {},
  });
  console.log("Default customer seeded (phone: 13800000001 / customer123).");

  // ── 更多测试客户账号 ──
  const testCustomers = [
    { name: "李四", phone: "13800000002", idNumber: "110101199203156789", address: "上海市浦东新区" },
    { name: "王五", phone: "13800000003", idNumber: "330102198805201234", address: "杭州市西湖区" },
    { name: "赵六", phone: "13800000004", idNumber: "440106199112085678", address: "广州市天河区" },
    { name: "Maria Papadopoulos", phone: "6971000001", idNumber: "GR2026001234", address: "Athens, Greece" },
    { name: "Nikos Georgiou", phone: "6972000002", idNumber: "GR2026005678", address: "Thessaloniki, Greece" },
  ];
  for (const c of testCustomers) {
    await prisma.customer.upsert({
      where: { phone: c.phone },
      create: { ...c, passwordHash: customerPwd },
      update: {},
    });
  }
  console.log("Test customers seeded:", testCustomers.length, "(password: customer123)");

  // ── 贷款产品（砍头息 + 全额） ──
  const product1 = await prisma.loanProduct.upsert({
    where: { code: "UPFRONT_7D" },
    create: {
      name: "砍头息短期贷（7天）",
      code: "UPFRONT_7D",
      description: "砍头息模式：借10000到手9500，阶梯费率还款",
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
    update: {},
  });
  const product2 = await prisma.loanProduct.upsert({
    where: { code: "FULL_AMOUNT_7D" },
    create: {
      name: "全额短期贷（7天）",
      code: "FULL_AMOUNT_7D",
      description: "全额模式：借10000到手10000，阶梯费率还款（仅专属链接）",
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
    update: {},
  });
  console.log("Loan products seeded:", product1.id, product2.id);

  // ── 定价规则 — 砍头息产品 ──
  const upfrontRules = [
    { name: "砍头息手续费", ruleType: "UPFRONT_FEE", rateValue: 5, conditionJson: null, priority: 100 },
    { name: "通道类型", ruleType: "CHANNEL", rateValue: 0, conditionJson: JSON.stringify({ type: "UPFRONT_DEDUCTION" }), priority: 99 },
    { name: "当天还", ruleType: "TIER_RATE", rateValue: 2, conditionJson: JSON.stringify({ maxDays: 0, label: "当天还" }), priority: 10 },
    { name: "隔天还", ruleType: "TIER_RATE", rateValue: 3, conditionJson: JSON.stringify({ maxDays: 1, label: "隔天还" }), priority: 9 },
    { name: "第3~7天还", ruleType: "TIER_RATE", rateValue: 5, conditionJson: JSON.stringify({ maxDays: 7, label: "第3~7天还" }), priority: 8 },
    { name: "逾期阶段1", ruleType: "OVERDUE_PHASE1", rateValue: 1, conditionJson: JSON.stringify({ maxDays: 14 }), priority: 5 },
    { name: "逾期阶段2", ruleType: "OVERDUE_PHASE2", rateValue: 2, conditionJson: null, priority: 4 },
  ];
  for (const r of upfrontRules) {
    await prisma.pricingRule.upsert({
      where: { id: `seed_upfront_${r.ruleType}_${r.priority}` },
      create: {
        id: `seed_upfront_${r.ruleType}_${r.priority}`,
        productId: product1.id,
        name: r.name,
        ruleType: r.ruleType,
        rateType: "PERCENTAGE",
        rateValue: r.rateValue,
        conditionJson: r.conditionJson,
        priority: r.priority,
        isActive: true,
        effectiveFrom: new Date("2024-01-01"),
      },
      update: { rateValue: r.rateValue, conditionJson: r.conditionJson },
    });
  }
  console.log("PricingRules seeded for UPFRONT_7D:", upfrontRules.length);

  // ── 定价规则 — 全额产品 ──
  const fullRules = [
    { name: "通道类型", ruleType: "CHANNEL", rateValue: 0, conditionJson: JSON.stringify({ type: "FULL_AMOUNT" }), priority: 99 },
    { name: "当天还", ruleType: "TIER_RATE", rateValue: 2, conditionJson: JSON.stringify({ maxDays: 0, label: "当天还" }), priority: 10 },
    { name: "隔天还", ruleType: "TIER_RATE", rateValue: 3, conditionJson: JSON.stringify({ maxDays: 1, label: "隔天还" }), priority: 9 },
    { name: "第3~7天还", ruleType: "TIER_RATE", rateValue: 5, conditionJson: JSON.stringify({ maxDays: 7, label: "第3~7天还" }), priority: 8 },
    { name: "逾期阶段1", ruleType: "OVERDUE_PHASE1", rateValue: 1, conditionJson: JSON.stringify({ maxDays: 14 }), priority: 5 },
    { name: "逾期阶段2", ruleType: "OVERDUE_PHASE2", rateValue: 2, conditionJson: null, priority: 4 },
  ];
  for (const r of fullRules) {
    await prisma.pricingRule.upsert({
      where: { id: `seed_full_${r.ruleType}_${r.priority}` },
      create: {
        id: `seed_full_${r.ruleType}_${r.priority}`,
        productId: product2.id,
        name: r.name,
        ruleType: r.ruleType,
        rateType: "PERCENTAGE",
        rateValue: r.rateValue,
        conditionJson: r.conditionJson,
        priority: r.priority,
        isActive: true,
        effectiveFrom: new Date("2024-01-01"),
      },
      update: { rateValue: r.rateValue, conditionJson: r.conditionJson },
    });
  }
  console.log("PricingRules seeded for FULL_AMOUNT_7D:", fullRules.length);

  // ── 资金方 & 资金账户 ──
  const funderPwd = await bcrypt.hash("funder123", 12);
  const funder = await prisma.funder.upsert({
    where: { name: "自有资金" },
    create: {
      name: "自有资金",
      type: "COMPANY",
      contactPerson: "管理员",
      contactPhone: "13900000001",
      loginPhone: "13900000001",
      passwordHash: funderPwd,
      cooperationMode: "FIXED_MONTHLY",
      monthlyRate: 2,
      priority: 10,
      profitShareRatio: 0,
      remark: "公司自有资金池",
    },
    update: {
      loginPhone: "13900000001",
      passwordHash: funderPwd,
    },
  });
  const fundAccount = await prisma.fundAccount.upsert({
    where: { accountNo: "6228000000000001" },
    update: {},
    create: {
      funderId: funder.id,
      accountName: "主资金账户",
      bankName: "工商银行",
      accountNo: "6228000000000001",
      balance: 1000000,
      totalInflow: 1000000,
    },
  });
  console.log("Funder '自有资金' seeded:", funder.id, "(phone: 13900000001 / funder123)");

  // ── 更多测试资金方 ──
  const testFunders = [
    {
      name: "鸿运投资",
      type: "COMPANY",
      contactPerson: "陈老板",
      contactPhone: "13900000010",
      loginPhone: "13900000010",
      cooperationMode: "FIXED_MONTHLY",
      monthlyRate: 2.5,
      priority: 8,
      withdrawalCooldownDays: 7,
      remark: "固定月息合作方",
    },
    {
      name: "Athens Capital",
      type: "COMPANY",
      contactPerson: "Dimitris K.",
      contactPhone: "6973000003",
      loginPhone: "6973000003",
      cooperationMode: "VOLUME_BASED",
      weeklyRate: 1.5,
      priority: 5,
      riskSharing: true,
      riskShareRatio: 0.3,
      remark: "希腊本地资金方，按业务量结算",
    },
    {
      name: "周老板",
      type: "INDIVIDUAL",
      contactPerson: "周先生",
      contactPhone: "13900000020",
      loginPhone: "13900000020",
      cooperationMode: "FIXED_MONTHLY",
      monthlyRate: 2,
      priority: 3,
      withdrawalCooldownDays: 14,
      remark: "个人投资者",
    },
  ];
  for (const f of testFunders) {
    const created = await prisma.funder.upsert({
      where: { name: f.name },
      create: { ...f, passwordHash: funderPwd },
      update: { loginPhone: f.loginPhone, passwordHash: funderPwd },
    });
    // 为每个资金方创建一个资金账户
    const acctNo = "6228" + f.loginPhone.slice(-8).padStart(12, "0");
    await prisma.fundAccount.upsert({
      where: { accountNo: acctNo },
      create: {
        funderId: created.id,
        accountName: `${f.name}账户`,
        bankName: "中国银行",
        accountNo: acctNo,
        balance: 500000,
        totalInflow: 500000,
      },
      update: {},
    });
  }
  console.log("Test funders seeded:", testFunders.length, "(password: funder123)");

  console.log("Funder & FundAccount seeded:", funder.id, fundAccount.id);

  // ── 修复逾期费率缺失值 ──
  await prisma.systemSetting.upsert({
    where: { key: "loan_overdue_rate_per_day_before_14" },
    create: { key: "loan_overdue_rate_per_day_before_14", value: JSON.stringify({ value: 1 }), group: "LOAN_FEE", remark: "overdueRatePerDayBefore14" },
    update: { value: JSON.stringify({ value: 1 }) },
  });
  await prisma.systemSetting.upsert({
    where: { key: "loan_overdue_rate_per_day_after_14" },
    create: { key: "loan_overdue_rate_per_day_after_14", value: JSON.stringify({ value: 2 }), group: "LOAN_FEE", remark: "overdueRatePerDayAfter14" },
    update: { value: JSON.stringify({ value: 2 }) },
  });
  console.log("Overdue fee rates fixed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
