"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ProductOption = {
  id: string;
  name: string;
  description: string | null;
  minAmount: number;
  maxAmount: number;
  minTermValue: number;
  maxTermValue: number;
  termUnit: string;
};

type Props = {
  availableLimit: number;
  products: ProductOption[];
};

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function termText(value: number, unit: string) {
  return `${value} ${unit === "DAY" ? "天" : unit === "MONTH" ? "个月" : unit}`;
}

export function LoanApplicationPanel({ availableLimit, products }: Props) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? products[0] ?? null,
    [productId, products]
  );
  const [amount, setAmount] = useState(() => {
    if (!products[0]) return "";
    return String(Math.min(availableLimit || products[0].minAmount, products[0].maxAmount));
  });
  const [termValue, setTermValue] = useState(() => String(products[0]?.minTermValue ?? 0));
  const [purpose, setPurpose] = useState("");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const maxBorrowable = selectedProduct ? Math.min(selectedProduct.maxAmount, availableLimit) : 0;
  const limitInsufficient = selectedProduct ? maxBorrowable < selectedProduct.minAmount : true;

  const handleProductChange = (nextProductId: string) => {
    setProductId(nextProductId);
    const next = products.find((product) => product.id === nextProductId);
    if (!next) return;

    setAmount(String(Math.min(Math.max(next.minAmount, availableLimit || next.minAmount), next.maxAmount)));
    setTermValue(String(next.minTermValue));
    setError("");
    setMessage("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/client/loan-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          amount: Number(amount),
          termValue: Number(termValue),
          purpose: purpose || undefined,
          remark: remark || undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "借款申请提交失败");
        return;
      }

      setMessage(`借款申请 ${data.applicationNo} 已提交，当前进入待风控。`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (products.length === 0) {
    return (
      <div className="panel-soft rounded-2xl p-6 text-sm text-slate-500">
        当前没有可申请的借款产品，请联系管理员配置后再试。
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="stat-tile rounded-2xl p-5">
          <div className="text-sm text-slate-500">可借额度</div>
          <div className="mt-3 text-2xl font-bold text-slate-900">{money(availableLimit)}</div>
          <div className="mt-2 text-xs text-slate-500">系统会按当前客户额度校验申请金额</div>
        </div>
        <div className="stat-tile rounded-2xl p-5">
          <div className="text-sm text-slate-500">可选产品</div>
          <div className="mt-3 text-2xl font-bold text-slate-900">{products.length}</div>
          <div className="mt-2 text-xs text-slate-500">可在下方选择产品后直接发起申请</div>
        </div>
        <div className="stat-tile rounded-2xl p-5">
          <div className="text-sm text-slate-500">默认期限</div>
          <div className="mt-3 text-2xl font-bold text-slate-900">
            {selectedProduct ? termText(selectedProduct.minTermValue, selectedProduct.termUnit) : "-"}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {selectedProduct
              ? `可申请范围 ${termText(selectedProduct.minTermValue, selectedProduct.termUnit)} - ${termText(selectedProduct.maxTermValue, selectedProduct.termUnit)}`
              : "请选择产品"}
          </div>
        </div>
      </section>

      <section className="stat-tile rounded-2xl p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">发起借款申请</h2>
            <p className="mt-1 text-sm text-slate-600">提交后会直接进入管理端待风控，并同步生成站内提醒。</p>
          </div>
          {selectedProduct ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <div>{selectedProduct.name}</div>
              <div className="mt-1">
                金额范围 {money(selectedProduct.minAmount)} - {money(maxBorrowable > 0 ? maxBorrowable : 0)}
              </div>
            </div>
          ) : null}
        </div>

        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={submit}>
          <label className="space-y-1.5 text-sm">
            <span className="text-slate-600">借款产品</span>
            <select
              className="input-base"
              value={productId}
              onChange={(event) => handleProductChange(event.target.value)}
              disabled={submitting}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="text-slate-600">申请金额</span>
            <input
              className="input-base"
              type="number"
              step="0.01"
              min={selectedProduct?.minAmount ?? 0}
              max={selectedProduct ? maxBorrowable : undefined}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={submitting}
              required
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="text-slate-600">借款期限</span>
            <input
              className="input-base"
              type="number"
              min={selectedProduct?.minTermValue ?? 1}
              max={selectedProduct?.maxTermValue ?? undefined}
              value={termValue}
              onChange={(event) => setTermValue(event.target.value)}
              disabled={submitting}
              required
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="text-slate-600">借款用途</span>
            <input
              className="input-base"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              disabled={submitting}
              placeholder="例如：经营周转、备货、短期应急"
            />
          </label>

          <label className="space-y-1.5 text-sm md:col-span-2">
            <span className="text-slate-600">补充说明</span>
            <textarea
              className="input-base min-h-28"
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              disabled={submitting}
              placeholder="可填写预计用款时间、特殊说明等"
            />
          </label>

          {limitInsufficient && selectedProduct ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 md:col-span-2">
              当前可借额度不足以申请 {selectedProduct.name} 的最小金额，请联系管理员调整额度或选择其他产品。
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 md:col-span-2">
              {message}
            </div>
          ) : null}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting || availableLimit <= 0 || limitInsufficient}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "提交中..." : "提交借款申请"}
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="stat-tile rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">借款利息规则</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              若产品为砍头息模式，实际到账金额会小于借款本金，系统会在放款时直接扣除服务费，请以合同和放款页展示为准。
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              正常还款费率按自然日差计算：当天还款 2%，次日还款 3%，第 3 到 7 天还款 5%。
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              如果是全额到账模式，则到账金额等于借款本金，最终应还金额会按对应费率上浮计算。
            </div>
          </div>
        </div>

        <div className="stat-tile rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">逾期与违约条款</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              到期后有 24 小时宽限期，宽限期内系统不会计入逾期费用。
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              超过宽限期后，前 14 天按本金每日 1% 计收逾期费用；第 15 天起按本金每日 2% 计收。
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              逾期费用按单利累计，不滚复利。你提交还款申请后，仍需等待管理端确认到账，逾期状态是否解除以后台入账结果为准。
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
