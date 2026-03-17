import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-slate-200 py-4 px-6 md:px-12 flex justify-between items-center">
        <div className="flex items-center gap-2">
           <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
             D
           </div>
           <span className="text-xl font-bold text-slate-800 tracking-tight">DaiKuan System</span>
        </div>
        <div className="text-sm text-slate-500 hidden md:block">
          专业 · 安全 · 高效
        </div>
      </header>

      {/* 主要内容区 */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
        <div className="max-w-4xl w-full text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight">
            全流程借款业务管理系统
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            专为金融放贷业务打造的一站式解决方案。
            <br className="hidden md:inline" />
            从客户准入、合同签署到还款确认，实现全链路数字化管理。
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl w-full px-4">
          {/* 管理端入口卡片 */}
          <Link
            href="/admin/login"
            className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-700 to-slate-900 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-slate-100 transition-colors">
                <svg className="h-8 w-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">管理端入口</h2>
              <p className="text-slate-500 mb-6 text-sm">
                适用于风控经理、财务人员及系统管理员。
                <br/>处理放款审批、合同管理及数据报表。
              </p>
              <span className="inline-flex items-center text-sm font-semibold text-slate-700 group-hover:text-slate-900">
                进入工作台 <span className="ml-1 transition-transform group-hover:translate-x-1">→</span>
              </span>
            </div>
          </Link>

          {/* 客户端入口卡片 */}
          <Link
            href="/client/login"
            className="group relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-8 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
          >
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-blue-700 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-100 transition-colors">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">客户端入口</h2>
              <p className="text-slate-500 mb-6 text-sm">
                适用于借款客户。
                <br/>查看您的借款进度、在线签署合同及确认还款。
              </p>
              <span className="inline-flex items-center text-sm font-semibold text-blue-600 group-hover:text-blue-700">
                立即登录 <span className="ml-1 transition-transform group-hover:translate-x-1">→</span>
              </span>
            </div>
          </Link>
        </div>
      </div>

      <footer className="py-6 text-center text-slate-400 text-sm border-t border-slate-200 bg-white">
        © {new Date().getFullYear()} Daikuan System. All rights reserved.
      </footer>
    </main>
  );
}
