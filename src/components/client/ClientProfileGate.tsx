"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Props = {
  children: React.ReactNode;
};

export function ClientProfileGate({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const isProfilePage = pathname === "/client/profile" || pathname.startsWith("/client/profile/");

  useEffect(() => {
    if (isProfilePage) {
      setChecking(false);
      return;
    }

    let active = true;
    setChecking(true);

    fetch("/api/client/profile", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        if (data && !data.profileComplete) {
          router.replace("/client/profile?required=1");
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [isProfilePage, pathname, router]);

  if (!isProfilePage && checking) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center shadow-sm">
          <div className="text-sm font-semibold text-slate-900">正在核验客户资料</div>
          <div className="mt-1 text-xs text-slate-500">请稍候...</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
