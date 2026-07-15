import { NextResponse } from "next/server";
import { z } from "zod";
import { EXTENSION_DECISION_ACTIONS } from "@/lib/extension-lifecycle";
import { requirePermission } from "@/lib/rbac";
import {
  approveExtension,
  ExtensionConflictError,
} from "@/services/extension.service";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  action: z.enum(EXTENSION_DECISION_ACTIONS),
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

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "操作失败" },
      { status: err instanceof ExtensionConflictError ? 409 : 400 },
    );
  }
}
