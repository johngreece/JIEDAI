import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { apiError, apiSuccess, ErrorCodes } from "@/lib/errors";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  remark: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["loan:approve"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ErrorCodes.VALIDATION_ERROR);
  }

  const record = await prisma.restructure.findUnique({ where: { id } });
  if (!record) {
    return apiError(ErrorCodes.RESTR_NOT_FOUND);
  }
  if (record.status !== "PENDING") {
    return apiError(ErrorCodes.EXT_BAD_STATUS);
  }

  const newStatus = parsed.data.action === "APPROVE" ? "APPROVED" : "REJECTED";

  const updated = await prisma.restructure.update({
    where: { id },
    data: {
      status: newStatus,
      remark: parsed.data.remark ?? null,
      approvedAt: parsed.data.action === "APPROVE" ? new Date() : null,
    },
  });

  return apiSuccess({ id: updated.id, status: updated.status });
}
