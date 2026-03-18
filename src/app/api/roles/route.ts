import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { clearPermissionCache } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  const session = await requirePermission(["role:manage", "user:view"]);
  if (session instanceof Response) return session;

  const roles = await prisma.role.findMany({
    include: {
      permissions: {
        include: { permission: true },
      },
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    items: roles.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        name: rp.permission.name,
        module: rp.permission.module,
      })),
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  permissionIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const session = await requirePermission(["role:manage"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, code, description, permissionIds } = parsed.data;

  const existing = await prisma.role.findFirst({
    where: { OR: [{ name }, { code }] },
  });
  if (existing) {
    return NextResponse.json({ error: "角色名或编码已存在" }, { status: 409 });
  }

  const role = await prisma.role.create({
    data: {
      name,
      code,
      description: description ?? null,
      permissions: {
        create: permissionIds.map((pid) => ({ permissionId: pid })),
      },
    },
  });

  return NextResponse.json({ id: role.id, name: role.name, code: role.code }, { status: 201 });
}
