"use client";

import { useEffect, useState } from "react";

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/funder/notifications");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function markRead(id: string) {
    await fetch("/api/funder/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnread((p) => Math.max(0, p - 1));
  }

  async function markAllRead() {
    await fetch("/api/funder/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
  }

  useEffect(() => { load(); }, []);

  const typeIcon: Record<string, string> = {
    INTEREST_MATURITY: "💰",
    INFO: "ℹ️",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">通知中心</h1>
          <p className="text-sm text-slate-500">
            {unread > 0 ? `${unread} 条未读通知` : "暂无未读通知"}
          </p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            全部已读
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="py-12 text-center text-slate-400">暂无通知</div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 rounded-xl border p-4 transition-all ${n.isRead ? "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50/50"}`}
            >
              <span className="mt-0.5 text-lg">{typeIcon[n.type] ?? "📌"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{n.title}</span>
                  {!n.isRead && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                </div>
                <p className="mt-1 text-sm text-slate-600">{n.content}</p>
                <div className="mt-1 text-xs text-slate-400">
                  {new Date(n.createdAt).toLocaleString("zh-CN")}
                </div>
              </div>
              {!n.isRead && (
                <button onClick={() => markRead(n.id)} className="shrink-0 text-xs text-emerald-600 hover:underline">
                  标记已读
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
