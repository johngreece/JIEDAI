"use client";

import { useEffect, useState } from "react";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  content: string;
  templateCode: string | null;
  isRead: boolean;
  createdAt: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/notifications");
      const data = await response.json();
      setItems(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function markOne(id: string) {
    await fetch("/api/admin/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function markAll() {
    await fetch("/api/admin/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">系统告警</h1>
          <p className="mt-1 text-sm text-slate-600">夜间回归失败、关键系统异常与需要人工处理的站内提醒。</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">
            未读 {unread}
          </div>
          <button
            type="button"
            onClick={() => void markAll()}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            全部已读
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">正在加载告警...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">当前没有系统告警。</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <div key={item.id} className="p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.isRead ? "bg-slate-100 text-slate-500" : "bg-rose-100 text-rose-700"}`}>
                        {item.isRead ? "已读" : "未读"}
                      </span>
                      <span className="text-xs text-slate-400">{item.type}</span>
                    </div>
                    <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
                    <p className="whitespace-pre-line text-sm leading-6 text-slate-600">{item.content}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(item.createdAt)}
                      {item.templateCode ? ` · ${item.templateCode}` : ""}
                    </p>
                  </div>
                  {!item.isRead ? (
                    <button
                      type="button"
                      onClick={() => void markOne(item.id)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      标记已读
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
