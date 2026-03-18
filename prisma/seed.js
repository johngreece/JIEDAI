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
  <p>借款金额：{{ loan_amount }} 元（大写：{{ loan_amount_cn }}）</p>
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

  // ── 贷款产品 ──
  const product1 = await prisma.loanProduct.upsert({
    where: { code: "SHORT_TERM_7D" },
    create: {
      name: "7天短期借款",
      code: "SHORT_TERM_7D",
      description: "7天期短期小额借款产品",
      minAmount: 1000,
      maxAmount: 50000,
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
    where: { code: "SHORT_TERM_14D" },
    create: {
      name: "14天短期借款",
      code: "SHORT_TERM_14D",
      description: "14天期短期借款产品",
      minAmount: 1000,
      maxAmount: 100000,
      minTermValue: 14,
      maxTermValue: 14,
      termUnit: "DAY",
      repaymentMethod: "ONE_TIME",
      allowEarlyRepay: true,
      allowExtension: true,
      maxExtensionTimes: 2,
    },
    update: {},
  });
  const product3 = await prisma.loanProduct.upsert({
    where: { code: "MONTH_1M" },
    create: {
      name: "1个月期借款",
      code: "MONTH_1M",
      description: "1个月期借款产品，到期一次还本付息",
      minAmount: 5000,
      maxAmount: 200000,
      minTermValue: 1,
      maxTermValue: 1,
      termUnit: "MONTH",
      repaymentMethod: "ONE_TIME",
      allowEarlyRepay: true,
      allowExtension: true,
      maxExtensionTimes: 3,
    },
    update: {},
  });
  const product4 = await prisma.loanProduct.upsert({
    where: { code: "MONTH_3M" },
    create: {
      name: "3个月期借款",
      code: "MONTH_3M",
      description: "3个月期借款产品，按月等额还款",
      minAmount: 10000,
      maxAmount: 500000,
      minTermValue: 3,
      maxTermValue: 3,
      termUnit: "MONTH",
      repaymentMethod: "EQUAL_INSTALLMENT",
      allowEarlyRepay: true,
      allowExtension: false,
      maxExtensionTimes: 0,
    },
    update: {},
  });
  console.log("Loan products seeded:", product1.id, product2.id, product3.id, product4.id);

  // ── 资金方 & 资金账户 ──
  const funder = await prisma.funder.upsert({
    where: { name: "自有资金" },
    create: {
      name: "自有资金",
      type: "COMPANY",
      contactPerson: "管理员",
      contactPhone: "13900000001",
      profitShareRatio: 0,
      remark: "公司自有资金池",
    },
    update: {},
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
