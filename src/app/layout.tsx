import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "借款业务管理系统",
  description: "内部可控、流程完整、留痕清晰的非银行场景借款管理系统。资金可追溯，合同可签署，还款可确认，全流程可审计。",
  keywords: ["借款", "放款", "还款", "合同", "对账", "审计"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e293b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
