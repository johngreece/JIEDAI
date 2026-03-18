import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const tpl = await prisma.contractTemplate.findFirst({
    where: { id, deletedAt: null },
  });
  if (!tpl) return NextResponse.json({ error: "模板不存在" }, { status: 404 });

  return NextResponse.json(tpl);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.contractTemplate.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "模板不存在" }, { status: 404 });

  // 更新时自动递增版本
  const updated = await prisma.contractTemplate.update({
    where: { id },
    data: {
      ...parsed.data,
      version: existing.version + 1,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.contractTemplate.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "模板不存在" }, { status: 404 });

  // 检查是否有合同引用
  const usedCount = await prisma.contract.count({ where: { templateId: id } });
  if (usedCount > 0) {
    // 有合同引用时只能停用，不能删除
    await prisma.contractTemplate.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true, message: "已停用（有合同引用，无法删除）" });
  }

  await prisma.contractTemplate.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ success: true });
}
