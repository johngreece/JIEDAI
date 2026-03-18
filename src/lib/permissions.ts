/**
 * 权限定义数据 — 用于 seed 和 UI 展示
 */

export const PERMISSION_DEFINITIONS = [
  // ── 客户管理 ──
  { code: "customer:view", module: "customer", name: "查看客户" },
  { code: "customer:create", module: "customer", name: "创建客户" },
  { code: "customer:edit", module: "customer", name: "编辑客户" },

  // ── 贷款申请 ──
  { code: "loan:view", module: "loan", name: "查看贷款申请" },
  { code: "loan:create", module: "loan", name: "创建贷款申请" },
  { code: "loan:risk", module: "loan", name: "风控审核" },
  { code: "loan:approve", module: "loan", name: "审批贷款" },

  // ── 合同 ──
  { code: "contract:view", module: "contract", name: "查看合同" },
  { code: "contract:generate", module: "contract", name: "生成合同" },

  // ── 放款 ──
  { code: "disbursement:view", module: "disbursement", name: "查看放款" },
  { code: "disbursement:create", module: "disbursement", name: "创建放款" },
  { code: "disbursement:confirm", module: "disbursement", name: "确认打款" },

  // ── 还款 ──
  { code: "repayment:view", module: "repayment", name: "查看还款" },
  { code: "repayment:create", module: "repayment", name: "登记还款" },
  { code: "repayment:allocate", module: "repayment", name: "分配还款" },

  // ── 逾期 ──
  { code: "overdue:view", module: "overdue", name: "查看逾期" },
  { code: "overdue:scan", module: "overdue", name: "执行逾期扫描" },

  // ── 展期/重组 ──
  { code: "extension:view", module: "extension", name: "查看展期" },
  { code: "extension:create", module: "extension", name: "申请展期" },
  { code: "extension:approve", module: "extension", name: "审批展期" },

  // ── 台账 ──
  { code: "ledger:view", module: "ledger", name: "查看台账" },

  // ── 系统设置 ──
  { code: "settings:view", module: "settings", name: "查看设置" },
  { code: "settings:edit", module: "settings", name: "修改设置" },

  // ── 用户管理 ──
  { code: "user:view", module: "user", name: "查看用户" },
  { code: "user:create", module: "user", name: "创建用户" },
  { code: "user:edit", module: "user", name: "编辑用户" },
  { code: "role:manage", module: "user", name: "管理角色权限" },

  // ── 审计 ──
  { code: "audit:view", module: "audit", name: "查看审计日志" },

  // ── Dashboard ──
  { code: "dashboard:view", module: "dashboard", name: "查看仪表板" },
] as const;

export type PermissionCode = (typeof PERMISSION_DEFINITIONS)[number]["code"];
