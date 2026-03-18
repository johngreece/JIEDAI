const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

async function main() {
  console.log("=== 数据库全面检查 ===\n");
  await p.$queryRawUnsafe("SELECT 1");
  console.log("[OK] 数据库已连接\n");

  // 检查所有 31 张表的记录数
  const tables = [
    "user", "role", "permission", "rolePermission",
    "customer", "customerKyc",
    "funder", "fundAccount", "capitalInflow", "fundProfitShare",
    "loanProduct", "pricingRule",
    "loanApplication", "loanApproval",
    "contractTemplate", "contract", "signature",
    "disbursement",
    "repaymentPlan", "repaymentScheduleItem", "repayment", "repaymentAllocation", "repaymentConfirmation",
    "overdueRecord",
    "extension", "restructure",
    "ledgerEntry",
    "auditLog", "attachment", "notification",
    "systemSetting",
  ];

  console.log("--- 各表记录数 ---");
  for (const t of tables) {
    try {
      const count = await p[t].count();
      const icon = count > 0 ? "✓" : "○";
      console.log(`  ${icon} ${t}: ${count}`);
    } catch (e) {
      console.log(`  ✗ ${t}: ERROR - ${e.message.split("\n")[0]}`);
    }
  }

  // 详细检查关键数据
  console.log("\n--- 用户详情 ---");
  const users = await p.user.findMany({
    where: { deletedAt: null },
    select: { username: true, realName: true, isActive: true, role: { select: { name: true, code: true } } },
  });
  users.forEach((u) => console.log(`  - ${u.username} | ${u.realName} | ${u.role.name}(${u.role.code}) | 启用:${u.isActive}`));

  console.log("\n--- 角色及权限 ---");
  const roles = await p.role.findMany({ include: { permissions: { include: { permission: true } } } });
  roles.forEach((r) => {
    const perms = r.permissions.map((rp) => rp.permission.code);
    console.log(`  - ${r.name}(${r.code}) | 系统角色:${r.isSystem} | 权限${perms.length}个`);
    if (perms.length > 0) console.log(`    → ${perms.join(", ")}`);
  });

  console.log("\n--- 客户详情 ---");
  const customers = await p.customer.findMany({ where: { deletedAt: null }, select: { name: true, phone: true, idNumber: true, passwordHash: true } });
  customers.forEach((c) => console.log(`  - ${c.name} | ${c.phone} | ${c.idNumber} | 有密码:${!!c.passwordHash}`));

  console.log("\n--- 贷款产品 ---");
  const products = await p.loanProduct.findMany({ where: { deletedAt: null } });
  if (products.length === 0) console.log("  ⚠️ 无贷款产品，需要创建！");
  products.forEach((p) => console.log(`  - ${p.name} | ${p.code} | 状态:${p.status}`));

  console.log("\n--- 资金方 & 资金账户 ---");
  const funders = await p.funder.findMany();
  const fundAccounts = await p.fundAccount.findMany();
  console.log(`  资金方: ${funders.length}, 资金账户: ${fundAccounts.length}`);
  if (funders.length === 0) console.log("  ⚠️ 无资金方，需要创建！");

  console.log("\n--- 合同模板 ---");
  const tpls = await p.contractTemplate.findMany({ select: { code: true, name: true, isActive: true } });
  tpls.forEach((t) => console.log(`  - ${t.code} | ${t.name} | 启用:${t.isActive}`));

  console.log("\n--- 费率设置 ---");
  const settings = await p.systemSetting.findMany();
  settings.forEach((s) => console.log(`  - ${s.key} = ${s.value} (${s.group})`));

  console.log("\n=== 检查完成 ===");
}

main()
  .catch((e) => console.error("ERROR:", e.message))
  .finally(() => p.$disconnect());
