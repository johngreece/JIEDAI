"use client";

import { BankPaymentConfirmationDialog } from "./BankPaymentConfirmationDialog";

type Props = {
  open: boolean;
  disbursementNo: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (evidence: FormData) => Promise<void>;
};

export function DisbursementConfirmationDialog({
  open,
  disbursementNo,
  busy,
  onClose,
  onConfirm,
}: Props) {
  return (
    <BankPaymentConfirmationDialog
      open={open}
      reference={disbursementNo}
      busy={busy}
      failureMessage="Failed to confirm disbursement"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
