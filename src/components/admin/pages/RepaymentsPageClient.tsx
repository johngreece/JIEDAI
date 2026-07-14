"use client";

import { formatMoney as money } from "@/lib/system-config";

import { useMemo, useRef, useState } from "react";

import { makeClientIdempotencyKey } from "@/lib/client-idempotency";
import type { RepaymentPlanPrefetchItem, RepaymentPrefetchItem } from "@/lib/admin-prefetch";
import {
  REPAYMENT_ALLOCATION_TYPE_LABELS,
  type RepaymentAllocationType,
} from "@/lib/repayment-allocation";
import {
  calculateRepaymentRegistrationOutstanding,
  OPEN_REPAYMENT_SCHEDULE_STATUSES,
} from "@/lib/repayment-registration";

type ScheduleItem = {
  id: string;
  periodNumber: number;
  dueDate: string;
  principal: number;
  interest: number;
  fee: number;
  totalDue: number;
  remaining: number;
  status: string;
};

type AllocationDraft = {
  itemId: string;
  amount: string;
  type: RepaymentAllocationType;
};

const EMPTY_ALLOCATION_ROW: AllocationDraft = {
  itemId: "",
  amount: "",
  type: "PRINCIPAL",
};

const OPEN_SCHEDULE_STATUSES = new Set<string>(OPEN_REPAYMENT_SCHEDULE_STATUSES);

function amountsMatchWithinTolerance(left: number, right: number, tolerance = 0.01) {
  return Math.abs(left - right) <= tolerance;
}

