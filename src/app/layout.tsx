import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "借贷业务管理系统",
  description: "移动优先、流程完整、可签约、可提醒、可结算的借贷业务平台。",
  keywords: ["借贷", "放款", "还款", "合同", "通知", "结算"],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "借贷平台",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1e293b",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased safe-px safe-pt">
        {children}
      </body>
    </html>
  );
}
