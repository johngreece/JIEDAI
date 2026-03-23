"use client";

import { useEffect, useMemo, useState } from "react";

type PlanItem = {
  id: string;
  planNo: string;
  status: string;
  application: null | {
    id: string;
    applicationNo: string;
    customer: { name: string; phone: string };
    product: { name: string };
  };
};

type AllocationItem = {
  id: string;
  itemId: string;
  amount: number;
  type: string;
};

type RepaymentItem = {
  id: string;
  repaymentNo: string;
  amount: number;
  status: string;
  paymentMethod?: string;
  receivedAt?: string | null;
  plan: { id: string; planNo: string; applicationId: string };
  application: null | { applicationNo: string; customer: { name: string; phone: string } };
  allocations?: AllocationItem[];
};

type ScheduleItem = {
  id: string;
  periodNumber: number;
  dueDate: string;
  totalDue: number;
  remaining: number;
  status: string;
};

function money(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function AdminRepaymentsPage() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [repayments, setRepayments] = useState<RepaymentItem[]>([]);
  const [pendingQueue, setPendingQueue] = useState<RepaymentItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
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
    itemId: "",
    amount: "",
    type: "PRINCIPAL",
  });

  async function loadAll() {
    setLoading(true);
    try {
      const [plansRes, repsRes, pendingRes] = await Promise.all([
        fetch("/api/repayment-plans?status=ACTIVE"),
        fetch("/api/repayments"),
        fetch("/api/repayments/pending-confirm"),
      ]);

      const [plansData, repsData, pendingData] = await Promise.all([
        plansRes.json().catch(() => ({})),
        repsRes.json().catch(() => ({})),
        pendingRes.json().catch(() => ({})),
      ]);

      if (plansRes.ok) setPlans(plansData.items ?? []);
      if (repsRes.ok) setRepayments(repsData.items ?? []);
      if (pendingRes.ok) setPendingQueue(pendingData.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

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
    if (!allocForm.repaymentId || !allocForm.itemId || !allocForm.amount) {
      alert("请先选择还款单、期次并填写金额");
      return;
    }

    setAllocatingId(allocForm.repaymentId);
    const response = await fetch(`/api/repayments/${allocForm.repaymentId}/allocate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allocations: [
          {
            itemId: allocForm.itemId,
            amount: Number(allocForm.amount),
            type: allocForm.type,
          },
        ],
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.error ?? "分配失败");
      setAllocatingId(null);
      return;
    }

    setAllocForm({ repaymentId: "", itemId: "", amount: "", type: "PRINCIPAL" });
    setSchedule([]);
    setAllocatingId(null);
    await loadAll();
  }

  async function reviewRepayment(id: string, action: "RECEIVED" | "NOT_RECEIVED") {
    const rejectReason =
      action === "NOT_RECEIVED"
        ? window.prompt("请输入未收款原因，留空则使用默认文案：") || undefined
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

  const pendingRegister = useMemo(
    () => repayments.filter((item) => ["PENDING", "MATCHED", "MANUAL_REVIEW"].includes(item.status)),
    [repayments]
  );

  const waitingForCustomer = pendingQueue.filter((item) => item.status === "PENDING_CONFIRM");
  const waitingForReceipt = pendingQueue.filter((item) => item.status === "CUSTOMER_CONFIRMED");

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-bold text-slate-900">还款管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          先登记和分配，再由客户报备付款，最后由管理端确认是否真的到账。
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="stat-tile rounded-xl p-4">
          <p className="text-xs text-slate-500">还款总数</p>
          <p className="text-xl font-semibold">{repayments.length}</p>
        </div>
        <div className="stat-tile rounded-xl p-4">
          <p className="text-xs text-slate-500">待分配</p>
          <p className="text-xl font-semibold text-amber-600">{pendingRegister.length}</p>
        </div>
        <div className="stat-tile rounded-xl p-4">
          <p className="text-xs text-slate-500">待客户报备</p>
          <p className="text-xl font-semibold text-blue-600">{waitingForCustomer.length}</p>
        </div>
        <div className="stat-tile rounded-xl p-4">
          <p className="text-xs text-slate-500">待确认到账</p>
          <p className="text-xl font-semibold text-emerald-600">{waitingForReceipt.length}</p>
        </div>
      </section>

      <section className="panel-soft rounded-xl p-4">
        <h2 className="mb-3 font-semibold text-slate-900">1) 登记还款</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createRepayment}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">选择还款计划</span>
            <select
              required
              value={form.planId}
              onChange={(event) => setForm((current) => ({ ...current, planId: event.target.value }))}
              className="input-base"
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
              className="input-base"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">支付方式</span>
            <select
              value={form.paymentMethod}
              onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}
              className="input-base"
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
              className="input-base"
            />
          </label>

          <div className="md:col-span-2">
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
              登记还款
            </button>
          </div>
        </form>
      </section>

      <section className="panel-soft rounded-xl p-4">
        <h2 className="mb-3 font-semibold text-slate-900">2) 分配到期次</h2>
        <p className="mb-3 text-sm text-slate-500">
          分配阶段只锁定本金/利息/费用结构，不会提前停止计息，也不会提前结清计划。
        </p>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={allocate}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">选择待分配还款单</span>
            <select
              required
              value={allocForm.repaymentId}
              onChange={(event) => {
                const repayment = pendingRegister.find((item) => item.id === event.target.value);
                setAllocForm((current) => ({
                  ...current,
                  repaymentId: event.target.value,
                  amount: repayment ? String(repayment.amount) : current.amount,
                }));
                if (repayment) {
                  void loadSchedule(repayment.plan.id);
                }
              }}
              className="input-base"
            >
              <option value="">请选择还款单</option>
              {pendingRegister.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.repaymentNo} | {money(item.amount)} | {item.application?.applicationNo ?? "-"}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">选择期次</span>
            <select
              required
              value={allocForm.itemId}
              onChange={(event) => setAllocForm((current) => ({ ...current, itemId: event.target.value }))}
              className="input-base"
            >
              <option value="">请选择期次</option>
              {schedule.map((item) => (
                <option key={item.id} value={item.id}>
                  第{item.periodNumber}期 | 剩余 {money(item.remaining)} | {new Date(item.dueDate).toLocaleDateString("zh-CN")}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">分配类型</span>
            <select
              value={allocForm.type}
              onChange={(event) => setAllocForm((current) => ({ ...current, type: event.target.value }))}
              className="input-base"
            >
              <option value="PRINCIPAL">本金</option>
              <option value="INTEREST">利息</option>
              <option value="FEE">费用</option>
              <option value="PENALTY">罚息</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">分配金额</span>
            <input
              required
              type="number"
              step="0.01"
              value={allocForm.amount}
              onChange={(event) => setAllocForm((current) => ({ ...current, amount: event.target.value }))}
              className="input-base"
            />
          </label>

          <div className="md:col-span-2">
            <button
              disabled={!!allocatingId}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {allocatingId ? "分配中..." : "执行分配"}
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="table-shell overflow-hidden rounded-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-900">待客户报备付款</h2>
          </div>
          {loading ? (
            <div className="px-4 py-6 text-sm text-slate-500">加载中...</div>
          ) : waitingForCustomer.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">暂无待客户确认付款的还款。</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {waitingForCustomer.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-900">
                    {item.repaymentNo} | {money(item.amount)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.application?.applicationNo ?? "-"} | {item.application?.customer.name ?? "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="table-shell overflow-hidden rounded-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-900">待确认到账</h2>
          </div>
          {loading ? (
            <div className="px-4 py-6 text-sm text-slate-500">加载中...</div>
          ) : waitingForReceipt.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500">暂无待确认到账的还款。</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {waitingForReceipt.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {item.repaymentNo} | {money(item.amount)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.application?.applicationNo ?? "-"} | {item.application?.customer.name ?? "-"}
                    </p>
                    {item.allocations?.length ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {item.allocations
                          .map((allocation) => `${allocation.type}:${money(allocation.amount)}`)
                          .join(" / ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={reviewingId === item.id}
                      onClick={() => void reviewRepayment(item.id, "NOT_RECEIVED")}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      未收款
                    </button>
                    <button
                      type="button"
                      disabled={reviewingId === item.id}
                      onClick={() => void reviewRepayment(item.id, "RECEIVED")}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
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
    </div>
  );
}