function buildSuggestedAllocations(amount: number, item?: ScheduleItem | null): AllocationDraft[] {
  if (!item || amount <= 0) return [{ ...EMPTY_ALLOCATION_ROW, amount: amount > 0 ? String(amount) : "" }];

  const rows: AllocationDraft[] = [];
  let remaining = amount;
  const addRow = (type: AllocationDraft["type"], value: number) => {
    const safeValue = Math.min(remaining, Math.max(0, value));
    if (safeValue <= 0.000001) return;
    rows.push({ itemId: item.id, type, amount: safeValue.toFixed(2) });
    remaining -= safeValue;
  };

  addRow("FEE", item.fee);
  addRow("INTEREST", item.interest);
  addRow("PRINCIPAL", item.principal);
  addRow("PENALTY", remaining);

  return rows.length > 0 ? rows : [{ ...EMPTY_ALLOCATION_ROW, itemId: item.id, amount: amount.toFixed(2) }];
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
  const [registrationSchedule, setRegistrationSchedule] = useState<ScheduleItem[]>([]);
  const [registrationSchedulePlanId, setRegistrationSchedulePlanId] = useState("");
  const [registrationScheduleLoading, setRegistrationScheduleLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allocatingId, setAllocatingId] = useState<string | null>(null);
  const allocateKeyRef = useRef<string | null>(null);
  const allocateInFlightRef = useRef(false);
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

  function clearAllocateKey() {
    allocateKeyRef.current = null;
  }

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
    const registrationAmount = Number(form.amount);
    const registrationOutstanding = calculateRepaymentRegistrationOutstanding(registrationSchedule);
    if (
      form.planId &&
      registrationSchedulePlanId === form.planId &&
      registrationAmount - registrationOutstanding > 0.01
    ) {
      alert(`登记金额不能超过当前可还余额，当前最多可登记 ${money(registrationOutstanding)}。`);
      return;
    }

    const response = await fetch("/api/repayments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": makeClientIdempotencyKey("admin-repayment-register"),
      },
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
    setRegistrationSchedule([]);
    setRegistrationSchedulePlanId("");
    await loadAll();
  }

  async function loadRegistrationSchedule(planId: string) {
    setRegistrationScheduleLoading(true);
    setRegistrationSchedulePlanId("");
    try {
      const response = await fetch(`/api/repayment-plans/${planId}/schedule`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error ?? "加载计划可还余额失败");
        setRegistrationSchedule([]);
        return;
      }
      setRegistrationSchedule(data.items ?? []);
      setRegistrationSchedulePlanId(planId);
    } finally {
      setRegistrationScheduleLoading(false);
    }
  }

  async function loadSchedule(planId: string): Promise<ScheduleItem[]> {
    const response = await fetch(`/api/repayment-plans/${planId}/schedule`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.error ?? "加载期次失败");
      return [];
    }
    const items = data.items ?? [];
    setSchedule(items);
    return items;
  }

  async function allocate(event: React.FormEvent) {
    event.preventDefault();
    if (allocateInFlightRef.current) return;

    const normalizedItems = allocForm.items.filter((item) => item.itemId && item.amount && Number(item.amount) > 0);
    if (!allocForm.repaymentId || normalizedItems.length === 0) {
      alert("请先选择还款单，并至少填写一条有效分配。");
      return;
    }
    const repaymentForAllocation = pendingRegister.find((item) => item.id === allocForm.repaymentId);
    const normalizedTotal = normalizedItems.reduce((sum, item) => sum + Number(item.amount), 0);
    if (
      repaymentForAllocation &&
      !amountsMatchWithinTolerance(normalizedTotal, repaymentForAllocation.amount)
    ) {
      alert(
        `分配总额必须等于还款单金额。当前已分配 ${money(normalizedTotal)}，还款单金额 ${money(repaymentForAllocation.amount)}。`
      );
      return;
    }

    const idempotencyKey = allocateKeyRef.current ?? makeClientIdempotencyKey("admin-repayment-allocate");
    allocateKeyRef.current = idempotencyKey;
    allocateInFlightRef.current = true;
    setAllocatingId(allocForm.repaymentId);

    try {
      const response = await fetch(`/api/repayments/${allocForm.repaymentId}/allocate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": idempotencyKey,
        },
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
        allocateKeyRef.current = null;
        alert(data.error ?? "分配失败");
        return;
      }

      allocateKeyRef.current = null;
      setAllocForm({ repaymentId: "", items: [{ ...EMPTY_ALLOCATION_ROW }] });
      setSchedule([]);
      await loadAll();
    } catch {
      alert("网络异常，请再次提交；系统会按同一次请求防止重复分配。");
    } finally {
      allocateInFlightRef.current = false;
      setAllocatingId(null);
    }
  }

  async function reviewRepayment(id: string, action: "RECEIVED" | "NOT_RECEIVED") {
    let rejectReason: string | undefined;
    if (action === "NOT_RECEIVED") {
      const input = window.prompt(
        "请输入未收款原因。确认未收款后，客户端会恢复实时计息，并补算暂停期间。留空则使用默认说明。"
      );
      if (input === null) return;
      rejectReason = input || undefined;
    }

    setReviewingId(id);
    const response = await fetch(`/api/repayments/${id}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": makeClientIdempotencyKey(`admin-repayment-confirm-${action.toLowerCase()}`),
      },
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
  const registrationOutstanding = calculateRepaymentRegistrationOutstanding(registrationSchedule);
  const registrationAmount = Number(form.amount || 0);
  const registrationScheduleReady = !!form.planId && registrationSchedulePlanId === form.planId;
  const registrationOverLimit =
    registrationScheduleReady && registrationAmount > 0 && registrationAmount - registrationOutstanding > 0.01;
  const registrationHasNoOutstanding = registrationScheduleReady && registrationOutstanding <= 0.01;
  const allocationDraftTotal = allocForm.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const allocationDifference = selectedRepayment ? allocationDraftTotal - selectedRepayment.amount : 0;
  const allocationMatchesRepayment =
    !selectedRepayment || amountsMatchWithinTolerance(allocationDraftTotal, selectedRepayment.amount);
  const allocatableSchedule = schedule.filter(
    (item) => OPEN_SCHEDULE_STATUSES.has(item.status) && item.remaining > 0.000001,
  );
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
              onChange={(event) => {
                const planId = event.target.value;
                setForm((current) => ({ ...current, planId, amount: "" }));
                setRegistrationSchedule([]);
                setRegistrationSchedulePlanId("");
                if (planId) void loadRegistrationSchedule(planId);
              }}
              className="admin-field text-sm"
            >
              <option value="">请选择计划</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.planNo} | {plan.application?.applicationNo ?? "-"} | {plan.application?.customer.name ?? "-"}
                </option>
              ))}
            </select>
            {form.planId ? (
              <span className="block text-xs text-slate-500">
                {registrationScheduleLoading
                  ? "正在读取当前可还余额..."
                  : registrationScheduleReady
                    ? `当前最多可登记 ${money(registrationOutstanding)}`
                    : "选择计划后系统会读取当前可还余额"}
              </span>
            ) : null}
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-slate-500">还款金额</span>
            <input
              required
              type="number"
              step="0.01"
              max={registrationScheduleReady ? registrationOutstanding.toFixed(2) : undefined}
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              className="admin-field text-sm"
            />
            {registrationOverLimit ? (
              <span className="block text-xs font-medium text-rose-600">
                金额超过当前可还余额，请调整到 {money(registrationOutstanding)} 以内。
              </span>
            ) : registrationHasNoOutstanding ? (
              <span className="block text-xs font-medium text-amber-600">
                该计划当前没有可登记的未还余额。
              </span>
            ) : null}
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
            <button
              disabled={
                registrationScheduleLoading ||
                registrationOverLimit ||
                registrationHasNoOutstanding ||
                (!!form.planId && !registrationScheduleReady)
              }
              className="admin-btn admin-btn-primary"
            >
              登记还款
            </button>
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
                clearAllocateKey();
                const repayment = pendingRegister.find((item) => item.id === event.target.value);
                setSchedule([]);
                setAllocForm({
                  repaymentId: event.target.value,
                  items: [
                    {
                      itemId: "",
                      amount: repayment ? String(repayment.amount) : "",
                      type: "PRINCIPAL",
                    },
                  ],
                });
                if (repayment) {
                  void loadSchedule(repayment.plan.id).then((items) => {
                    const firstOpenItem =
                      items.find((item) => OPEN_SCHEDULE_STATUSES.has(item.status) && item.remaining > 0.000001) ??
                      items[0] ??
                      null;
                    setAllocForm((current) =>
                      current.repaymentId === event.target.value
                        ? {
                            ...current,
                            items: buildSuggestedAllocations(repayment.amount, firstOpenItem),
                          }
                        : current,
                    );
                  });
                }
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
            {selectedRepayment && !allocationMatchesRepayment ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
                分配总额必须与还款单金额一致，当前差额 {money(Math.abs(allocationDifference))}。
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {allocForm.items.map((row, index) => (
                <div key={`${index}-${row.type}-${row.itemId}`} className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto]">
                  <select
                    required
                    value={row.itemId}
                    onChange={(event) => {
                      clearAllocateKey();
                      setAllocForm((current) => ({
                        ...current,
                        items: current.items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, itemId: event.target.value } : item,
                        ),
                      }));
                    }}
                    className="admin-field text-sm"
                  >
                    <option value="">请选择期次</option>
                    {allocatableSchedule.map((item) => (
                      <option key={item.id} value={item.id}>
                        第 {item.periodNumber} 期 | 剩余 {money(item.remaining)} | 本金 {money(item.principal)} | 利息 {money(item.interest)} | 费用 {money(item.fee)}
                      </option>
                    ))}
                  </select>

                  <select
                    value={row.type}
                    onChange={(event) => {
                      clearAllocateKey();
                      setAllocForm((current) => ({
                        ...current,
                        items: current.items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, type: event.target.value as AllocationDraft["type"] } : item,
                        ),
                      }));
                    }}
                    className="admin-field text-sm"
                  >
                    {Object.entries(REPAYMENT_ALLOCATION_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <input
                    required
                    type="number"
                    step="0.01"
                    value={row.amount}
                    onChange={(event) => {
                      clearAllocateKey();
                      setAllocForm((current) => ({
                        ...current,
                        items: current.items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, amount: event.target.value } : item,
                        ),
                      }));
                    }}
                    className="admin-field text-sm"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      clearAllocateKey();
                      setAllocForm((current) => ({
                        ...current,
                        items:
                          current.items.length > 1
                            ? current.items.filter((_, itemIndex) => itemIndex !== index)
                            : [{ ...EMPTY_ALLOCATION_ROW }],
                      }));
                    }}
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
                onClick={() => {
                  clearAllocateKey();
                  setAllocForm((current) => ({
                    ...current,
                    items: [...current.items, { itemId: allocatableSchedule[0]?.id ?? "", amount: "", type: "INTEREST" }],
                  }));
                }}
                className="admin-btn admin-btn-secondary admin-btn-sm"
              >
                新增一行
              </button>
              {selectedRepayment ? (
                <button
                  type="button"
                  onClick={() => {
                    clearAllocateKey();
                    setAllocForm((current) => ({
                      ...current,
                      items: buildSuggestedAllocations(selectedRepayment.amount, allocatableSchedule[0] ?? null),
                    }));
                  }}
                  className="admin-btn admin-btn-secondary admin-btn-sm"
                >
                  覆盖首行金额
                </button>
              ) : null}
            </div>
          </div>

          <div className="md:col-span-2">
            <button disabled={!!allocatingId || !allocationMatchesRepayment} className="admin-btn admin-btn-primary">
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
