import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { ContractService } from "@/services/contract.service";

export const dynamic = "force-dynamic";

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

  try {
    const result = await ContractService.generateMainContract(applicationId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, contract: result.data });
  } catch (error) {
    console.error("生成合同接口异常:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
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
