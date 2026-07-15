import type { LoanApplication, Prisma } from "@prisma/client";
import type { AuditAction } from "@/lib/audit";
import {
  assertLoanTransition,
  type LoanAction,
  type LoanStatus,
} from "@/lib/loan-lifecycle";

export class LoanTransitionConflictError extends Error {
  readonly code = "LOAN_TRANSITION_CONFLICT";

  constructor(readonly applicationId: string) {
    super("Loan application status changed, please refresh and retry");
    this.name = "LoanTransitionConflictError";
  }
}

export async function transitionLoanApplication(
  tx: Prisma.TransactionClient,
  input: {
    applicationId: string;
    from: string;
    to: LoanStatus;
    action: LoanAction;
    operatorId: string;
    auditAction: AuditAction;
    changeSummary: string;
    data?: Prisma.LoanApplicationUpdateManyMutationInput;
    auditOldValue?: Record<string, unknown>;
    auditNewValue?: Record<string, unknown>;
  }
): Promise<LoanApplication> {
  assertLoanTransition(input.from, input.to, input.action);

  const claimed = await tx.loanApplication.updateMany({
    where: {
      id: input.applicationId,
      status: input.from,
      deletedAt: null,
    },
    data: {
      ...input.data,
      status: input.to,
    },
  });

  if (claimed.count !== 1) {
    throw new LoanTransitionConflictError(input.applicationId);
  }

  const updated = await tx.loanApplication.findUniqueOrThrow({
    where: { id: input.applicationId },
  });

  await tx.auditLog.create({
    data: {
      userId: input.operatorId,
      action: input.auditAction,
      entityType: "loan_application",
      entityId: input.applicationId,
      oldValue: JSON.stringify({ status: input.from, ...input.auditOldValue }),
      newValue: JSON.stringify({ status: input.to, ...input.auditNewValue }),
      changeSummary: input.changeSummary,
    },
  });

  return updated;
}
