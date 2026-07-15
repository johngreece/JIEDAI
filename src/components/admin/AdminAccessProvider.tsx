"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { AdminAccessContext as AdminAccessValue } from "@/lib/admin-access-policy";

const AdminAccessContext = createContext<AdminAccessValue | null>(null);

export function AdminAccessProvider({
  children,
  permissions,
  isSuperAdmin,
}: AdminAccessValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ permissions, isSuperAdmin }),
    [isSuperAdmin, permissions]
  );

  return (
    <AdminAccessContext.Provider value={value}>
      {children}
    </AdminAccessContext.Provider>
  );
}

export function useAdminAccess() {
  const value = useContext(AdminAccessContext);
  if (!value) {
    throw new Error("useAdminAccess must be used inside AdminAccessProvider");
  }
  return value;
}
