import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, clearPermissionCache } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["role:manage"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    return NextResponse.json({ error: "角色不存在" }, { status: 404 });
  }
  if (role.isSystem) {
    return NextResponse.json({ error: "系统内置角色不可修改" }, { status: 403 });
  }

  const { name, description, permissionIds } = parsed.data;

  await prisma.$transaction(async (tx) => {
    if (name || description !== undefined) {
      await tx.role.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        },
      });
    }

    // 更新权限绑定（全量替换）
    if (permissionIds) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((pid) => ({ roleId: id, permissionId: pid })),
        });
      }
    }
  });

  // 清除该角色的权限缓存
  clearPermissionCache(role.code);

  return NextResponse.json({ ok: true });
}
