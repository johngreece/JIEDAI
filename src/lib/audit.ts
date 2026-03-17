/**
 * 审计日志：关键操作记录 old/new 与操作人，供追责与对账
 */

import { prisma } from "./prisma";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "sign"
  | "confirm"
  | "reject"
  | "disburse"
  | "repay_register"
  | "repay_confirm";

export type AuditEntityType =
  | "loan_application"
  | "contract"
  | "disbursement"
  | "repayment"
  | "repayment_confirmation"
  | "customer"
  | "pricing_rule"
  | "system_setting";

export async function writeAuditLog(params: {
  userId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldValue: params.oldValue ?? undefined,
      newValue: params.newValue ?? undefined,
      ipAddress: params.ipAddress ?? undefined,
      userAgent: params.userAgent ?? undefined,
    },
  });
}

/**
 * 金额变更专用：记录前后金额与关键字段，便于对账
 */
export async function writeAmountAudit(params: {
  userId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  amountField: string;
  oldAmount: string | number;
  newAmount: string | number;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await writeAuditLog({
    ...params,
    oldValue: { [params.amountField]: params.oldAmount },
    newValue: { [params.amountField]: params.newAmount },
  });
}
