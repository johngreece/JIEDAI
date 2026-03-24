import Link from "next/link";

const ACTIONS = [
  {
    title: "资金入金",
    href: "/admin/funders",
    description: "选择资金方账户，录入金额、渠道和备注，系统自动入池并登记资金流水。",
    note: "适合处理新增注资、补充放款额度。",
  },
  {
    title: "财务结算",
    href: "/admin/settlement",
    description: "查看客户收入、资金方成本、平台净利润、现金流与对账差额。",
    note: "适合日结、周结和异常复核。",
  },
  {
    title: "提现审批",
    href: "/admin/funder-withdrawals",
    description: "处理资金方提现申请，审批后自动扣减账户余额并生成资金流水。",
    note: "适合控制出金节奏与账户余额。",
  },
  {
    title: "资金流水",
    href: "/admin/ledger",
    description: "集中查看客户台账与资金流水，便于财务复核和问题追踪。",
    note: "适合定位差异、核对单笔变动。",
  },
];

const STEPS = [
  "先确认资金方与入金账户无误，再录入金额、渠道和备注。",
  "提交后直接写入数据库，并同步影响资金池余额与资金账户余额。",
  "入金成功后，放款模块可以直接占用对应可用资金。",
  "如需复核结果，可交叉核对资金流水与财务结算页面。",
];

const WATCHERS = [
  {
    title: "今天先看入金",
    text: "优先确认是否有新增注资，避免申请通过后资金池不足影响放款。",
  },
  {
    title: "再看待结算",
    text: "重点核对客户收益、资金方收益和平台净收益是否同步入账。",
  },
  {
    title: "最后看出金",
    text: "提现审批前先复核账户余额、冻结金额和最近流水，降低误操作风险。",
  },
];

export default function FinancePage() {
  return (
    <div className="space-y-5 2xl:space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Finance Hub</span>
          <h1 className="admin-page-header__title">财务中心</h1>
          <p className="admin-page-header__description">
            把入金、结算、提现审批和资金流水集中在同一屏里处理，今天进了多少资金、沉淀多少收益、是否还能安全出金，一眼就能看清。
          </p>
        </div>
        <div className="admin-kpi-strip md:min-w-[430px]">
          <QuickStrip label="处理顺序" value="入金 > 结算 > 出金" />
          <QuickStrip label="核心目标" value="先保放款资金" />
          <QuickStrip label="复核入口" value="流水 + 结算" />
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <div className="grid gap-4 md:grid-cols-2">
            {ACTIONS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="admin-section-card p-5 transition hover:-translate-y-0.5 hover:no-underline hover:shadow-[0_18px_36px_rgba(15,23,42,0.08)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold tracking-tight text-slate-900">{item.title}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.description}</p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">直达</div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-500">{item.note}</div>
                  <div className="text-sm font-medium text-blue-600">进入处理</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="xl:col-span-4">
          <div className="admin-section-card">
            <div className="admin-section-card__header">
              <div>
                <div className="admin-section-card__title">今日财务盯盘</div>
                <p className="admin-section-card__description">把最容易出错的顺序固定下来，减少遗漏和错账。</p>
              </div>
            </div>
            <div className="admin-section-card__body space-y-3">
              {WATCHERS.map((item) => (
                <div key={item.title} className="admin-note-block">
                  <div className="admin-note-block__label">{item.title}</div>
                  <p className="admin-note-block__text">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="admin-section-card">
        <div className="admin-section-card__header">
          <div>
            <div className="admin-section-card__title">入金流程</div>
            <p className="admin-section-card__description">财务和运营按同一条链路操作，减少漏记、错记和重复复核。</p>
          </div>
          <div className="admin-note-block admin-note-block--soft max-w-xl">
            <div className="admin-note-block__text">
              数据写入后，会同步影响资金池余额、资金账户余额和资金流水。
            </div>
          </div>
        </div>
        <div className="admin-section-card__body">
          <div className="grid gap-3 xl:grid-cols-4">
            {STEPS.map((item, index) => (
              <div key={item} className="admin-note-block h-full">
                <div className="text-xs font-semibold tracking-[0.12em] text-slate-400">STEP {index + 1}</div>
                <div className="mt-2 text-sm font-semibold leading-7 text-slate-900">{item}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function QuickStrip({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-kpi-strip__item">
      <div className="admin-kpi-strip__label">{label}</div>
      <div className="admin-kpi-strip__value">{value}</div>
    </div>
  );
}
