"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  actionUrl: string;
  actionLabel: string;
}

const typeMeta: Record<string, { icon: string; label: string; tone: string }> = {
  WITHDRAWABLE_INTEREST: {
    icon: "¥",
    label: "可提现收益",
    tone: "bg-emerald-100 text-emerald-700",
  },
  SETTLEMENT_UPCOMING: {
    icon: "日",
    label: "结算临近",
    tone: "bg-blue-100 text-blue-700",
  },
  PRINCIPAL_RETURN_SOON: {
    icon: "本",
    label: "回款提醒",
    tone: "bg-amber-100 text-amber-700",
  },
  INFO: {
    icon: "i",
    label: "通知",
    tone: "bg-slate-100 text-slate-700",
  },
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/funder/notifications");
      const data = await response.json();
      setNotifications(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    await fetch("/api/funder/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    setUnread((value) => Math.max(0, value - 1));
  }

  async function openNotification(item: Notification) {
    if (!item.isRead) {
      await markRead(item.id);
    }
    router.push(item.actionUrl);
  }

  async function markAllRead() {
    await fetch("/api/funder/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });

    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnread(0);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">通知中心</h1>
          <p className="text-sm text-slate-500">
            {unread > 0 ? `${unread} 条未读通知` : "暂无未读通知"}
          </p>
        </div>
        {unread > 0 ? (
          <button
            onClick={() => void markAllRead()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            全部已读
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="py-12 text-center text-slate-400">暂无通知</div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => {
            const meta = typeMeta[item.type] || {
              icon: "i",
              label: item.type,
              tone: "bg-slate-100 text-slate-700",
            };

            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 rounded-xl border p-4 transition-all ${
                  item.isRead ? "border-slate-200 bg-white" : "border-emerald-200 bg-emerald-50/40"
                }`}
              >
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700">
                  {meta.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{item.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${meta.tone}`}>{meta.label}</span>
                    {!item.isRead ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{item.content}</p>
                  <div className="mt-2 text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!item.isRead ? (
                    <button onClick={() => void markRead(item.id)} className="text-xs text-slate-500 hover:underline">
                      标记已读
                    </button>
                  ) : null}
                  <button
                    onClick={() => void openNotification(item)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    {item.actionLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
