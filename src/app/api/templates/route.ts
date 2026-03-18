import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  content: z.string().min(1),
  variables: z.array(z.string()).default([]),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const url = new URL(req.url);
  const pagination = parsePagination(url);
  const isActive = url.searchParams.get("isActive");

  const where: Record<string, unknown> = { deletedAt: null };
  if (isActive !== null) where.isActive = isActive === "true";

  const [items, total] = await Promise.all([
    prisma.contractTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        code: true,
        variables: true,
        version: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.contractTemplate.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(items, total, pagination));
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const dup = await prisma.contractTemplate.findFirst({
    where: { code: parsed.data.code, deletedAt: null },
  });
  if (dup) return NextResponse.json({ error: "模板编码已存在" }, { status: 409 });

  const tpl = await prisma.contractTemplate.create({ data: parsed.data });
  return NextResponse.json(tpl, { status: 201 });
}
