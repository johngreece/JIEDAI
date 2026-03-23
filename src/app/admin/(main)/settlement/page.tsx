"use client";

import { useCallback, useEffect, useState } from "react";

type JsonRecord = Record<string, any>;

const API = "/api/settlement";

function formatMoney(value: unknown) {
  const num = Number(value || 0);
  return `€${num >= 10000 ? num.toLocaleString() : num.toFixed(2)}`;
}

export default function SettlementPage() {
  const [tab, setTab] = useState<"summary" | "daily" | "customer" | "funder" | "profit">("summary");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const now = new Date();
  const [startStr, setStartStr] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
  );
  const [endStr, setEndStr] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10),
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const url = tab === "profit"
        ? `${API}?type=profit`
        : `${API}?type=${tab}&start=${startStr}&end=${endStr}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(await response.text());
      }

      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [tab, startStr, endStr]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const setRange = (days: number | "month" | "all") => {
    const today = new Date();

    if (days === "all") {
      setStartStr("2020-01-01");
      setEndStr(new Date(today.getFullYear() + 1, 0, 1).toISOString().slice(0, 10));
      return;
    }

    if (days === "month") {
      setStartStr(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10));
      setEndStr(new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10));
      return;
    }

    const start = new Date(today);
    start.setDate(start.getDate() - days);
    setStartStr(start.toISOString().slice(0, 10));
    setEndStr(today.toISOString().slice(0, 10));
  };

  const tabs = [
    { key: "summary", label: "结算总览" },
    { key: "daily", label: "每日明细" },
    { key: "customer", label: "客户对账" },
    { key: "funder", label: "资金方分润" },
    { key: "profit", label: "利润分析" },
  ] as const;

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">财务结算中心</h1>
        <p className="mt-1 text-sm text-slate-600">把经营利润、现金回笼和在贷余额分开展示，方便真正入财务账。</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === item.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab !== "profit" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="date"
              value={startStr}
              onChange={(event) => setStartStr(event.target.value)}
              className="input-base rounded-lg px-2 py-1"
            />
            <span className="text-slate-400">至</span>
            <input
              type="date"
              value={endStr}
              onChange={(event) => setEndStr(event.target.value)}
              className="input-base rounded-lg px-2 py-1"
            />
            <button type="button" onClick={() => setRange(7)} className="btn-soft rounded-lg px-2 py-1 text-xs">7天</button>
            <button type="button" onClick={() => setRange(30)} className="btn-soft rounded-lg px-2 py-1 text-xs">30天</button>
            <button type="button" onClick={() => setRange("month")} className="btn-soft rounded-lg px-2 py-1 text-xs">本月</button>
            <button type="button" onClick={() => setRange("all")} className="btn-soft rounded-lg px-2 py-1 text-xs">全部</button>
          </div>
        ) : null}
      </div>

      {loading ? <div className="py-12 text-center text-slate-400">加载中...</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {!loading && !error && data ? (
        <>
          {tab === "summary" ? <SummaryView data={data} /> : null}
          {tab === "daily" ? <DailyView data={data} /> : null}
          {tab === "customer" ? <CustomerView data={data} /> : null}
          {tab === "funder" ? <FunderView data={data} /> : null}
          {tab === "profit" ? <ProfitView data={data} /> : null}
        </>
      ) : null}
    </div>
  );
}

function SummaryView({ data }: { data: JsonRecord }) {
  const cards = [
    {
      title: "放款与回款",
      items: [
        { label: "放款笔数", value: data.disbursedCount },
        { label: "放款总额", value: formatMoney(data.disbursedAmount) },
        { label: "实际出借净额", value: formatMoney(data.disbursedNet) },
        { label: "回款总额", value: formatMoney(data.repaidAmount) },
        { label: "登记回收本金", value: formatMoney(data.capitalRecovery) },
        { label: "当前在贷余额", value: formatMoney(data.currentOutstandingBalance), accent: true },
      ],
    },
    {
      title: "经营收入",
      items: [
        { label: "前置费用", value: formatMoney(data.disbursedFee), accent: true },
        { label: "利息收入", value: formatMoney(data.repaidInterest), accent: true },
        { label: "附加费用", value: formatMoney(data.repaidFee), accent: true },
        { label: "逾期罚息", value: formatMoney(data.repaidPenalty), accent: true },
        { label: "经营利润", value: formatMoney(data.netProfit), accent: true },
        { label: "经营收益率", value: data.grossROI },
      ],
    },
    {
      title: "资金占用",
      items: [
        { label: "期间现金流", value: formatMoney(data.periodNetCashflow), accent: Number(data.periodNetCashflow) >= 0 },
        { label: "新增本金占用", value: formatMoney(data.capitalOccupancy) },
        { label: "释放本金", value: formatMoney(data.capitalReleased) },
        { label: "期间放款净额", value: formatMoney(data.totalOutflow) },
        { label: "期间经营收入", value: formatMoney(data.totalIncome), accent: true },
        { label: "净利率", value: data.netROI },
      ],
    },
    {
      title: "风险与资金方",
      items: [
        { label: "逾期笔数", value: data.overdueCount },
        { label: "逾期金额", value: formatMoney(data.overdueAmount) },
        { label: "逾期罚息", value: formatMoney(data.overduePenalty) },
        { label: "资金方余额", value: formatMoney(data.funderBalance) },
        { label: "资金方累计利润", value: formatMoney(data.funderProfit), accent: true },
      ],
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {cards.map((card) => (
        <div key={card.title} className="stat-tile rounded-xl p-5">
          <div className="mb-3 text-sm font-semibold text-slate-700">{card.title}</div>
          <div className="space-y-2">
            {card.items.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">{item.label}</span>
                <span className={item.accent ? "font-semibold text-emerald-600" : "font-medium text-slate-800"}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="stat-tile rounded-xl p-5 lg:col-span-2">
        <div className="mb-3 text-sm font-semibold text-slate-700">台账校验</div>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <LedgerBox label="DEBIT 合计" value={formatMoney(data.ledgerDebitTotal)} />
          <LedgerBox label="CREDIT 合计" value={formatMoney(data.ledgerCreditTotal)} />
          <LedgerBox
            label="差额"
            value={formatMoney(Math.abs(Number(data.ledgerDebitTotal) - Number(data.ledgerCreditTotal)))}
          />
        </div>
      </div>
    </div>
  );
}

function DailyView({ data }: { data: any[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="py-8 text-center text-slate-400">该时间段暂无数据</div>;
  }

  return (
    <div className="table-shell overflow-hidden rounded-xl">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <th className="px-4 py-3">日期</th>
            <th className="px-4 py-3 text-right">放款额</th>
            <th className="px-4 py-3 text-right">前置费用</th>
            <th className="px-4 py-3 text-right">回款额</th>
            <th className="px-4 py-3 text-right">当日收入</th>
            <th className="px-4 py-3 text-right">净现金流</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row) => (
            <tr key={row.date} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-medium text-slate-700">{row.date}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">{formatMoney(row.disbursedAmount)}</td>
              <td className="px-4 py-2.5 text-right text-emerald-600">{formatMoney(row.disbursedFee)}</td>
              <td className="px-4 py-2.5 text-right text-blue-600">{formatMoney(row.repaidAmount)}</td>
              <td className="px-4 py-2.5 text-right font-medium text-emerald-600">{formatMoney(row.repaidProfit)}</td>
              <td className={`px-4 py-2.5 text-right font-medium ${row.netCashflow >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {row.netCashflow >= 0 ? "+" : ""}
                {formatMoney(row.netCashflow)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 text-sm font-semibold">
            <td className="px-4 py-2.5 text-slate-700">合计</td>
            <td className="px-4 py-2.5 text-right">{formatMoney(sumBy(data, "disbursedAmount"))}</td>
            <td className="px-4 py-2.5 text-right text-emerald-600">{formatMoney(sumBy(data, "disbursedFee"))}</td>
            <td className="px-4 py-2.5 text-right text-blue-600">{formatMoney(sumBy(data, "repaidAmount"))}</td>
            <td className="px-4 py-2.5 text-right text-emerald-600">{formatMoney(sumBy(data, "repaidProfit"))}</td>
            <td className="px-4 py-2.5 text-right">{formatMoney(sumBy(data, "netCashflow"))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CustomerView({ data }: { data: any[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="py-8 text-center text-slate-400">该时间段暂无客户业务</div>;
  }

  return (
    <div className="table-shell overflow-hidden rounded-xl">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <th className="px-4 py-3">客户</th>
            <th className="px-4 py-3">手机号</th>
            <th className="px-4 py-3 text-right">借款笔数</th>
            <th className="px-4 py-3 text-right">累计借款</th>
            <th className="px-4 py-3 text-right">累计回款</th>
            <th className="px-4 py-3 text-right">客户余额</th>
            <th className="px-4 py-3 text-right">利润贡献</th>
            <th className="px-4 py-3">状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((item) => (
            <tr key={item.customerId} className="hover:bg-slate-50">
              <td className="px-4 py-2.5 font-medium text-slate-700">{item.customerName}</td>
              <td className="px-4 py-2.5 text-slate-500">{item.phone}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">{item.loanCount}</td>
              <td className="px-4 py-2.5 text-right text-slate-600">{formatMoney(item.totalBorrowed)}</td>
              <td className="px-4 py-2.5 text-right text-blue-600">{formatMoney(item.totalRepaid)}</td>
              <td className="px-4 py-2.5 text-right font-medium text-slate-800">{formatMoney(item.outstandingBalance)}</td>
              <td className="px-4 py-2.5 text-right font-semibold text-emerald-600">{formatMoney(item.profitFromCustomer)}</td>
              <td className="px-4 py-2.5">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.isOverdue ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {item.isOverdue ? "逾期" : "正常"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        共 {data.length} 位客户，合计利润贡献 {formatMoney(sumBy(data, "profitFromCustomer"))}
      </div>
    </div>
  );
}

function FunderView({ data }: { data: any[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="py-8 text-center text-slate-400">暂无活跃资金方</div>;
  }

  return (
    <div className="space-y-4">
      {data.map((item) => (
        <div key={item.funderId} className="stat-tile rounded-xl p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">{item.funderName}</div>
              <div className="text-xs text-slate-400">联系人 {item.contactPerson || "-"}</div>
            </div>
            <span className="inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
              {item.existingSettlement?.status === "SETTLED" ? "已结算" : item.existingSettlement ? "待结算" : "未生成"}
            </span>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <MiniMetric label="账户余额" value={formatMoney(item.totalBalance)} />
            <MiniMetric label="累计入金" value={formatMoney(item.totalInflow)} />
            <MiniMetric label="分润比例" value={item.shareRatio} accent />
            <MiniMetric label="应分利润" value={formatMoney(item.shareAmount)} accent />
          </div>

          <div className="mt-3 text-xs text-slate-500">期间可分收入 {formatMoney(item.periodTotalInterest)}</div>
        </div>
      ))}
    </div>
  );
}

function ProfitView({ data }: { data: JsonRecord }) {
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="总放款笔数" value={data.totalLoans} />
        <MetricCard label="累计出借净额" value={formatMoney(data.totalCapitalDeployed)} />
        <MetricCard label="累计经营收入" value={formatMoney(data.totalRevenue)} accent />
        <MetricCard label="累计经营利润" value={formatMoney(data.netProfit)} accent />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="综合 ROI" value={data.overallROI} accent />
        <MetricCard label="登记回收本金" value={formatMoney(data.totalPrincipalRecovered)} />
        <MetricCard
          label="当前在贷余额"
          value={formatMoney(data.currentOutstandingBalance)}
          danger={Number(data.currentOutstandingBalance) > 0}
        />
      </div>

      <div className="stat-tile rounded-xl p-5">
        <div className="mb-3 text-sm font-semibold text-slate-700">回款速度分析</div>
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <SpeedCard
            label="24 小时内回款"
            count={data.repaymentSpeed?.fastRepay?.count || 0}
            revenue={formatMoney(data.repaymentSpeed?.fastRepay?.revenue)}
            tone="emerald"
          />
          <SpeedCard
            label="24 小时后回款"
            count={data.repaymentSpeed?.slowRepay?.count || 0}
            revenue={formatMoney(data.repaymentSpeed?.slowRepay?.revenue)}
            tone="amber"
          />
          <SpeedCard
            label="未形成回款"
            count={data.repaymentSpeed?.noRepay?.count || 0}
            revenue="持续跟进"
            tone="red"
          />
        </div>
      </div>

      <div className="stat-tile rounded-xl p-5">
        <div className="mb-3 text-sm font-semibold text-slate-700">经营建议</div>
        <ul className="space-y-2.5">
          {(data.strategies || []).map((item: string, index: number) => (
            <li key={`${item}-${index}`} className="flex items-start gap-3 text-sm">
              <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                {index + 1}
              </span>
              <span className="text-slate-700">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function LedgerBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 font-medium ${accent ? "text-emerald-600" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="stat-tile rounded-xl p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${danger ? "text-red-600" : accent ? "text-emerald-600" : "text-slate-800"}`}>
        {value}
      </div>
    </div>
  );
}

function SpeedCard({
  label,
  count,
  revenue,
  tone,
}: {
  label: string;
  count: number;
  revenue: string;
  tone: "emerald" | "amber" | "red";
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
  }[tone];

  return (
    <div className={`rounded-lg p-4 text-center ${toneClass}`}>
      <div className="text-2xl font-bold">{count}</div>
      <div className="mt-1 text-xs">{label}</div>
      <div className="mt-2 text-xs font-medium">{revenue}</div>
    </div>
  );
}

function sumBy(rows: any[], key: string) {
  return rows.reduce((sum, item) => sum + Number(item[key] || 0), 0);
}
