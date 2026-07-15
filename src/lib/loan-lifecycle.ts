export const CANONICAL_LOAN_STATUSES = [
  "DRAFT",
  "RETURNED",
  "PENDING_RISK",
  "PENDING_APPROVAL",
  "APPROVED",
  "CONTRACTED",
  "DISBURSED",
  "REJECTED",
  "SETTLED",
  "CANCELLED",
] as const;

export type LoanStatus = (typeof CANONICAL_LOAN_STATUSES)[number];

// Kept for reading historical rows only. New writes must use canonical statuses.
export const LEGACY_LOAN_STATUSES = [
  "SUBMITTED",
  "PENDING_CONTRACT",
  "CONTRACT_SIGNED",
  "PENDING_DISBURSEMENT",
  "OVERDUE",
  "COMPLETED",
] as const;

export type LegacyLoanStatus = (typeof LEGACY_LOAN_STATUSES)[number];
export type KnownLoanStatus = LoanStatus | LegacyLoanStatus;

export const ACTIVE_LOAN_STATUSES: readonly KnownLoanStatus[] = [
  "DRAFT",
  "RETURNED",
  "PENDING_RISK",
  "PENDING_APPROVAL",
  "APPROVED",
  "CONTRACTED",
  "DISBURSED",
  "SUBMITTED",
  "PENDING_CONTRACT",
  "CONTRACT_SIGNED",
  "PENDING_DISBURSEMENT",
  "OVERDUE",
];

export const TERMINAL_LOAN_STATUSES: readonly KnownLoanStatus[] = [
  "REJECTED",
  "SETTLED",
  "CANCELLED",
  "COMPLETED",
];

export const LOAN_ACTIONS = [
  "SUBMIT",
  "RESUBMIT",
  "RISK_PASS",
  "RISK_RETURN",
  "RISK_REJECT",
  "APPROVE",
  "APPROVAL_RETURN",
  "APPROVAL_REJECT",
  "SIGN_CONTRACT",
  "CONFIRM_DISBURSEMENT",
  "SETTLE",
  "CANCEL",
] as const;

export type LoanAction = (typeof LOAN_ACTIONS)[number];

export type LoanTransitionRule = {
  action: LoanAction;
  from: KnownLoanStatus;
  to: LoanStatus;
  permission: string;
};

export const LOAN_TRANSITIONS: readonly LoanTransitionRule[] = [
  { action: "SUBMIT", from: "DRAFT", to: "PENDING_RISK", permission: "loan:create" },
  { action: "RESUBMIT", from: "RETURNED", to: "PENDING_RISK", permission: "loan:create" },
  { action: "RISK_PASS", from: "PENDING_RISK", to: "PENDING_APPROVAL", permission: "loan:risk" },
  { action: "RISK_RETURN", from: "PENDING_RISK", to: "RETURNED", permission: "loan:risk" },
  { action: "RISK_REJECT", from: "PENDING_RISK", to: "REJECTED", permission: "loan:risk" },
  { action: "APPROVE", from: "PENDING_APPROVAL", to: "APPROVED", permission: "loan:approve" },
  {
    action: "APPROVAL_RETURN",
    from: "PENDING_APPROVAL",
    to: "RETURNED",
    permission: "loan:approve",
  },
  { action: "APPROVAL_REJECT", from: "PENDING_APPROVAL", to: "REJECTED", permission: "loan:approve" },
  { action: "SIGN_CONTRACT", from: "APPROVED", to: "CONTRACTED", permission: "client:self" },
  {
    action: "CONFIRM_DISBURSEMENT",
    from: "CONTRACTED",
    to: "DISBURSED",
    permission: "disbursement:confirm",
  },
  { action: "SETTLE", from: "DISBURSED", to: "SETTLED", permission: "repayment:confirm" },
  { action: "SETTLE", from: "OVERDUE", to: "SETTLED", permission: "repayment:confirm" },
  { action: "CANCEL", from: "DRAFT", to: "CANCELLED", permission: "loan:create" },
  { action: "CANCEL", from: "RETURNED", to: "CANCELLED", permission: "loan:create" },
  { action: "CANCEL", from: "REJECTED", to: "CANCELLED", permission: "loan:create" },
];

export class LoanTransitionError extends Error {
  readonly code = "INVALID_LOAN_TRANSITION";

  constructor(
    readonly from: string,
    readonly to: string,
    readonly action: LoanAction
  ) {
    super(`Loan action ${action} cannot move application from ${from} to ${to}`);
    this.name = "LoanTransitionError";
  }
}

export function canTransitionLoan(
  from: string,
  to: string,
  action: LoanAction
): boolean {
  return LOAN_TRANSITIONS.some(
    (rule) => rule.action === action && rule.from === from && rule.to === to
  );
}

export function assertLoanTransition(
  from: string,
  to: string,
  action: LoanAction
): void {
  if (!canTransitionLoan(from, to, action)) {
    throw new LoanTransitionError(from, to, action);
  }
}

export function getAvailableLoanActions(status: string): LoanAction[] {
  return LOAN_TRANSITIONS.filter((rule) => rule.from === status).map(
    (rule) => rule.action
  );
}

export function isTerminalLoanStatus(status: string): boolean {
  return TERMINAL_LOAN_STATUSES.includes(status as KnownLoanStatus);
}
