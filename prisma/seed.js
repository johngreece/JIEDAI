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
  const financeRole = await prisma.role.upsert({
    where: { code: "finance" },
    create: { name: "财务", code: "finance", description: "放款、还款、台账与对账" },
    update: { name: "财务", description: "放款、还款、台账与对账" },
  });
  const operatorRole = await prisma.role.upsert({
    where: { code: "operator" },
    create: { name: "操作员", code: "operator", description: "日常操作" },
    update: {},
  });
  console.log("Roles seeded:", superAdminRole.id, managerRole.id, financeRole.id, operatorRole.id);

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

  // ── 系统管理员账号（固定账号） ──
  const hashedPwd = await bcrypt.hash("Wanjin888@", 12);
  await prisma.user.upsert({
    where: { username: "admin" },
    create: {
      username: "admin",
      passwordHash: hashedPwd,
      realName: "系统管理员",
      roleId: superAdminRole.id,
    },
    update: { passwordHash: hashedPwd },
  });
  console.log("Admin account ready (admin / Wanjin888@).");

  const managerPwd = await bcrypt.hash("manager123", 12);
  await prisma.user.upsert({
    where: { username: "manager" },
    create: {
      username: "manager",
      passwordHash: managerPwd,
      realName: "瀹℃壒缁忕悊",
      phone: "13900000003",
      roleId: managerRole.id,
    },
    update: { passwordHash: managerPwd, phone: "13900000003", roleId: managerRole.id },
  });
  console.log("Manager account ready (manager / manager123).");

  const financePwd = await bcrypt.hash("finance123", 12);
  await prisma.user.upsert({
    where: { username: "finance" },
    create: {
      username: "finance",
      passwordHash: financePwd,
      realName: "璐㈠姟娴嬭瘯",
      phone: "13900000004",
      roleId: financeRole.id,
    },
    update: { passwordHash: financePwd, phone: "13900000004", roleId: financeRole.id },
  });
  console.log("Finance account ready (finance / finance123).");

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
  const managerPermCodes = [
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
  ];
  const managerPerms = await prisma.permission.findMany({
    where: { code: { in: managerPermCodes } },
  });
  for (const perm of managerPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: managerRole.id, permissionId: perm.id },
      },
      create: { roleId: managerRole.id, permissionId: perm.id },
      update: {},
    });
  }
  console.log("Manager role permissions assigned:", managerPerms.length);

  const financePermCodes = [
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
  ];
  const financePerms = await prisma.permission.findMany({
    where: { code: { in: financePermCodes } },
  });
  for (const perm of financePerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: financeRole.id, permissionId: perm.id },
      },
      create: { roleId: financeRole.id, permissionId: perm.id },
      update: {},
    });
  }
  console.log("Finance role permissions assigned:", financePerms.length);

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
      description: "砍头息模式：借10000到账9500，7天内任何时间还款均按固定5%执行",
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
      description: "砍头息模式：借10000到账9500，7天内任何时间还款均按固定5%执行",
      minTermValue: 7,
      maxTermValue: 7,
      isActive: true,
    },
  });
  const product2 = await prisma.loanProduct.upsert({
    where: { code: "FULL_AMOUNT_7D" },
    create: {
      name: "全额短期贷（7天）",
      code: "FULL_AMOUNT_7D",
      description: "全额到账模式：5小时2%，24小时3%，48小时4%，7天内6%",
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
      description: "全额到账模式：5小时2%，24小时3%，48小时4%，7天内6%",
      minTermValue: 7,
      maxTermValue: 7,
      isActive: true,
    },
  });
  console.log("Loan products seeded:", product1.id, product2.id);

  // ── 定价规则 — 砍头息产品 ──
  const upfrontRules = [
    { name: "砍头息手续费", ruleType: "UPFRONT_FEE", rateValue: 5, conditionJson: null, priority: 100 },
    { name: "通道类型", ruleType: "CHANNEL", rateValue: 0, conditionJson: JSON.stringify({ type: "UPFRONT_DEDUCTION" }), priority: 99 },
    { name: "7天内固定费率", ruleType: "TIER_RATE", rateValue: 5, conditionJson: JSON.stringify({ maxHours: 168, maxDays: 7, label: "7天内固定5%" }), priority: 10 },
    { name: "逾期阶段1", ruleType: "OVERDUE_PHASE1", rateValue: 1, conditionJson: JSON.stringify({ startDay: 1, maxOverdueDay: 7, compound: true, label: "逾期第1-7天" }), priority: 5 },
    { name: "逾期阶段2", ruleType: "OVERDUE_PHASE2", rateValue: 2, conditionJson: JSON.stringify({ startDay: 8, maxOverdueDay: 30, compound: true, label: "逾期第8-30天" }), priority: 4 },
    { name: "逾期阶段3", ruleType: "OVERDUE_PHASE3", rateValue: 3, conditionJson: JSON.stringify({ startDay: 31, compound: true, label: "逾期第31天起" }), priority: 3 },
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
    { name: "5小时内还", ruleType: "TIER_RATE", rateValue: 2, conditionJson: JSON.stringify({ maxHours: 5, maxDays: 0, label: "5小时内还" }), priority: 10 },
    { name: "24小时内还", ruleType: "TIER_RATE", rateValue: 3, conditionJson: JSON.stringify({ maxHours: 24, maxDays: 1, label: "24小时内还" }), priority: 9 },
    { name: "48小时内还", ruleType: "TIER_RATE", rateValue: 4, conditionJson: JSON.stringify({ maxHours: 48, maxDays: 2, label: "48小时内还" }), priority: 8 },
    { name: "7天内还", ruleType: "TIER_RATE", rateValue: 6, conditionJson: JSON.stringify({ maxHours: 168, maxDays: 7, label: "48小时后至7天内还" }), priority: 7 },
    { name: "逾期阶段1", ruleType: "OVERDUE_PHASE1", rateValue: 1, conditionJson: JSON.stringify({ startDay: 1, maxOverdueDay: 7, compound: true, label: "逾期第1-7天" }), priority: 5 },
    { name: "逾期阶段2", ruleType: "OVERDUE_PHASE2", rateValue: 2, conditionJson: JSON.stringify({ startDay: 8, maxOverdueDay: 30, compound: true, label: "逾期第8-30天" }), priority: 4 },
    { name: "逾期阶段3", ruleType: "OVERDUE_PHASE3", rateValue: 3, conditionJson: JSON.stringify({ startDay: 31, compound: true, label: "逾期第31天起" }), priority: 3 },
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

  // ── 测试贷款申请（多种状态方便测试） ──
  const adminUser = await prisma.user.findUnique({ where: { username: "admin" } });
  const customer1 = await prisma.customer.findUnique({ where: { phone: "13800000001" } });
  const customer2 = await prisma.customer.findUnique({ where: { phone: "13800000002" } });
  const customer3 = await prisma.customer.findUnique({ where: { phone: "13800000003" } });
  const customer4 = await prisma.customer.findUnique({ where: { phone: "13800000004" } });

  if (adminUser && customer1 && customer2 && customer3 && customer4) {
    const testApps = [
      {
        applicationNo: "LA-TEST-001",
        customerId: customer1.id,
        productId: product1.id,
        amount: 6000,
        termValue: 7,
        termUnit: "DAY",
        purpose: "经营周转",
        status: "DRAFT",
        createdById: adminUser.id,
        remark: "测试 — 草稿状态，等待提交",
      },
      {
        applicationNo: "LA-TEST-002",
        customerId: customer2.id,
        productId: product1.id,
        amount: 10000,
        termValue: 7,
        termUnit: "DAY",
        purpose: "进货资金",
        status: "PENDING_RISK",
        createdById: adminUser.id,
        remark: "测试 — 等待风控审核",
      },
      {
        applicationNo: "LA-TEST-003",
        customerId: customer3.id,
        productId: product1.id,
        amount: 8000,
        termValue: 7,
        termUnit: "DAY",
        purpose: "紧急周转",
        status: "PENDING_APPROVAL",
        riskScore: 75,
        riskComment: "风控通过，客户信用良好",
        createdById: adminUser.id,
        remark: "测试 — 等待审批",
      },
      {
        applicationNo: "LA-TEST-004",
        customerId: customer4.id,
        productId: product2.id,
        amount: 5000,
        termValue: 7,
        termUnit: "DAY",
        purpose: "店铺租金",
        status: "APPROVED",
        riskScore: 82,
        riskComment: "风控通过",
        totalApprovedAmount: 5000,
        approvedAt: new Date(),
        createdById: adminUser.id,
        remark: "测试 — 已审批，等待放款",
      },
    ];

    for (const app of testApps) {
      await prisma.loanApplication.upsert({
        where: { applicationNo: app.applicationNo },
        create: app,
        update: { status: app.status, riskScore: app.riskScore, riskComment: app.riskComment },
      });
    }
    console.log("Test loan applications seeded:", testApps.length, "apps in 4 different states");
  }

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
      monthlyRate: 1,
      priority: 10,
      profitShareRatio: 0,
      remark: "公司自有资金池，月息1%用于核算内部资金成本",
    },
    update: {
      monthlyRate: 1,
      loginPhone: "13900000001",
      passwordHash: funderPwd,
      remark: "公司自有资金池，月息1%用于核算内部资金成本",
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
  console.log("Funder '自有资金' seeded:", funder.id, "(月息1%, phone: 13900000001 / funder123)");

  // ── 删除旧测试资金方 ──
  for (const oldName of ["鸿运投资", "Athens Capital", "周老板", "稳利月息项目A", "欧洲业务量项目", "月息保底项目B"]) {
    await prisma.funder.updateMany({ where: { name: oldName }, data: { deletedAt: new Date(), loginPhone: null } }).catch(() => {});
  }

  // ── 测试资金方项目 ──
  const testFunders = [
    {
      name: "稳利月息项目",
      type: "COMPANY",
      contactPerson: "合作方A",
      contactPhone: "13900000010",
      loginPhone: "13900000010",
      cooperationMode: "FIXED_MONTHLY",
      monthlyRate: 2,
      priority: 8,
      profitShareRatio: 0,
      remark: "长期合作伙伴，固定月息2%，按投入总额计息",
    },
    {
      name: "灵活业务量项目",
      type: "COMPANY",
      contactPerson: "合作方B",
      contactPhone: "6973000003",
      loginPhone: "6973000003",
      cooperationMode: "VOLUME_BASED",
      weeklyRate: 1.5,
      priority: 5,
      profitShareRatio: 0.3,
      remark: "按实际放款量结算，资金方占平台收费的30%（1.5%÷5%）",
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
    where: { key: "loan_overdue_rate_per_day_before_7" },
    create: { key: "loan_overdue_rate_per_day_before_7", value: JSON.stringify({ value: 1 }), group: "LOAN_FEE", remark: "overdueRatePerDayBefore7" },
    update: { value: JSON.stringify({ value: 1 }) },
  });
  await prisma.systemSetting.upsert({
    where: { key: "loan_overdue_rate_per_day_before_30" },
    create: { key: "loan_overdue_rate_per_day_before_30", value: JSON.stringify({ value: 2 }), group: "LOAN_FEE", remark: "overdueRatePerDayBefore30" },
    update: { value: JSON.stringify({ value: 2 }) },
  });
  await prisma.systemSetting.upsert({
    where: { key: "loan_overdue_rate_per_day_after_30" },
    create: { key: "loan_overdue_rate_per_day_after_30", value: JSON.stringify({ value: 3 }), group: "LOAN_FEE", remark: "overdueRatePerDayAfter30" },
    update: { value: JSON.stringify({ value: 3 }) },
  });
  console.log("Overdue fee rates fixed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
