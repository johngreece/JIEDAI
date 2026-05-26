import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requirePermission } from "@/lib/rbac";
import { approveExtension } from "@/services/extension.service";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  action: z.enum(["APPROVED", "REJECTED"]),
  remark: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["extension:approve"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await approveExtension({
      extensionId: id,
      action: parsed.data.action,
      remark: parsed.data.remark,
      operatorId: session.sub,
    });

    await writeAuditLog({
      userId: session.sub,
      action: parsed.data.action === "APPROVED" ? "approve" : "reject",
      entityType: "extension",
      entityId: id,
      newValue: { action: parsed.data.action },
      changeSummary: `展期${parsed.data.action === "APPROVED" ? "审批通过" : "已拒绝"}`,
    }).catch((e) => console.error("[AuditLog] extension-approve", e));

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
