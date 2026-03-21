"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type RuntimeProps = {
  portal: "client" | "funder";
  notificationsEndpoint: string;
  notificationsPageHref: string;
  appName: string;
};

type NotificationItem = {
  id: string;
  title: string;
  content: string;
  isRead: boolean;
  actionUrl?: string;
};

function runtimeSeenKey(portal: string) {
  return `pwa-notified:${portal}`;
}

export function AppRuntimeBridge({
  portal,
  notificationsEndpoint,
  notificationsPageHref,
  appName,
}: RuntimeProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");
  const [notificationSupported, setNotificationSupported] = useState(false);
  const initializedRef = useRef(false);

  const seenStorageKey = useMemo(() => runtimeSeenKey(portal), [portal]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setNotificationSupported("Notification" in window);
    if ("Notification" in window) {
      setNotificationPermission(window.Notification.permission);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setShowIosInstallHint(isIos && isSafari && !standalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!notificationSupported || notificationPermission !== "granted") return;

    let cancelled = false;

    async function pollNotifications() {
      try {
        const response = await fetch(`${notificationsEndpoint}?limit=10`, {
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;

        const unread = Number(data.unread ?? 0);
        const notifications = Array.isArray(data.notifications)
          ? (data.notifications as NotificationItem[])
          : [];

        if (!initializedRef.current) {
          window.localStorage.setItem(
            seenStorageKey,
            JSON.stringify(notifications.map((item) => item.id))
          );
          initializedRef.current = true;
          return;
        }

        const seen = new Set<string>(
          JSON.parse(window.localStorage.getItem(seenStorageKey) ?? "[]") as string[]
        );
        const newItems = notifications.filter((item) => !item.isRead && !seen.has(item.id));

        if (newItems.length > 0) {
          const registration = await navigator.serviceWorker?.getRegistration();

          for (const item of newItems) {
            if (registration) {
              await registration.showNotification(item.title, {
                body: item.content,
                tag: `${portal}:${item.id}`,
                data: {
                  url: item.actionUrl || notificationsPageHref,
                },
              });
            } else {
              new Notification(item.title, {
                body: item.content,
                tag: `${portal}:${item.id}`,
              });
            }

            seen.add(item.id);
          }

          window.localStorage.setItem(seenStorageKey, JSON.stringify(Array.from(seen)));
        }

        if ("setAppBadge" in navigator) {
          if (unread > 0) {
            (
              navigator as Navigator & {
                setAppBadge: (value?: number) => Promise<void>;
              }
            )
              .setAppBadge(unread)
              .catch(() => undefined);
          } else if ("clearAppBadge" in navigator) {
            (
              navigator as Navigator & {
                clearAppBadge: () => Promise<void>;
              }
            )
              .clearAppBadge()
              .catch(() => undefined);
          }
        }
      } catch {
        return;
      }
    }

    void pollNotifications();
    const timer = window.setInterval(() => {
      void pollNotifications();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    notificationPermission,
    notificationSupported,
    notificationsEndpoint,
    notificationsPageHref,
    portal,
    seenStorageKey,
  ]);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  }

  async function enableNotifications() {
    if (typeof window === "undefined" || !notificationSupported) return;
    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
  }

  const showInstallBanner = !!deferredPrompt || showIosInstallHint;
  const showNotificationBanner =
    notificationSupported && notificationPermission !== "granted";

  if (!showInstallBanner && !showNotificationBanner) {
    return null;
  }

  return (
    <div className="app-runtime-banner rounded-2xl border border-cyan-200/60 bg-white/90 p-3 text-slate-900 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold">
            {showInstallBanner ? `把 ${appName} 添加到桌面` : "开启浏览器消息提醒"}
          </div>
          <div className="text-xs text-slate-600">
            {showInstallBanner
              ? showIosInstallHint
                ? "在 iPhone 或 iPad 上可点浏览器分享按钮，再选择“添加到主屏幕”。"
                : "安装后可像手机 App 一样从桌面直接打开，移动端也能添加到主屏幕。"
              : "开启后，新的到期、逾期、待确认和收益提醒会在浏览器里弹出。"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {showNotificationBanner ? (
            <button
              type="button"
              onClick={() => void enableNotifications()}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              开启提醒
            </button>
          ) : null}
          {showInstallBanner && !showIosInstallHint ? (
            <button
              type="button"
              disabled={installing}
              onClick={() => void handleInstall()}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {installing ? "安装中..." : "添加到桌面"}
            </button>
          ) : null}
          <Link
            href={notificationsPageHref}
            className="rounded-xl border border-transparent px-4 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50 hover:no-underline"
          >
            查看消息
          </Link>
        </div>
      </div>
    </div>
  );
}
