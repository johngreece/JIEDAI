"use client";

import { useMemo, useState } from "react";

import type { RepaymentPlanPrefetchItem, RepaymentPrefetchItem } from "@/lib/admin-prefetch";

type ScheduleItem = {
  id: string;
  periodNumber: number;
  dueDate: string;
  totalDue: number;
  remaining: number;
  status: string;
};

type AllocationDraft = {
  itemId: string;
  amount: string;
  type: "PRINCIPAL" | "INTEREST" | "FEE" | "PENALTY";
};

const EMPTY_ALLOCATION_ROW: AllocationDraft = {
  itemId: "",
  amount: "",
  type: "PRINCIPAL",
};

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

type RepaymentsPageClientProps = {
  initialPlans: RepaymentPlanPrefetchItem[];
  initialRepayments: RepaymentPrefetchItem[];
  initialPendingQueue: RepaymentPrefetchItem[];
};

export function RepaymentsPageClient({
  initialPlans,
  initialRepayments,
  initialPendingQueue,
}: RepaymentsPageClientProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [repayments, setRepayments] = useState(initialRepayments);
  const [pendingQueue, setPendingQueue] = useState(initialPendingQueue);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [allocatingId, setAllocatingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    planId: "",
    amount: "",
    paymentMethod: "BANK_TRANSFER",
    remark: "",
  });

  const [allocForm, setAllocForm] = useState({
    repaymentId: "",
    items: [{ ...EMPTY_ALLOCATION_ROW }],
  });

  async function loadAll() {
    setLoading(true);
    try {
      const [plansRes, repaymentsRes, pendingRes] = await Promise.all([
        fetch("/api/repayment-plans?status=ACTIVE"),
        fetch("/api/repayments"),
        fetch("/api/repayments/pending-confirm"),
      ]);

      const [plansData, repaymentsData, pendingData] = await Promise.all([
        plansRes.json().catch(() => ({})),
        repaymentsRes.json().catch(() => ({})),
        pendingRes.json().catch(() => ({})),
      ]);

      if (plansRes.ok) setPlans(plansData.items ?? []);
      if (repaymentsRes.ok) setRepayments(repaymentsData.items ?? []);
      if (pendingRes.ok) setPendingQueue(pendingData.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function createRepayment(event: React.FormEvent) {
    event.preventDefault();

    const response = await fetch("/api/repayments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: form.planId,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        remark: form.remark || undefined,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.error ?? "登记失败");
      return;
    }

    setForm({ planId: "", amount: "", paymentMethod: "BANK_TRANSFER", remark: "" });
    await loadAll();
  }

  async function loadSchedule(planId: string) {
    const response = await fetch(`/api/repayment-plans/${planId}/schedule`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.error ?? "加载期次失败");
      return;
    }
    setSchedule(data.items ?? []);
  }

  async function allocate(event: React.FormEvent) {
    event.preventDefault();

    const normalizedItems = allocForm.items.filter((item) => item.itemId && item.amount && Number(item.amount) > 0);
    if (!allocForm.repaymentId || normalizedItems.length === 0) {
      alert("请先选择还款单，并至少填写一条有效分配。");
      return;
    }

    setAllocatingId(allocForm.repaymentId);
    const response = await fetch(`/api/repayments/${allocForm.repaymentId}/allocate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allocations: normalizedItems.map((item) => ({
          itemId: item.itemId,
          amount: Number(item.amount),
          type: item.type,
        })),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.error ?? "分配失败");
      setAllocatingId(null);
      return;
    }

    setAllocForm({ repaymentId: "", items: [{ ...EMPTY_ALLOCATION_ROW }] });
    setSchedule([]);
    setAllocatingId(null);
    await loadAll();
  }

  async function reviewRepayment(id: string, action: "RECEIVED" | "NOT_RECEIVED") {
    const rejectReason =
      action === "NOT_RECEIVED"
        ? window.prompt("请输入未收款原因，留空则使用默认说明。") || undefined
        : undefined;

    setReviewingId(id);
    const response = await fetch(`/api/repayments/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, rejectReason }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.error ?? "处理失败");
      setReviewingId(null);
      return;
    }

    setReviewingId(null);
    await loadAll();
  }

  async function removeRepayment(item: RepaymentPrefetchItem) {
    if (!window.confirm(`确认删除还款记录“${item.repaymentNo}”吗？`)) return;
    const response = await fetch(`/api/repayments/${item.id}`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.error ?? "删除失败");
      return;
    }
    if (allocForm.repaymentId === item.id) {
      setAllocForm({ repaymentId: "", items: [{ ...EMPTY_ALLOCATION_ROW }] });
      setSchedule([]);
    }
    await loadAll();
  }

  const pendingRegister = useMemo(
    () => repayments.filter((item) => ["PENDING", "MATCHED", "MANUAL_REVIEW"].includes(item.status)),
    [repayments],
  );

  const selectedRepayment = pendingRegister.find((item) => item.id === allocForm.repaymentId) ?? null;
  const allocationDraftTotal = allocForm.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const waitingForCustomer = pendingQueue.filter((item) => item.status === "PENDING_CONFIRM");
  const waitingForReceipt = pendingQueue.filter((item) => item.status === "CUSTOMER_CONFIRMED");

  return (
    <div className="space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Repayment Desk</span>
          <h1 className="admin-page-header__title">还款管理</h1>
          <p className="admin-page-header__description">
            统一处理还款登记、期次分配、客户确认和财务到账核实，首屏直接出数据。
          </p>
        </div>
        <div className="admin-toolbar-group">
          <button onClick={() => void loadAll()} className="admin-btn admin-btn-secondary">
            刷新工作台
          </button>
        </div>
      </header>

      <section className="admin-stat-grid">
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">还款总数</p>
          <p className="admin-stat-card__value">{repayments.length}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">待分配</p>
          <p className="admin-stat-card__value text-amber-600">{pendingRegister.length}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">待客户报备</p>
          <p className="admin-stat-card__value text-blue-600">{waitingForCustomer.length}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">待确认到账</p>
          <p className="admin-stat-card__value text-emerald-600">{waitingForReceipt.length}</p>
        </div>
      </section>

      <section className="panel-soft rounded-[1.6rem] p-5">
        <div className="admin-table-toolbar -mx-5 -mt-5 mb-5 border-b border-slate-100 px-5">
          <div>
            <div className="admin-table-title">1. 登记还款</div>
            <p className="admin-table-note">录入计划、金额、支付方式和备注，形成待处理还款单。</p>
          </div>
        </div>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={createRepayment}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">选择还款计划</span>
            <select
              required
              value={form.planId}
              onChange={(event) => setForm((current) => ({ ...current, planId: event.target.value }))}
              className="admin-field text-sm"
            >
              <option value="">请选择计划</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.planNo} | {plan.application?.applicationNo ?? "-"} | {plan.application?.customer.name ?? "-"}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">还款金额</span>
            <input
              required
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              className="admin-field text-sm"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">支付方式</span>
            <select
              value={form.paymentMethod}
              onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}
              className="admin-field text-sm"
            >
              <option value="BANK_TRANSFER">银行转账</option>
              <option value="CASH">现金</option>
              <option value="ONLINE">线上支付</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">备注</span>
            <input
              value={form.remark}
              onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))}
              className="admin-field text-sm"
            />
          </label>

          <div className="md:col-span-2">
            <button className="admin-btn admin-btn-primary">登记还款</button>
          </div>
        </form>
      </section>

      <section className="panel-soft rounded-[1.6rem] p-5">
        <div className="admin-table-toolbar -mx-5 -mt-5 mb-5 border-b border-slate-100 px-5">
          <div>
            <div className="admin-table-title">2. 分配到期款</div>
            <p className="admin-table-note">支持一笔还款拆成多条分配到本金、利息、费用和罚息。</p>
          </div>
        </div>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={allocate}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">选择待分配还款单</span>
            <select
              required
              value={allocForm.repaymentId}
              onChange={(event) => {
                const repayment = pendingRegister.find((item) => item.id === event.target.value);
                setAllocForm({
                  repaymentId: event.target.value,
                  items: [
                    {
                      itemId: schedule[0]?.id ?? "",
                      amount: repayment ? String(repayment.amount) : "",
                      type: "PRINCIPAL",
                    },
                  ],
                });
                if (repayment) void loadSchedule(repayment.plan.id);
              }}
              className="admin-field text-sm"
            >
              <option value="">请选择还款单</option>
              {pendingRegister.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.repaymentNo} | {money(item.amount)} | {item.application?.applicationNo ?? "-"}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50/80 p-4 md:col-span-2">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="admin-table-title">分配明细</div>
                <p className="admin-table-note">精确拆分每一笔回款，避免账务和计划剩余金额不一致。</p>
              </div>
              <div className="text-xs font-medium text-slate-600">
                已录入 {money(allocationDraftTotal)}
                {selectedRepayment ? ` / 应分配 ${money(selectedRepayment.amount)}` : ""}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {allocForm.items.map((row, index) => (
                <div key={`${index}-${row.type}-${row.itemId}`} className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto]">
                  <select
                    required
                    value={row.itemId}
                    onChange={(event) =>
                      setAllocForm((current) => ({
                        ...current,
                        items: current.items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, itemId: event.target.value } : item,
                        ),
                      }))
                    }
                    className="admin-field text-sm"
                  >
                    <option value="">请选择期次</option>
                    {schedule.map((item) => (
                      <option key={item.id} value={item.id}>
                        第 {item.periodNumber} 期 | 剩余 {money(item.remaining)} | {new Date(item.dueDate).toLocaleDateString("zh-CN")}
                      </option>
                    ))}
                  </select>

                  <select
                    value={row.type}
                    onChange={(event) =>
                      setAllocForm((current) => ({
                        ...current,
                        items: current.items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, type: event.target.value as AllocationDraft["type"] } : item,
                        ),
                      }))
                    }
                    className="admin-field text-sm"
                  >
                    <option value="PRINCIPAL">本金</option>
                    <option value="INTEREST">利息</option>
                    <option value="FEE">费用</option>
                    <option value="PENALTY">罚息</option>
                  </select>

                  <input
                    required
                    type="number"
                    step="0.01"
                    value={row.amount}
                    onChange={(event) =>
                      setAllocForm((current) => ({
                        ...current,
                        items: current.items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, amount: event.target.value } : item,
                        ),
                      }))
                    }
                    className="admin-field text-sm"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setAllocForm((current) => ({
                        ...current,
                        items:
                          current.items.length > 1
                            ? current.items.filter((_, itemIndex) => itemIndex !== index)
                            : [{ ...EMPTY_ALLOCATION_ROW }],
                      }))
                    }
                    className="admin-btn admin-btn-ghost admin-btn-sm"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 admin-btn-group">
              <button
                type="button"
                onClick={() =>
                  setAllocForm((current) => ({
                    ...current,
                    items: [...current.items, { itemId: schedule[0]?.id ?? "", amount: "", type: "INTEREST" }],
                  }))
                }
                className="admin-btn admin-btn-secondary admin-btn-sm"
              >
                新增一行
              </button>
              {selectedRepayment ? (
                <button
                  type="button"
                  onClick={() =>
                    setAllocForm((current) => ({
                      ...current,
                      items: [
                        {
                          itemId: schedule[0]?.id ?? current.items[0]?.itemId ?? "",
                          amount: String(selectedRepayment.amount),
                          type: "PRINCIPAL",
                        },
                      ],
                    }))
                  }
                  className="admin-btn admin-btn-secondary admin-btn-sm"
                >
                  覆盖首行金额
                </button>
              ) : null}
            </div>
          </div>

          <div className="md:col-span-2">
            <button disabled={!!allocatingId} className="admin-btn admin-btn-primary">
              {allocatingId ? "分配中..." : "执行分配"}
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="table-shell admin-table-shell">
          <div className="admin-table-toolbar">
            <div>
              <div className="admin-table-title">待客户报备付款</div>
              <p className="admin-table-note">客户尚未提交付款确认，后台可先跟进提醒。</p>
            </div>
          </div>
          {loading ? (
            <div className="px-4 py-8 text-sm text-slate-500">加载中...</div>
          ) : waitingForCustomer.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-500">暂无待客户确认付款的还款。</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {waitingForCustomer.map((item) => (
                <div key={item.id} className="px-4 py-4">
                  <p className="text-sm font-medium text-slate-900">
                    {item.repaymentNo} | {money(item.amount)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.application?.applicationNo ?? "-"} | {item.application?.customer.name ?? "-"}
                  </p>
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => void removeRepayment(item)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      删除记录
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="table-shell admin-table-shell">
          <div className="admin-table-toolbar">
            <div>
              <div className="admin-table-title">待确认到账</div>
              <p className="admin-table-note">客户已确认付款，管理端需要核实是否真实到账。</p>
            </div>
          </div>
          {loading ? (
            <div className="px-4 py-8 text-sm text-slate-500">加载中...</div>
          ) : waitingForReceipt.length === 0 ? (
            <div className="px-4 py-8 text-sm text-slate-500">暂无待确认到账的还款。</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {waitingForReceipt.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {item.repaymentNo} | {money(item.amount)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.application?.applicationNo ?? "-"} | {item.application?.customer.name ?? "-"}
                    </p>
                    {item.allocations?.length ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {item.allocations.map((allocation) => `${allocation.type}:${money(allocation.amount)}`).join(" / ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="admin-btn-group">
                    <button
                      type="button"
                      onClick={() => void removeRepayment(item)}
                      className="admin-btn admin-btn-ghost admin-btn-sm text-red-600"
                    >
                      删除
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === item.id}
                      onClick={() => void reviewRepayment(item.id, "NOT_RECEIVED")}
                      className="admin-btn admin-btn-danger admin-btn-sm"
                    >
                      未收款
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === item.id}
                      onClick={() => void reviewRepayment(item.id, "RECEIVED")}
                      className="admin-btn admin-btn-success admin-btn-sm"
                    >
                      已收款
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">最近还款记录</div>
            <p className="admin-table-note">测试单可直接在这里删除未确认到账的还款记录。</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3">还款单号</th>
                <th className="px-4 py-3">客户</th>
                <th className="px-4 py-3">金额</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {repayments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">暂无还款记录</td>
                </tr>
              ) : (
                repayments.slice(0, 20).map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.repaymentNo}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.application?.customer.name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{money(item.amount)}</td>
                    <td className="px-4 py-3 text-slate-500">{item.status}</td>
                    <td className="px-4 py-3">
                      {item.status !== "CONFIRMED" ? (
                        <button
                          type="button"
                          onClick={() => void removeRepayment(item)}
                          className="text-sm font-medium text-red-600 hover:underline"
                        >
                          删除
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">已到账不可删</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
