import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { applyExtension, getExtensionList } from "@/services/extension.service";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  applicationId: z.string().min(1),
  extensionDays: z.number().int().min(1).max(90),
  applyReason: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const url = new URL(req.url);
  const applicationId = url.searchParams.get("applicationId") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));

  const result = await getExtensionList({ applicationId, status, page, pageSize });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const ext = await applyExtension({
      ...parsed.data,
      operatorId: session.sub,
    });

    await writeAuditLog({
      userId: session.sub,
      action: "create",
      entityType: "extension" as any,
      entityId: ext.id,
      newValue: { extensionDays: ext.extensionDays, extensionFee: Number(ext.extensionFee) },
      changeSummary: `申请展期 ${ext.extensionDays} 天`,
    }).catch((e) => console.error("[AuditLog] extension-create", e));

    return NextResponse.json({ id: ext.id, status: ext.status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
