import Link from "next/link";

const ACTIONS = [
  {
    title: "资金入金",
    href: "/admin/funders",
    description: "选择资金方账户，录入金额、渠道和备注，系统自动入池并记资金流水。",
    note: "适合今天新增资金、补充放款额度",
  },
  {
    title: "财务结算",
    href: "/admin/settlement",
    description: "查看客户收入、资金方成本、平台净利润、现金流和对账差额。",
    note: "适合日结、周结和异常复核",
  },
  {
    title: "提现审批",
    href: "/admin/funder-withdrawals",
    description: "处理资金方提现申请，审批后自动扣减账户余额并生成资金流水。",
    note: "适合控制出金与账户余额",
  },
  {
    title: "资金流水",
    href: "/admin/ledger",
    description: "查看客户台账与资金流水，适合财务复核和问题追溯。",
    note: "适合定位差异、核对单笔变动",
  },
];

const STEPS = [
  "进入资金入金，先确认资金方与入金账户无误。",
  "录入入金金额、渠道和备注后提交，系统直接写入数据库。",
  "入金成功后，资金池余额同步增加，后续放款可直接占用该资金。",
  "如需复核结果，可到资金流水与财务结算交叉核对当天变化。",
];

const WATCHERS = [
  {
    title: "今日先看入金",
    text: "先确认今天是否有新增入金，避免借款申请通过后资金池不足。",
  },
  {
    title: "再看待结算",
    text: "重点检查客户收益、资金方收益和平台净收益是否同步落账。",
  },
  {
    title: "最后看出金",
    text: "提现审批前先复核资金账户余额、冻结金额和最近流水。",
  },
];

export default function FinancePage() {
  return (
    <div className="space-y-5 2xl:space-y-6">
      <header className="panel-soft rounded-[28px] px-5 py-5 xl:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)] xl:items-end">
          <div>
            <div className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.18em] text-slate-500">
              FINANCE HUB
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 xl:text-4xl">
              财务中心
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-600 xl:text-base">
              把入金、结算、提现审批和资金流水统一放在一屏里处理，
              今天进多少钱、沉淀多少收益、还能不能出金，一眼就能看清。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <QuickStrip label="处理顺序" value="入金 > 结算 > 出金" />
            <QuickStrip label="核心目标" value="先保放款资金" />
            <QuickStrip label="复核入口" value="流水 + 结算" />
          </div>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <div className="grid gap-4 md:grid-cols-2">
            {ACTIONS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="stat-tile rounded-[26px] p-5 transition hover:-translate-y-0.5 hover:shadow-sm hover:no-underline"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold tracking-tight text-slate-900">{item.title}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.description}</p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    直达
                  </div>
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
          <div className="stat-tile rounded-[26px] p-5">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">今日财务盯盘</h2>
            <div className="mt-4 space-y-3">
              {WATCHERS.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="stat-tile rounded-[28px] p-5 xl:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">入金流程</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              财务和运营都按这条链路走，减少漏记、错记和重复核对。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            数据写入后，会同步影响资金池余额、资金账户余额和资金流水。
          </div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-4">
          {STEPS.map((item, index) => (
            <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold tracking-[0.12em] text-slate-400">STEP {index + 1}</div>
              <div className="mt-2 text-sm font-semibold leading-7 text-slate-900">{item}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function QuickStrip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}
