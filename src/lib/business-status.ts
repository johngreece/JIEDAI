export {
  ACTIVE_LOAN_STATUSES,
  TERMINAL_LOAN_STATUSES,
} from "./loan-lifecycle";

export const OPEN_DISBURSEMENT_STATUSES = ["PENDING", "PAID"] as const;

export const OPEN_FUNDER_WITHDRAWAL_STATUSES = ["PENDING", "APPROVED"] as const;
