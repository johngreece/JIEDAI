export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "草稿",
    REJECTED: "已拒绝",
    PENDING_RISK: "待风控",
    PENDING_APPROVAL: "待审批",
    APPROVED: "已审批",
    DISBURSED: "已放款",
    CONTRACTED: "已签约",
    ACTIVE: "进行中",
    COMPLETED: "已完成",
    PENDING: "待处理",
    MATCHED: "已匹配",
    PENDING_CONFIRM: "待客户确认",
    CUSTOMER_CONFIRMED: "客户已报备付款",
    CONFIRMED: "已确认到账",
    MANUAL_REVIEW: "人工复核",
    PAID: "已结清",
    PARTIAL: "部分已还",
    OVERDUE: "已逾期",
    CANCELLED: "已取消",
  };

  return map[status] ?? status;
}

export function getStatusBadgeClass(status: string): string {
  if (["APPROVED", "DISBURSED", "CONFIRMED", "COMPLETED", "PAID"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (["CUSTOMER_CONFIRMED"].includes(status)) {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }

  if (["PENDING", "PENDING_RISK", "PENDING_APPROVAL", "PENDING_CONFIRM", "MATCHED", "MANUAL_REVIEW"].includes(status)) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  if (["REJECTED", "OVERDUE", "CANCELLED"].includes(status)) {
    return "bg-red-50 text-red-700 border-red-200";
  }

  if (["PARTIAL"].includes(status)) {
    return "bg-sky-50 text-sky-700 border-sky-200";
  }

  return "bg-slate-50 text-slate-700 border-slate-200";
}
