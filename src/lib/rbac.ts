/**
 * RBAC 权限检查中间件
 * 在 API 路由中使用：
 *   const session = await requirePermission(["loan:approve", "loan:view"]);
 *   if (session instanceof Response) return session; // 403
 */

import { prisma } from "./prisma";
import { getAdminSession, getSession, type AdminPayload, type JWTPayload } from "./auth";

/** 权限缓存（进程级，TTL 5 分钟） */
const permissionCache = new Map<string, { permissions: Set<string>; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 获取角色的所有权限代码
 */
async function getRolePermissions(roleCode: string): Promise<Set<string>> {
  const cached = permissionCache.get(roleCode);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.permissions;
  }

  const role = await prisma.role.findUnique({
    where: { code: roleCode },
    include: {
      permissions: {
        include: { permission: true },
      },
    },
  });

  const permissions = new Set(
    role?.permissions.map((rp) => rp.permission.code) ?? []
  );

  // super_admin 拥有所有权限
  if (roleCode === "super_admin") {
    permissions.add("*");
  }

  permissionCache.set(roleCode, {
    permissions,
    expiresAt: Date.now() + CACHE_TTL,
  });

  return permissions;
}

/**
 * 检查 admin session 是否拥有指定权限
 * @param requiredPermissions - 需要的权限代码（OR 关系：任一匹配即可）
 * @returns AdminPayload 或 Response (403)
 */
export async function requirePermission(
  requiredPermissions: string[]
): Promise<AdminPayload | Response> {
  const session = await getAdminSession();
  if (!session) {
    return Response.json(
      { code: "E10001", message: "请先登录" },
      { status: 401 }
    );
  }

  // super_admin 跳过权限检查
  if (session.roles?.includes("super_admin")) {
    return session;
  }

  // 获取所有角色的权限并集
  const allPermissions = new Set<string>();
  for (const role of session.roles ?? []) {
    const perms = await getRolePermissions(role);
    perms.forEach((p) => allPermissions.add(p));
  }

  // 通配符权限
  if (allPermissions.has("*")) {
    return session;
  }

  // 检查是否满足任一所需权限
  const hasPermission = requiredPermissions.some((p) => allPermissions.has(p));
  if (!hasPermission) {
    return Response.json(
      { code: "E10004", message: "没有操作权限", required: requiredPermissions },
      { status: 403 }
    );
  }

  return session;
}

/**
 * 仅要求管理端登录（不检查具体权限）
 */
export async function requireAdmin(): Promise<AdminPayload | Response> {
  const session = await getAdminSession();
  if (!session) {
    return Response.json(
      { code: "E10001", message: "请先登录管理端" },
      { status: 401 }
    );
  }
  return session;
}

/**
 * 清除权限缓存（权限变更后调用）
 */
export function clearPermissionCache(roleCode?: string) {
  if (roleCode) {
    permissionCache.delete(roleCode);
  } else {
    permissionCache.clear();
  }
}
