import { prisma } from "@/lib/prisma";
import { ServiceResponse } from "@/types";
import {
  buildContractContext,
  fillTemplate,
  parseVariableNames,
} from "@/lib/contract-engine/variables";
import {
  PROFESSIONAL_LOAN_TEMPLATE_CODE,
  PROFESSIONAL_LOAN_TEMPLATE_HTML,
  PROFESSIONAL_LOAN_TEMPLATE_VARIABLES,
} from "@/lib/contract-engine/professional-loan-template";

type ContractRecord = NonNullable<Awaited<ReturnType<typeof prisma.contract.findFirst>>>;

export type MainContractOptions = {
  basePrincipal?: number;
  capitalizedInterestAmount?: number;
  contractPrincipal?: number;
  contractDisplayInterestRate?: string;
  weeklyInterestAmount?: string;
  monthlyInterestAmount?: string;
};

type ContractDraftPayload = {
  contractNo: string;
  templateId: string;
  variableData: string;
  content: string;
};

function money(value: number) {
  return value.toFixed(2);
}

function formatTermUnit(value: string) {
  if (value === "DAY") return "天";
  if (value === "WEEK") return "周";
  if (value === "MONTH") return "月";
  return value;
}

function normalizeNumber(value: number | undefined, fallback: number) {
  if (value == null || Number.isNaN(value)) return fallback;
  return value;
}

function buildRenderedContract(params: {
  templateContent: string;
  contractNo: string;
  applicationNo: string;
  productName: string;
  customerName: string;
  customerIdNumber?: string | null;
  customerPhone?: string | null;
  amount: number;
  termValue: number;
  termUnit: string;
  options?: MainContractOptions;
}) {
  const today = new Date();
  const signDate = today.toLocaleDateString("zh-CN");
  const signTime = today.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const basePrincipal = normalizeNumber(params.options?.basePrincipal, params.amount);
  const capitalizedInterestAmount = normalizeNumber(
    params.options?.capitalizedInterestAmount,
    0
  );
  const contractPrincipal = normalizeNumber(
    params.options?.contractPrincipal,
    basePrincipal + capitalizedInterestAmount
  );

  const context = buildContractContext({
    platformName: "借贷智能管理平台",
    lenderName: "甲方指定出借主体",
    applicationNo: params.applicationNo,
    productName: params.productName,
    customerName: params.customerName,
    idNumber: params.customerIdNumber ?? "",
    phone: params.customerPhone ?? "",
    loanAmount: money(contractPrincipal),
    basePrincipal: money(basePrincipal),
    weeklyInterestAmount: params.options?.weeklyInterestAmount || "按本单确认口径填写",
    monthlyInterestAmount: params.options?.monthlyInterestAmount || "按本单确认口径填写",
    capitalizedInterestAmount: money(capitalizedInterestAmount),
    contractPrincipal: money(contractPrincipal),
    disbursementAmount: money(params.amount),
    termValue: params.termValue,
    termUnit: formatTermUnit(params.termUnit),
    interestRate: "正常利息已按业务规则并入本金",
    serviceFee: "不适用",
    contractDisplayInterestRate: params.options?.contractDisplayInterestRate || "2%",
    contractDisplayInterestNote:
      "仅用于合同展示和法律依据，不参与系统正常利息重复计算。",
    totalRepay: money(contractPrincipal),
    repaySummary: `${params.termValue}${formatTermUnit(params.termUnit)}，最终以生成后的还款计划为准`,
    contractNo: params.contractNo,
    signDate,
    signTime,
    signLocation: "在线签署",
  });

  return {
    context,
    content: fillTemplate(params.templateContent, context),
  };
}

export class ContractService {
  private static async ensureProfessionalTemplate() {
    return prisma.contractTemplate.upsert({
      where: { code: PROFESSIONAL_LOAN_TEMPLATE_CODE },
      create: {
        code: PROFESSIONAL_LOAN_TEMPLATE_CODE,
        name: "专业借款合同模板（收益并入本金）",
        content: PROFESSIONAL_LOAN_TEMPLATE_HTML,
        variables: [...PROFESSIONAL_LOAN_TEMPLATE_VARIABLES],
        version: 1,
        isActive: true,
      },
      update: {
        content: PROFESSIONAL_LOAN_TEMPLATE_HTML,
        variables: [...PROFESSIONAL_LOAN_TEMPLATE_VARIABLES],
        isActive: true,
      },
    });
  }

