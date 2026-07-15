"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  reference: string;
  busy: boolean;
  title?: string;
  confirmLabel?: string;
  failureMessage?: string;
  onClose: () => void;
  onConfirm: (evidence: FormData) => Promise<void>;
};

export function BankPaymentConfirmationDialog({
  open,
  reference,
  busy,
  title = "Confirm bank transfer",
  confirmLabel = "Confirm paid",
  failureMessage = "Failed to confirm bank transfer",
  onClose,
  onConfirm,
}: Props) {
  const [transactionId, setTransactionId] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTransactionId("");
    setProofUrl("");
    setProof(null);
    setError("");
  }, [open, reference]);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!proof && !proofUrl.trim()) {
      setError("Upload a receipt or provide an HTTPS evidence link.");
      return;
    }
    if (proofUrl.trim() && !proofUrl.trim().startsWith("https://")) {
      setError("Evidence links must use HTTPS.");
      return;
    }

    const evidence = new FormData();
    evidence.append("transactionId", transactionId.trim());
    if (proof) evidence.append("proof", proof);
    if (!proof && proofUrl.trim()) {
      evidence.append("proofUrl", proofUrl.trim());
      evidence.append("proofFileName", `bank-evidence-${transactionId.trim()}`);
      evidence.append("proofMimeType", "text/uri-list");
    }

    try {
      await onConfirm(evidence);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : failureMessage);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-bank-payment-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id="confirm-bank-payment-title" className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{reference}</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">Bank transaction ID</span>
            <input
              required
              minLength={3}
              maxLength={120}
              pattern="[A-Za-z0-9][A-Za-z0-9._:/-]*"
              value={transactionId}
              onChange={(event) => setTransactionId(event.target.value)}
              className="input-base"
              placeholder="BANK-2026-000184"
              autoFocus
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">Bank receipt</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => setProof(event.target.files?.[0] ?? null)}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <span className="block text-xs text-slate-500">JPG, PNG, WebP or PDF, up to 10 MB.</span>
          </label>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            <span>OR</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">HTTPS evidence link</span>
            <input
              type="url"
              value={proofUrl}
              onChange={(event) => setProofUrl(event.target.value)}
              className="input-base"
              placeholder="https://..."
              disabled={Boolean(proof)}
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="admin-btn admin-btn-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="admin-btn admin-btn-primary disabled:opacity-50"
          >
            {busy ? "Confirming..." : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
