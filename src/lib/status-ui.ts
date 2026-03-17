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
    PENDING_CONFIRM: "待确认",
    CONFIRMED: "已确认",
    MANUAL_REVIEW: "人工复核",
    PAID: "已打款",
    OVERDUE: "已逾期",
    CANCELLED: "已取消",
  };

  return map[status] ?? status;
}

export function getStatusBadgeClass(status: string): string {
  if (["APPROVED", "DISBURSED", "CONFIRMED", "COMPLETED", "PAID"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (["PENDING", "PENDING_RISK", "PENDING_APPROVAL", "PENDING_CONFIRM", "MATCHED"].includes(status)) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  if (["REJECTED", "OVERDUE", "CANCELLED", "MANUAL_REVIEW"].includes(status)) {
    return "bg-red-50 text-red-700 border-red-200";
  }

  return "bg-slate-50 text-slate-700 border-slate-200";
}
