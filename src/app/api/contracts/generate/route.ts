import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildContractContext, fillTemplate } from "@/lib/contract-engine";

/**
 * 根据借款申请自动生成合同（需已审批通过）
 * POST /api/contracts/generate { applicationId }
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const applicationId = body.applicationId;
  if (!applicationId) {
    return NextResponse.json({ error: "缺少 applicationId" }, { status: 400 });
  }

  const application = await prisma.loanApplication.findUnique({
    where: { id: applicationId },
    include: { customer: true, product: true },
  });
  if (!application) {
    return NextResponse.json({ error: "申请不存在" }, { status: 404 });
  }
  if (application.status !== "approved") {
    return NextResponse.json({ error: "仅审批通过的申请可生成合同" }, { status: 400 });
  }

  const existing = await prisma.contract.findUnique({
    where: { applicationId },
  });
  if (existing) {
    return NextResponse.json({ error: "该申请已生成合同", contractId: existing.id }, { status: 400 });
  }

  const template = await prisma.contractTemplate.findFirst({
    where: { isActive: true },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!template) {
    return NextResponse.json({ error: "暂无可用合同模板" }, { status: 400 });
  }

  const amount = Number(application.amount);
  const contractNo = "HT" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const ctx = buildContractContext({
    customerName: application.customer.name,
    idNumber: application.customer.idNumber ?? application.customer.passportNumber ?? "",
    phone: application.customer.phone ?? "",
    loanAmount: amount.toFixed(2),
    loanAmountCn: amount.toFixed(2),
    termValue: application.termValue,
    termUnit: application.termUnit,
    interestRate: "按约定",
    serviceFee: "按约定",
    totalRepay: "按约定",
    contractNo,
    signDate: new Date().toISOString().slice(0, 10),
    signTime: new Date().toTimeString().slice(0, 8),
    signLocation: "",
  });
  const snapshotHtml = fillTemplate(template.contentHtml, ctx);

  const contract = await prisma.contract.create({
    data: {
      contractNo,
      applicationId,
      templateId: template.id,
      snapshotHtml,
      variablesSnapshot: ctx as object,
      status: "pending_sign",
    },
  });

  return NextResponse.json({ id: contract.id, contractNo: contract.contractNo });
}
