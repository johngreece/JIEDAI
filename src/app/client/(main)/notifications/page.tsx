"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  actionUrl: string;
  actionLabel: string;
}

const typeTone: Record<string, string> = {
  DISBURSEMENT_RECEIVED: "bg-blue-100 text-blue-700",
  REPAYMENT_DUE_SOON: "bg-amber-100 text-amber-700",
  REPAYMENT_DUE_TODAY: "bg-orange-100 text-orange-700",
  REPAYMENT_OVERDUE: "bg-red-100 text-red-700",
  REPAYMENT_CONFIRM: "bg-emerald-100 text-emerald-700",
  LOAN_APPLICATION_SUBMITTED: "bg-sky-100 text-sky-700",
  LOAN_APPLICATION_UNDER_APPROVAL: "bg-indigo-100 text-indigo-700",
  LOAN_APPLICATION_APPROVED: "bg-emerald-100 text-emerald-700",
  LOAN_APPLICATION_REJECTED: "bg-rose-100 text-rose-700",
  REPAYMENT_REQUEST_SUBMITTED: "bg-cyan-100 text-cyan-700",
};

export default function ClientNotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/client/notifications");
      const data = await response.json();
      setNotifications(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const markRead = async (id: string) => {
    await fetch("/api/client/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isRead: true } : item))
    );
    setUnread((value) => Math.max(0, value - 1));
  };

  const openNotification = async (item: NotificationItem) => {
    if (!item.isRead) {
      await markRead(item.id);
    }
    router.push(item.actionUrl);
  };

  const markAllRead = async () => {
    await fetch("/api/client/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });

    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnread(0);
  };

  return (
    <div className="space-y-6">
      <header className="panel-soft rounded-2xl px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">消息提醒</h1>
            <p className="mt-1 text-sm text-slate-600">
              到期、逾期、待确认付款和放款确认通知都可以直接跳到对应处理页面。
            </p>
          </div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              全部标记已读
            </button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="panel-soft rounded-2xl p-6 text-sm text-slate-500">加载中...</div>
      ) : notifications.length === 0 ? (
        <div className="panel-soft rounded-2xl p-6 text-sm text-slate-500">当前没有新的借款提醒。</div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 transition ${
                item.isRead ? "border-slate-200 bg-slate-50" : "border-blue-200 bg-white"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${typeTone[item.type] || "bg-slate-100 text-slate-600"}`}>
                      {item.isRead ? "已读" : "未读"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{item.content}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!item.isRead ? (
                    <button
                      type="button"
                      onClick={() => void markRead(item.id)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      标记已读
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void openNotification(item)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    {item.actionLabel}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
