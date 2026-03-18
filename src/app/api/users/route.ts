import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { hashPassword } from "@/lib/password";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  username: z.string().min(2).max(50),
  password: z.string().min(6),
  realName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  roleId: z.string().min(1),
});

export async function GET(req: Request) {
  const session = await requirePermission(["user:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const pagination = parsePagination(url);
  const search = url.searchParams.get("search") ?? undefined;

  const where = {
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { username: { contains: search, mode: "insensitive" as const } },
            { realName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [list, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        realName: true,
        phone: true,
        email: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        role: { select: { id: true, name: true, code: true } },
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(list, total, pagination));
}

export async function POST(req: Request) {
  const session = await requirePermission(["user:create"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const { username, password, realName, phone, email, roleId } = parsed.data;

  // 检查用户名唯一
  const existing = await prisma.user.findFirst({ where: { username, deletedAt: null } });
  if (existing) {
    return NextResponse.json({ error: "用户名已存在" }, { status: 409 });
  }

  // 检查角色存在
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    return NextResponse.json({ error: "角色不存在" }, { status: 404 });
  }

  const hashedPwd = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: hashedPwd,
      realName,
      phone: phone ?? null,
      email: email || null,
      roleId,
    },
    select: { id: true, username: true, realName: true },
  });

  return NextResponse.json(user, { status: 201 });
}
