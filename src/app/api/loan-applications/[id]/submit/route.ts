import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import {
  formatClientProfileCompletionError,
  getClientProfileCompletion,
  serializeClientProfileCompletion,
} from "@/lib/client-profile";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["loan:create"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const application = await prisma.loanApplication.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          phone: true,
          address: true,
          taxNumber: true,
          idNumber: true,
          passportNumber: true,
          residencePermitNumber: true,
          residencePermitExpiry: true,
          profileCompletedAt: true,
          kyc: {
            select: {
              kycType: true,
              documentUrl: true,
              status: true,
              expiresAt: true,
            },
          },
        },
      },
    },
  });
  if (!application || application.deletedAt) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }

  if (!["DRAFT", "REJECTED"].includes(application.status)) {
    return NextResponse.json({ error: "当前状态不允许提交" }, { status: 400 });
  }

  const profileCompletion = getClientProfileCompletion(application.customer);
  if (!profileCompletion.profileComplete) {
    return NextResponse.json(
      {
        error: formatClientProfileCompletionError(profileCompletion, "客户资料未完善，不能提交风控"),
        profileCompletion: serializeClientProfileCompletion(profileCompletion),
      },
      { status: 409 }
    );
  }

  const updated = await prisma.loanApplication.update({
    where: { id },
    data: {
      status: "PENDING_RISK",
      rejectedReason: null,
      rejectedAt: null,
    },
  });

  await writeAuditLog({
    userId: session.sub,
    action: "update",
    entityType: "loan_application",
    entityId: id,
    oldValue: { status: application.status },
    newValue: { status: updated.status },
    changeSummary: "提交至风控审核",
  }).catch(() => undefined);

  return NextResponse.json({ id: updated.id, status: updated.status });
}
