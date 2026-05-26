import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

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
  const session = await requirePermission(["settings:view"]);
  if (session instanceof Response) return session;

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
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;

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

  await writeAuditLog({
    userId: session.sub,
    action: "update",
    entityType: "contract_template",
    entityId: id,
    oldValue: {
      name: existing.name,
      code: existing.code,
      version: existing.version,
      isActive: existing.isActive,
    },
    newValue: {
      name: updated.name,
      code: updated.code,
      version: updated.version,
      isActive: updated.isActive,
    },
    changeSummary: "Update contract template and increment version",
  }).catch((error) => console.error("[AuditLog] template-update", error));

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;

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
    await writeAuditLog({
      userId: session.sub,
      action: "update",
      entityType: "contract_template",
      entityId: id,
      oldValue: {
        name: existing.name,
        code: existing.code,
        isActive: existing.isActive,
        usedCount,
      },
      newValue: { isActive: false },
      changeSummary: "Deactivate contract template because existing contracts reference it",
    }).catch((error) => console.error("[AuditLog] template-deactivate", error));
    return NextResponse.json({ success: true, message: "已停用（有合同引用，无法删除）" });
  }

  await prisma.contractTemplate.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    userId: session.sub,
    action: "delete",
    entityType: "contract_template",
    entityId: id,
    oldValue: {
      name: existing.name,
      code: existing.code,
      version: existing.version,
      isActive: existing.isActive,
    },
    newValue: { deletedAt: true },
    changeSummary: "Soft-delete unused contract template",
  }).catch((error) => console.error("[AuditLog] template-delete", error));
  return NextResponse.json({ success: true });
}
