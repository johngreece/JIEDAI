import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientLoanTermsError } from "@/lib/client-loan-terms";
import {
  getClientBaseCreditLimit,
  getClientProfileCompletion,
} from "@/lib/client-profile";
import { getScopedIdempotencyKey, withIdempotencyResponse } from "@/lib/idempotency";
import { requireActiveClientSession } from "@/lib/portal-session";
import { prisma } from "@/lib/prisma";
import { isPublicClientProductCode } from "@/lib/public-loan-products";
import { InAppNotificationService } from "@/services/in-app-notification.service";
import {
  LoanTransitionConflictError,
  transitionLoanApplication,
} from "@/services/loan-transition.service";

export const dynamic = "force-dynamic";

const resubmitSchema = z.object({
  amount: z.number().positive(),
  termValue: z.number().int().positive(),
  purpose: z.string().trim().max(200).optional(),
  remark: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireActiveClientSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const idempotencyKey = getScopedIdempotencyKey(req, [
    "client",
    session.sub,
    "loan-application-resubmit",
    id,
  ]);

  return withIdempotencyResponse(idempotencyKey, async () => {
    const body = await req.json().catch(() => ({}));
    const parsed = resubmitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数错误", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const application = await prisma.loanApplication.findFirst({
      where: {
        id,
        customerId: session.sub,
        deletedAt: null,
      },
      include: {
        product: {
          select: {
            code: true,
            name: true,
            isActive: true,
            deletedAt: true,
            minAmount: true,
            maxAmount: true,
            minTermValue: true,
            maxTermValue: true,
          },
        },
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
            creditLimit: true,
            creditLimitOverride: true,
            riskLevel: true,
            deletedAt: true,
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

    if (!application || application.customer.deletedAt) {
      return NextResponse.json({ error: "借款申请不存在" }, { status: 404 });
    }
    if (application.status !== "RETURNED") {
      return NextResponse.json({ error: "当前状态不允许修改并重新提交" }, { status: 409 });
    }
    if (application.customer.riskLevel === "BLACKLIST") {
      return NextResponse.json({ error: "当前客户风险状态不允许重新提交借款" }, { status: 403 });
    }
    if (
      application.product.deletedAt ||
      !application.product.isActive ||
      !isPublicClientProductCode(application.product.code)
    ) {
      return NextResponse.json(
        { error: "原借款产品已停用或不再对客户开放，请联系管理员处理" },
        { status: 409 },
      );
    }

    const profileCompletion = getClientProfileCompletion(application.customer);
    if (!profileCompletion.profileComplete) {
      return NextResponse.json(
        {
          error: "请先补齐并通过客户资料和证件核验后再重新提交",
          missingFields: profileCompletion.missingFields,
          missingDocTypes: profileCompletion.missingDocTypes,
        },
        { status: 428 },
      );
    }

    const creditLimit = application.customer.creditLimitOverride != null
      ? Number(application.customer.creditLimitOverride)
      : getClientBaseCreditLimit(profileCompletion);
    const input = parsed.data;
    const termsError = getClientLoanTermsError({
      terms: input,
      product: {
        minAmount: Number(application.product.minAmount),
        maxAmount: Number(application.product.maxAmount),
        minTermValue: application.product.minTermValue,
        maxTermValue: application.product.maxTermValue,
      },
      creditLimit,
    });
    if (termsError) {
      return NextResponse.json({ error: termsError }, { status: 400 });
    }

    const updated = await prisma
      .$transaction((tx) =>
        transitionLoanApplication(tx, {
          applicationId: application.id,
          from: "RETURNED",
          to: "PENDING_RISK",
          action: "RESUBMIT",
          auditAction: "update",
          changeSummary: "Client updated and resubmitted returned application",
          data: {
            amount: input.amount,
            termValue: input.termValue,
            purpose: input.purpose || null,
            remark: input.remark || null,
            riskScore: null,
            riskComment: null,
            approvedAt: null,
            totalApprovedAmount: null,
            rejectedAt: null,
            rejectedReason: null,
          },
        }),
      )
      .catch((error) => {
        if (error instanceof LoanTransitionConflictError) return null;
        throw error;
      });

    if (!updated) {
      return NextResponse.json(
        { error: "借款申请状态已变化，请刷新后重试" },
        { status: 409 },
      );
    }

    await InAppNotificationService.notifyAdmins({
      type: "CLIENT_LOAN_APPLICATION_RESUBMITTED",
      templateCode: `CLIENT_LOAN_APPLICATION_RESUBMITTED_${updated.id}_${updated.updatedAt.toISOString()}`,
      title: "客户已补件并重新提交借款申请",
      content: `借款申请 ${application.applicationNo} 已由客户修改并重新提交，产品 ${application.product.name}，请重新进行风控审核。`,
    }).catch(() => undefined);

    return NextResponse.json({
      id: updated.id,
      applicationNo: updated.applicationNo,
      status: updated.status,
    });
  });
}
