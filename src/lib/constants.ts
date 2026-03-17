export const LOAN_STATUS_MAP = {
  SUBMITTED: { label: "待审核", color: "blue", hex: "#3b82f6" },
  APPROVED: { label: "已通过", color: "emerald", hex: "#10b981" },
  REJECTED: { label: "已拒绝", color: "red", hex: "#ef4444" },
  DISBURSED: { label: "已放款", color: "cyan", hex: "#06b6d4" },
  COMPLETED: { label: "已结清", color: "slate", hex: "#64748b" },
  OVERDUE: { label: "已逾期", color: "amber", hex: "#f59e0b" },
} as const;

export type LoanStatusKey = keyof typeof LOAN_STATUS_MAP;

export const REPAYMENT_STATUS_MAP = {
  PENDING: { label: "待还款", color: "blue" },
  PAID: { label: "已还款", color: "emerald" },
  OVERDUE: { label: "逾期", color: "red" },
  PARTIAL: { label: "部分还款", color: "amber" },
} as const;

export const CONTRACT_TYPE_MAP = {
  MAIN: "借款合同",
  GUARANTEE: "担保合同",
  SUPPLEMENTARY: "补充协议",
} as const;

export const RISK_LEVEL_MAP = {
  LOW: { label: "低风险", color: "emerald" },
  MEDIUM: { label: "中风险", color: "amber" },
  HIGH: { label: "高风险", color: "red" },
} as const;