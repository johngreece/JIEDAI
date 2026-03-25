"use client";

import { useCallback, useEffect, useState } from "react";

type LedgerItem = {
  id: string;
  entryNo: string;
  type: string;
  direction: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  description: string | null;
  createdAt: string;
  customer?: { id: string; name: string } | null;
  operator?: { id: string; username: string; realName: string | null } | null;
};

const TYPE_MAP: Record<string, string> = {
  DISBURSEMENT: "放款",
  REPAYMENT: "还款",
  FEE: "费用",
  PENALTY: "罚息",
  EXTENSION_FEE: "展期费",
  FUND_INFLOW: "入金",
  ADJUSTMENT: "调账",
};

export default function LedgerPage() {
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [direction, setDirection] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "30" });
      if (type) params.set("type", type);
      if (direction) params.set("direction", direction);
      const res = await fetch(`/api/ledger?${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [direction, page, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Ledger</span>
          <h1 className="admin-page-header__title">台账查询</h1>
          <p className="admin-page-header__description">查看全量资金流水、账前账后余额变化和业务引用关系。</p>
        </div>
        <div className="admin-toolbar-group">
          <select
            className="admin-field w-40 text-sm"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部类型</option>
            {Object.entries(TYPE_MAP).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
          <select
            className="admin-field w-40 text-sm"
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部方向</option>
            <option value="DEBIT">入账</option>
            <option value="CREDIT">出账</option>
          </select>
          <button onClick={load} className="admin-btn admin-btn-secondary">
            刷新
          </button>
        </div>
      </header>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">资金流水明细</div>
            <p className="admin-table-note">按类型和方向筛选，便于核对入金、放款、还款与罚息分录。</p>
          </div>
          <div className="text-xs font-medium text-slate-500">每页 30 条</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">流水号</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">方向</th>
                <th className="px-4 py-3">金额</th>
                <th className="px-4 py-3">余额变化</th>
                <th className="px-4 py-3">客户</th>
                <th className="px-4 py-3">说明</th>
                <th className="px-4 py-3">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    加载中...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    暂无记录
                  </td>
                </tr>
              ) : (
                items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{entry.entryNo}</td>
                    <td className="px-4 py-3 text-slate-700">{TYPE_MAP[entry.type] ?? entry.type}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                          entry.direction === "DEBIT"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }`}
                      >
                        {entry.direction === "DEBIT" ? "入账" : "出账"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">EUR {entry.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {entry.balanceBefore.toLocaleString()} → {entry.balanceAfter.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{entry.customer?.name ?? "-"}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-500">{entry.description ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(entry.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="admin-pagination">
            <span className="admin-pagination__summary">共 {total} 条记录</span>
            <div className="admin-pagination__controls">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="admin-btn admin-btn-ghost admin-btn-sm"
              >
                上一页
              </button>
              <span className="admin-pagination__status">
                {page}/{totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="admin-btn admin-btn-ghost admin-btn-sm"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
