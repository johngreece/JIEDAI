"use client";

import { useEffect, useMemo, useState } from "react";

type PlanItem = {
  id: string;
  planNo: string;
  status: string;
  application: null | { id: string; applicationNo: string; customer: { name: string; phone: string }; product: { name: string } };
};

type RepaymentItem = {
  id: string;
  repaymentNo: string;
  amount: number;
  status: string;
  paymentMethod: string;
  plan: { id: string; planNo: string; applicationId: string };
  application: null | { applicationNo: string; customer: { name: string; phone: string } };
};

type ScheduleItem = {
  id: string;
  periodNumber: number;
  dueDate: string;
  totalDue: number;
  remaining: number;
  status: string;
};

export default function AdminRepaymentsPage() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [repayments, setRepayments] = useState<RepaymentItem[]>([]);
  const [pendingQueue, setPendingQueue] = useState<RepaymentItem[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [allocatingId, setAllocatingId] = useState<string | null>(null);

  const [form, setForm] = useState({ planId: "", amount: "", paymentMethod: "BANK_TRANSFER", remark: "" });
  const [allocForm, setAllocForm] = useState({ repaymentId: "", itemId: "", amount: "", type: "PRINCIPAL" });

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
    loadAll();
  }, []);

  async function createRepayment(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/repayments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: form.planId,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        remark: form.remark || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "登记失败");
      return;
    }
    setForm({ planId: "", amount: "", paymentMethod: "BANK_TRANSFER", remark: "" });
    await loadAll();
  }

  async function loadSchedule(planId: string) {
    const res = await fetch(`/api/repayment-plans/${planId}/schedule`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "加载期次失败");
      return;
    }
    setSchedule(data.items ?? []);
  }

  async function allocate(e: React.FormEvent) {
    e.preventDefault();
    if (!allocForm.repaymentId || !allocForm.itemId || !allocForm.amount) {
      alert("请先选择还款单、期次并填写金额");
      return;
    }
    setAllocatingId(allocForm.repaymentId);
    const res = await fetch(`/api/repayments/${allocForm.repaymentId}/allocate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allocations: [{
          itemId: allocForm.itemId,
          amount: Number(allocForm.amount),
          type: allocForm.type,
        }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "分配失败");
      setAllocatingId(null);
      return;
    }
    setAllocForm({ repaymentId: "", itemId: "", amount: "", type: "PRINCIPAL" });
    setSchedule([]);
    setAllocatingId(null);
    await loadAll();
  }

  const pendingRegister = useMemo(
    () => repayments.filter((x) => x.status === "PENDING" || x.status === "MATCHED"),
    [repayments]
  );

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-bold text-slate-900">还款管理</h1>
        <p className="mt-1 text-sm text-slate-600">登记还款、分配到期次、进入待客户确认队列</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">还款总数</p><p className="text-xl font-semibold">{repayments.length}</p></div>
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">待分配</p><p className="text-xl font-semibold text-amber-600">{pendingRegister.length}</p></div>
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">待客户确认</p><p className="text-xl font-semibold text-blue-600">{pendingQueue.length}</p></div>
        <div className="stat-tile rounded-xl p-4"><p className="text-xs text-slate-500">已确认</p><p className="text-xl font-semibold text-emerald-600">{repayments.filter((x) => x.status === "CONFIRMED").length}</p></div>
      </section>

      <section className="panel-soft rounded-xl p-4">
        <h2 className="font-semibold text-slate-900 mb-3">1) 登记还款</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={createRepayment}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">选择还款计划</span>
            <select required value={form.planId} onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))} className="input-base">
              <option value="">请选择计划</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.planNo} · {p.application?.applicationNo ?? "-"} · {p.application?.customer.name ?? "-"}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">还款金额</span>
            <input required type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="input-base" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">支付方式</span>
            <select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} className="input-base">
              <option value="BANK_TRANSFER">银行转账</option>
              <option value="CASH">现金</option>
              <option value="ONLINE">线上支付</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">备注</span>
            <input value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} className="input-base" />
          </label>
          <div className="md:col-span-2">
            <button className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800">登记还款</button>
          </div>
        </form>
      </section>

      <section className="panel-soft rounded-xl p-4">
        <h2 className="font-semibold text-slate-900 mb-3">2) 分配到期次（将状态推入待客户确认）</h2>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={allocate}>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">选择待分配还款单</span>
            <select
              required
              value={allocForm.repaymentId}
              onChange={(e) => {
                const r = pendingRegister.find((x) => x.id === e.target.value);
                setAllocForm((f) => ({ ...f, repaymentId: e.target.value, amount: r ? String(r.amount) : f.amount }));
                if (r) loadSchedule(r.plan.id);
              }}
              className="input-base"
            >
              <option value="">请选择还款单</option>
              {pendingRegister.map((r) => (
                <option key={r.id} value={r.id}>{r.repaymentNo} · €{r.amount.toFixed(2)} · {r.application?.applicationNo ?? "-"}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">选择期次</span>
            <select required value={allocForm.itemId} onChange={(e) => setAllocForm((f) => ({ ...f, itemId: e.target.value }))} className="input-base">
              <option value="">请选择期次</option>
              {schedule.map((s) => (
                <option key={s.id} value={s.id}>第{s.periodNumber}期 · 剩余€{s.remaining.toFixed(2)} · {new Date(s.dueDate).toLocaleDateString()}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">分配类型</span>
            <select value={allocForm.type} onChange={(e) => setAllocForm((f) => ({ ...f, type: e.target.value }))} className="input-base">
              <option value="PRINCIPAL">本金</option>
              <option value="INTEREST">利息</option>
              <option value="FEE">费用</option>
              <option value="PENALTY">罚息</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-500">分配金额</span>
            <input required type="number" step="0.01" value={allocForm.amount} onChange={(e) => setAllocForm((f) => ({ ...f, amount: e.target.value }))} className="input-base" />
          </label>
          <div className="md:col-span-2">
            <button disabled={!!allocatingId} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50">
              {allocatingId ? "分配中..." : "执行分配"}
            </button>
          </div>
        </form>
      </section>

      <section className="table-shell overflow-hidden rounded-xl">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">待客户确认队列</h2>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-sm text-slate-500">加载中...</div>
        ) : pendingQueue.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">暂无待客户确认还款</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingQueue.map((x) => (
              <div key={x.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{x.repaymentNo} · € {x.amount.toFixed(2)}</p>
                  <p className="text-xs text-slate-500 mt-1">{x.application?.applicationNo ?? "-"} · {x.application?.customer.name ?? "-"}</p>
                </div>
                <span className="inline-flex rounded-full border px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border-blue-200">待客户确认</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
