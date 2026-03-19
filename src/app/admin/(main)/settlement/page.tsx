"use client";

import { useEffect, useState, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type D = Record<string, any>;

const API = "/api/settlement";

function fmt(v: any) {
  const n = Number(v || 0);
  return n >= 10000 ? n .toLocaleString() : n.toFixed(2);
}

export default function SettlementPage() {
  const [tab, setTab] = useState<"summary" | "daily" | "customer" | "funder" | "profit">("summary");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 时间范围
  const now = new Date();
  const [startStr, setStartStr] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  );
  const [endStr, setEndStr] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = tab === "profit"
        ? `${API}?type=profit`
        : `${API}?type=${tab}&start=${startStr}&end=${endStr}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tab, startStr, endStr]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tabs = [
    { key: "summary", label: "结算总览" },
    { key: "daily", label: "每日明细" },
    { key: "customer", label: "客户对账" },
    { key: "funder", label: "资金方分润" },
    { key: "profit", label: "利润最大化" },
  ] as const;

  // 快捷时间范围
  const setRange = (days: number | "month" | "all") => {
    const today = new Date();
    if (days === "all") {
      setStartStr("2020-01-01");
      setEndStr(new Date(today.getFullYear() + 1, 0, 1).toISOString().slice(0, 10));
    } else if (days === "month") {
      setStartStr(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10));
      setEndStr(new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10));
    } else {
      const s = new Date(today);
      s.setDate(s.getDate() - days);
      setStartStr(s.toISOString().slice(0, 10));
      setEndStr(today.toISOString().slice(0, 10));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="panel-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">财务结算中心</h1>
          <p className="mt-1 text-sm text-slate-600">全面的财务分析、结算报表与利润优化</p>
        </div>
      </header>

      {/* Tab + 时间筛选 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "profit" && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="input-base rounded-lg px-2 py-1" />
            <span className="text-slate-400">至</span>
            <input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="input-base rounded-lg px-2 py-1" />
            <button onClick={() => setRange(7)} className="btn-soft px-2 py-1 rounded-lg text-xs">7天</button>
            <button onClick={() => setRange(30)} className="btn-soft px-2 py-1 rounded-lg text-xs">30天</button>
            <button onClick={() => setRange("month")} className="btn-soft px-2 py-1 rounded-lg text-xs">本月</button>
            <button onClick={() => setRange("all")} className="btn-soft px-2 py-1 rounded-lg text-xs">全部</button>
          </div>
        )}
      </div>

      {/* Content */}
      {loading && <div className="text-center py-12 text-slate-400 animate-pulse">加载中...</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {!loading && !error && data && (
        <>
          {tab === "summary" && <SummaryView data={data} />}
          {tab === "daily" && <DailyView data={data} />}
          {tab === "customer" && <CustomerView data={data} />}
          {tab === "funder" && <FunderView data={data} />}
          {tab === "profit" && <ProfitView data={data} />}
        </>
      )}
    </div>
  );
}

/* ═══════ 结算总览 ═══════ */
function SummaryView({ data }: { data: D }) {
  const sections = [
    {
      title: "放款",
      icon: "💰",
      items: [
        { label: "放款笔数", value: data.disbursedCount },
        { label: "放款总额", value: `€${fmt(data.disbursedAmount)}` },
        { label: "砍头费收入", value: `€${fmt(data.disbursedFee)}`, accent: true },
        { label: "实际出借", value: `€${fmt(data.disbursedNet)}` },
      ],
    },
    {
      title: "还款",
      icon: "📥",
      items: [
        { label: "还款笔数", value: data.repaidCount },
        { label: "还款总额", value: `€${fmt(data.repaidAmount)}` },
        { label: "回收本金", value: `€${fmt(data.repaidPrincipal)}` },
        { label: "利息收入", value: `€${fmt(data.repaidInterest)}`, accent: true },
        { label: "费用收入", value: `€${fmt(data.repaidFee)}`, accent: true },
        { label: "罚息收入", value: `€${fmt(data.repaidPenalty)}`, accent: true },
      ],
    },
    {
      title: "利润分析",
      icon: "📊",
      items: [
        { label: "总收入", value: `€${fmt(data.totalIncome)}`, accent: true },
        { label: "总出借", value: `€${fmt(data.totalOutflow)}` },
        { label: "本金回收", value: `€${fmt(data.capitalRecovery)}` },
        { label: "净利润", value: `€${fmt(data.netProfit)}`, accent: true },
        { label: "毛利率", value: data.grossROI },
        { label: "净利率", value: data.netROI },
      ],
    },
    {
      title: "逾期 & 资金",
      icon: "⚠️",
      items: [
        { label: "逾期笔数", value: data.overdueCount },
        { label: "逾期金额", value: `€${fmt(data.overdueAmount)}` },
        { label: "逾期罚息", value: `€${fmt(data.overduePenalty)}` },
        { label: "资金方余额", value: `€${fmt(data.funderBalance)}` },
        { label: "资金方利润", value: `€${fmt(data.funderProfit)}` },
      ],
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sections.map((sec) => (
        <div key={sec.title} className="stat-tile rounded-xl p-5">
          <div className="text-sm font-semibold text-slate-700 mb-3">
            <span className="mr-2">{sec.icon}</span>{sec.title}
          </div>
          <div className="space-y-1.5">
            {sec.items.map((it) => (
              <div key={it.label} className="flex justify-between text-sm">
                <span className="text-slate-500">{it.label}</span>
                <span className={it.accent ? "text-emerald-600 font-semibold" : "text-slate-800 font-medium"}>
                  {it.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 台账校验 */}
      <div className="stat-tile rounded-xl p-5 lg:col-span-2">
        <div className="text-sm font-semibold text-slate-700 mb-2">🔍 台账校验</div>
        <div className="flex gap-8 text-sm">
          <div><span className="text-slate-500">DEBIT 合计(入):</span> <span className="font-medium text-slate-800">€{fmt(data.ledgerDebitTotal)}</span></div>
          <div><span className="text-slate-500">CREDIT 合计(出):</span> <span className="font-medium text-slate-800">€{fmt(data.ledgerCreditTotal)}</span></div>
          <div><span className="text-slate-500">差额:</span>
            <span className="font-medium text-slate-800">
              €{fmt(Math.abs(Number(data.ledgerDebitTotal) - Number(data.ledgerCreditTotal)))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════ 每日明细 ═══════ */
function DailyView({ data }: { data: any[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-center text-slate-400 py-8">该时间段无数据</div>;
  }

  return (
    <div className="table-shell rounded-xl overflow-hidden">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <th className="px-4 py-3">日期</th>
            <th className="px-4 py-3 text-right">放款额</th>
            <th className="px-4 py-3 text-right">砍头费</th>
            <th className="px-4 py-3 text-right">还款额</th>
            <th className="px-4 py-3 text-right">利润(息+费+罚)</th>
            <th className="px-4 py-3 text-right">净现金流</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row: any) => (
            <tr key={row.date} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-medium text-slate-700">{row.date}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">€{fmt(row.disbursedAmount)}</td>
              <td className="px-4 py-2.5 text-right text-emerald-600">€{fmt(row.disbursedFee)}</td>
              <td className="px-4 py-2.5 text-right text-blue-600">€{fmt(row.repaidAmount)}</td>
              <td className="px-4 py-2.5 text-right text-emerald-600 font-medium">€{fmt(row.repaidProfit)}</td>
              <td className={`px-4 py-2.5 text-right font-medium ${row.netCashflow >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {row.netCashflow >= 0 ? "+" : ""}€{fmt(row.netCashflow)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 font-semibold text-sm">
            <td className="px-4 py-2.5 text-slate-700">合计</td>
            <td className="px-4 py-2.5 text-right">€{fmt(data.reduce((s: number, r: any) => s + r.disbursedAmount, 0))}</td>
            <td className="px-4 py-2.5 text-right text-emerald-600">€{fmt(data.reduce((s: number, r: any) => s + r.disbursedFee, 0))}</td>
            <td className="px-4 py-2.5 text-right text-blue-600">€{fmt(data.reduce((s: number, r: any) => s + r.repaidAmount, 0))}</td>
            <td className="px-4 py-2.5 text-right text-emerald-600">€{fmt(data.reduce((s: number, r: any) => s + r.repaidProfit, 0))}</td>
            <td className="px-4 py-2.5 text-right">€{fmt(data.reduce((s: number, r: any) => s + r.netCashflow, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ═══════ 客户对账 ═══════ */
function CustomerView({ data }: { data: any[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-center text-slate-400 py-8">该时间段无客户业务</div>;
  }

  return (
    <div className="table-shell rounded-xl overflow-hidden">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <th className="px-4 py-3">客户</th>
            <th className="px-4 py-3">手机号</th>
            <th className="px-4 py-3 text-right">借款笔数</th>
            <th className="px-4 py-3 text-right">总借款</th>
            <th className="px-4 py-3 text-right">总还款</th>
            <th className="px-4 py-3 text-right">欠款余额</th>
            <th className="px-4 py-3 text-right">贡献利润</th>
            <th className="px-4 py-3">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((c: any) => (
            <tr key={c.customerId} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-medium text-slate-700">{c.customerName}</td>
              <td className="px-4 py-2.5 text-slate-500">{c.phone}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">{c.loanCount}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">€{fmt(c.totalBorrowed)}</td>
              <td className="px-4 py-2.5 text-right text-blue-600">€{fmt(c.totalRepaid)}</td>
              <td className="px-4 py-2.5 text-right text-slate-800 font-medium">€{fmt(c.outstandingBalance)}</td>
              <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold">€{fmt(c.profitFromCustomer)}</td>
              <td className="px-4 py-2.5">
                {c.isOverdue ? (
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">逾期</span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">正常</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
        共 {data.length} 位客户 · 总利润贡献 €{fmt(data.reduce((s: number, c: any) => s + c.profitFromCustomer, 0))}
      </div>
    </div>
  );
}

/* ═══════ 资金方分润 ═══════ */
function FunderView({ data }: { data: any[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="text-center text-slate-400 py-8">无活跃资金方</div>;
  }
  return (
    <div className="space-y-4">
      {data.map((f: any) => (
        <div key={f.funderId} className="stat-tile rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-sm font-semibold text-slate-800">{f.funderName}</span>
              <span className="ml-2 text-xs text-slate-400">联系人: {f.contactPerson}</span>
            </div>
            <div>
              {f.existingSettlement ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {f.existingSettlement.status === "SETTLED" ? "已结算" : "待结算"}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500">未生成</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-slate-400 text-xs">账户余额</span>
              <div className="text-slate-800 font-medium">€{fmt(f.totalBalance)}</div>
            </div>
            <div>
              <span className="text-slate-400 text-xs">累计入金</span>
              <div className="text-slate-800 font-medium">€{fmt(f.totalInflow)}</div>
            </div>
            <div>
              <span className="text-slate-400 text-xs">分润比例</span>
              <div className="text-blue-600 font-medium">{f.shareRatio}</div>
            </div>
            <div>
              <span className="text-slate-400 text-xs">应分利润</span>
              <div className="text-emerald-600 font-semibold">€{fmt(f.shareAmount)}</div>
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            期间总利息收入: €{fmt(f.periodTotalInterest)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════ 利润最大化分析 ═══════ */
function ProfitView({ data }: { data: D }) {
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* 核心利润指标 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="总放款笔数" value={data.totalLoans} />
        <MetricCard label="实际出借资金" value={`€${fmt(data.totalCapitalDeployed)}`} />
        <MetricCard label="总收入" value={`€${fmt(data.totalRevenue)}`} accent />
        <MetricCard label="净利润" value={`€${fmt(data.netProfit)}`} accent />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="综合 ROI" value={data.overallROI} accent />
        <MetricCard label="本金回收" value={`€${fmt(data.totalPrincipalRecovered)}`} />
        <MetricCard label="资金缺口(未回收)" value={`€${fmt(Number(data.totalCapitalDeployed) - Number(data.totalPrincipalRecovered))}`}
          danger={Number(data.totalCapitalDeployed) > Number(data.totalPrincipalRecovered)} />
      </div>

      {/* 还款速度分析 */}
      <div className="stat-tile rounded-xl p-5">
        <div className="text-sm font-semibold text-slate-700 mb-3">⏱️ 还款速度分析</div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center p-3 bg-emerald-50 rounded-lg">
            <div className="text-2xl font-bold text-emerald-600">{data.repaymentSpeed?.fastRepay?.count || 0}</div>
            <div className="text-xs text-slate-500 mt-1">24h内还款</div>
            <div className="text-xs text-emerald-600 font-medium">收入 €{fmt(data.repaymentSpeed?.fastRepay?.revenue)}</div>
          </div>
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <div className="text-2xl font-bold text-amber-600">{data.repaymentSpeed?.slowRepay?.count || 0}</div>
            <div className="text-xs text-slate-500 mt-1">24h后还款</div>
            <div className="text-xs text-amber-600 font-medium">收入 €{fmt(data.repaymentSpeed?.slowRepay?.revenue)}</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{data.repaymentSpeed?.noRepay?.count || 0}</div>
            <div className="text-xs text-slate-500 mt-1">未还款</div>
            <div className="text-xs text-red-500 font-medium">潜在损失</div>
          </div>
        </div>
      </div>

      {/* 利益最大化策略 */}
      <div className="stat-tile rounded-xl p-5">
        <div className="text-sm font-semibold text-slate-700 mb-3">🎯 利益最大化策略</div>
        <ul className="space-y-2.5">
          {(data.strategies || []).map((s: string, i: number) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="flex-shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                {i + 1}
              </span>
              <span className="text-slate-700">{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent, danger }: { label: string; value: string | number; accent?: boolean; danger?: boolean }) {
  return (
    <div className="stat-tile rounded-xl p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold mt-1 ${danger ? "text-red-600" : accent ? "text-emerald-600" : "text-slate-800"}`}>
        {value}
      </div>
    </div>
  );
}