  private static generateContractNo(prefix = "HT"): string {
    return (
      prefix +
      Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).slice(2, 6).toUpperCase()
    );
  }

  private static async buildMainContractDraft(
    applicationId: string,
    options?: MainContractOptions,
    mode: "preview" | "create" = "create"
  ): Promise<ServiceResponse<ContractDraftPayload>> {
    const application = await prisma.loanApplication.findUnique({
      where: { id: applicationId },
      include: { customer: true, product: true },
    });

    if (!application) {
      return { success: false, error: "借款申请不存在" };
    }

    if (application.status !== "APPROVED") {
      return { success: false, error: "只有审批通过的申请才能生成合同" };
    }

    if (mode === "create") {
      const existing = await prisma.contract.findFirst({
        where: { applicationId, contractType: "MAIN" },
      });

      if (existing) {
        return { success: false, error: "主合同已存在" };
      }
    }

    await this.ensureProfessionalTemplate();

    let template = await prisma.contractTemplate.findFirst({
      where: { isActive: true, code: PROFESSIONAL_LOAN_TEMPLATE_CODE },
      orderBy: { createdAt: "desc" },
    });

    if (!template) {
      template = await prisma.contractTemplate.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!template) {
      return { success: false, error: "系统未配置有效的合同模板" };
    }

    const contractNo =
      mode === "preview"
        ? this.generateContractNo("PREVIEW")
        : this.generateContractNo();

    const templateContent =
      template.code === PROFESSIONAL_LOAN_TEMPLATE_CODE
        ? PROFESSIONAL_LOAN_TEMPLATE_HTML
        : template.content;

    try {
      const rendered = buildRenderedContract({
        templateContent,
        contractNo,
        applicationNo: application.applicationNo,
        productName: application.product.name,
        customerName: application.customer.name,
        customerIdNumber: application.customer.idNumber,
        customerPhone: application.customer.phone,
        amount: Number(application.amount),
        termValue: application.termValue,
        termUnit: application.termUnit,
        options,
      });

      const variableNames =
        template.code === PROFESSIONAL_LOAN_TEMPLATE_CODE
          ? [...PROFESSIONAL_LOAN_TEMPLATE_VARIABLES]
          : parseVariableNames(templateContent);

      return {
        success: true,
        data: {
          contractNo,
          templateId: template.id,
          content: rendered.content,
          variableData: JSON.stringify({
            ...rendered.context,
            variables: variableNames,
            contractGenerationOptions: {
              basePrincipal: options?.basePrincipal ?? Number(application.amount),
              capitalizedInterestAmount: options?.capitalizedInterestAmount ?? 0,
              contractPrincipal:
                options?.contractPrincipal ??
                (options?.basePrincipal ?? Number(application.amount)) +
                  (options?.capitalizedInterestAmount ?? 0),
              contractDisplayInterestRate:
                options?.contractDisplayInterestRate ?? "2%",
              weeklyInterestAmount: options?.weeklyInterestAmount ?? "",
              monthlyInterestAmount: options?.monthlyInterestAmount ?? "",
            },
          }),
        },
      };
    } catch (error) {
      console.error("构建合同草稿失败:", error);
      return { success: false, error: "数据库操作失败" };
    }
  }

  static async getContractsByApplication(applicationId: string): Promise<ContractRecord[]> {
    return prisma.contract.findMany({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async previewMainContract(
    applicationId: string,
    options?: MainContractOptions
  ): Promise<
    ServiceResponse<{
      contractNo: string;
      content: string;
      variableData: string;
    }>
  > {
    const result = await this.buildMainContractDraft(applicationId, options, "preview");
    if (!result.success || !result.data) {
      return result as ServiceResponse<{
        contractNo: string;
        content: string;
        variableData: string;
      }>;
    }

    return {
      success: true,
      data: {
        contractNo: result.data.contractNo,
        content: result.data.content,
        variableData: result.data.variableData,
      },
    };
  }

  static async generateMainContract(
    applicationId: string,
    options?: MainContractOptions
  ): Promise<ServiceResponse<ContractRecord>> {
    const draft = await this.buildMainContractDraft(applicationId, options, "create");
    if (!draft.success || !draft.data) {
      return draft as ServiceResponse<ContractRecord>;
    }

    const application = await prisma.loanApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        customerId: true,
      },
    });

    if (!application) {
      return { success: false, error: "借款申请不存在" };
    }

    try {
      const contract = await prisma.contract.create({
        data: {
          contractNo: draft.data.contractNo,
          contractType: "MAIN",
          templateId: draft.data.templateId,
          content: draft.data.content,
          status: "DRAFT",
          applicationId: application.id,
          customerId: application.customerId,
          variableData: draft.data.variableData,
        },
      });

      return { success: true, data: contract };
    } catch (error) {
      console.error("生成合同失败:", error);
      return { success: false, error: "数据库操作失败" };
    }
  }

  static async signContract(contractId: string): Promise<ServiceResponse<ContractRecord>> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) return { success: false, error: "合同不存在" };
    if (contract.status !== "DRAFT") return { success: false, error: "合同状态不正确" };

    const updated = await prisma.contract.update({
      where: { id: contractId },
      data: {
        status: "SIGNED",
        signedAt: new Date(),
      },
    });

    if (contract.contractType === "MAIN") {
      await prisma.loanApplication.update({
        where: { id: contract.applicationId },
        data: { status: "CONTRACTED" },
      });
    }

    return { success: true, data: updated };
  }
}
