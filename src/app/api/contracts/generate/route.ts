import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildContractContext, fillTemplate } from "@/lib/contract-engine";

/**
 * 根据借款申请自动生成合同（需已审批通过）
 * POST /api/contracts/generate { applicationId }
 */
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "请先登录管理端" }, { status: 401 });
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
  if (application.status !== "APPROVED") {
    return NextResponse.json({ error: "仅审批通过的申请可生成合同" }, { status: 400 });
  }

  const existing = await prisma.contract.findFirst({
    where: { applicationId, contractType: "MAIN" },
  });
  if (existing) {
    return NextResponse.json({ error: "该申请已生成合同", contractId: existing.id }, { status: 400 });
  }

  const template = await prisma.contractTemplate.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!template) {
    return NextResponse.json({ error: "暂无可用合同模板" }, { status: 400 });
  }

  const amount = Number(application.amount);
  const contractNo = "HT" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const ctx = buildContractContext({
    customerName: application.customer.name,
    idNumber: application.customer.idNumber ?? "",
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
  const content = fillTemplate(template.content, ctx);

  const contract = await prisma.contract.create({
    data: {
      contractNo,
      applicationId,
      customerId: application.customerId,
      templateId: template.id,
      content,
      variableData: JSON.stringify(ctx),
      status: "DRAFT",
    },
  });

  return NextResponse.json({ id: contract.id, contractNo: contract.contractNo });
}
