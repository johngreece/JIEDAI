"use client";

import { useState, useTransition } from "react";

export function ConfirmReceivedButton({ disbursementId }: { disbursementId: string }) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => {
          setError("");
          startTransition(async () => {
            try {
              const res = await fetch(`/api/client/disbursements/${disbursementId}/confirm-received`, {
                method: "POST",
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error ?? "确认失败");
              window.location.reload();
            } catch (e) {
              setError(e instanceof Error ? e.message : "确认失败");
            }
          });
        }}
        disabled={isPending}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {isPending ? "处理中..." : "确认已收款"}
      </button>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </div>
  );
}
