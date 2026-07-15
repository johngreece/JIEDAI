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
import { applyCustomerPricingOverride, buildCustomerPricingQuote } from "@/lib/customer-pricing";
import { parseTiersFromPricingRules } from "@/lib/interest-engine";
import { SYSTEM_CURRENCY } from "@/lib/system-config";
import {
  LoanContractTermsError,
  buildLoanContractTerms,
  type LoanContractTerms,
} from "@/lib/loan-contract-terms";
import {
  formatClientProfileCompletionError,
  getClientProfileCompletion,
} from "@/lib/client-profile";

type ContractRecord = NonNullable<Awaited<ReturnType<typeof prisma.contract.findFirst>>>;

export type MainContractOptions = {
  basePrincipal?: number;
  capitalizedInterestAmount?: number;
  contractPrincipal?: number;
  legalServiceFee?: number;
  contractDisplayInterestRate?: string;
  weeklyInterestAmount?: string;
  monthlyInterestAmount?: string;
};

type ContractDraftPayload = {
  contractNo: string;
  templateId: string;
  variableData: string;
  content: string;
  terms: LoanContractTerms;
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

function buildRenderedContract(params: {
  templateContent: string;
  contractNo: string;
  applicationNo: string;
  productName: string;
  customerName: string;
  customerIdNumber?: string | null;
  customerPhone?: string | null;
  termValue: number;
  termUnit: string;
  terms: LoanContractTerms;
  options?: MainContractOptions;
}) {
  const today = new Date();
  const signDate = today.toLocaleDateString("zh-CN");
  const signTime = today.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const {
    basePrincipal,
    capitalizedInterestAmount,
    contractPrincipal,
    legalServiceFee,
    netDisbursementAmount,
    totalPayable,
  } = params.terms;
  const contractDisplayInterestRate = params.options?.contractDisplayInterestRate || "2%";

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
    disbursementAmount: money(netDisbursementAmount),
    termValue: params.termValue,
    termUnit: formatTermUnit(params.termUnit),
    interestRate: "正常利息已按业务规则并入本金",
    serviceFee: money(legalServiceFee),
    contractDisplayInterestRate,
    contractDisplayInterestNote:
      "仅用于合同展示和法律依据，不参与系统正常利息重复计算。",
    totalRepay: money(totalPayable),
    repaySummary: `${params.termValue}${formatTermUnit(params.termUnit)}，总应还 EUR ${money(totalPayable)}，最终以生成后的还款计划为准`,
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
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            taxNumber: true,
            idNumber: true,
            passportNumber: true,
            residencePermitNumber: true,
            residencePermitExpiry: true,
            profileCompletedAt: true,
            weeklyInterestRateOverride: true,
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
        product: {
          include: {
            pricingRules: {
              where: { isActive: true },
              orderBy: { priority: "desc" },
            },
          },
        },
      },
    });

    if (!application) {
      return { success: false, error: "借款申请不存在" };
    }

    if (application.status !== "APPROVED") {
      return { success: false, error: "只有审批通过的申请才能生成合同" };
    }

    const profileCompletion = getClientProfileCompletion(application.customer);
    if (!profileCompletion.profileComplete) {
      return {
        success: false,
        error: formatClientProfileCompletionError(profileCompletion, "客户资料未完善，不能生成合同"),
      };
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

    const pricingConfig = applyCustomerPricingOverride(
      parseTiersFromPricingRules(application.product.pricingRules),
      application.customer,
    );
    const pricingQuote = buildCustomerPricingQuote(Number(application.amount), pricingConfig);
    const resolvedOptions: MainContractOptions = {
      ...options,
      contractDisplayInterestRate:
        options?.contractDisplayInterestRate ?? pricingQuote.contractDisplayInterestRate,
      weeklyInterestAmount: options?.weeklyInterestAmount ?? pricingQuote.weeklyInterestAmount,
      monthlyInterestAmount: options?.monthlyInterestAmount ?? pricingQuote.monthlyInterestAmount,
    };

    try {
      const terms = buildLoanContractTerms({
        basePrincipal: options?.basePrincipal ?? Number(application.amount),
        capitalizedInterestAmount: options?.capitalizedInterestAmount ?? 0,
        contractPrincipal: options?.contractPrincipal,
        legalServiceFee: options?.legalServiceFee ?? 0,
        feePaymentMode: pricingConfig.channel,
        currency: SYSTEM_CURRENCY,
      });
      if (
        application.totalApprovedAmount != null &&
        terms.basePrincipal > Number(application.totalApprovedAmount)
      ) {
        return { success: false, error: "基础本金不能超过审批额度" };
      }

      const rendered = buildRenderedContract({
        templateContent,
        contractNo,
        applicationNo: application.applicationNo,
        productName: application.product.name,
        customerName: application.customer.name,
        customerIdNumber: application.customer.idNumber,
        customerPhone: application.customer.phone,
        termValue: application.termValue,
        termUnit: application.termUnit,
        terms,
        options: resolvedOptions,
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
              currency: terms.currency,
              basePrincipal: terms.basePrincipal,
              capitalizedInterestAmount: terms.capitalizedInterestAmount,
              contractPrincipal: terms.contractPrincipal,
              legalServiceFee: terms.legalServiceFee,
              feePaymentMode: terms.feePaymentMode,
              netDisbursementAmount: terms.netDisbursementAmount,
              totalPayable: terms.totalPayable,
              contractDisplayInterestRate: resolvedOptions.contractDisplayInterestRate,
              weeklyInterestAmount: resolvedOptions.weeklyInterestAmount ?? "",
              monthlyInterestAmount: resolvedOptions.monthlyInterestAmount ?? "",
              pricingQuote,
            },
          }),
          terms,
        },
      };
    } catch (error) {
      if (error instanceof LoanContractTermsError) {
        return { success: false, error: error.message };
      }
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
      return { success: false, error: draft.error ?? "生成合同失败" };
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
          currency: draft.data.terms.currency,
          basePrincipal: draft.data.terms.basePrincipal,
          capitalizedInterestAmount: draft.data.terms.capitalizedInterestAmount,
          contractPrincipal: draft.data.terms.contractPrincipal,
          legalServiceFee: draft.data.terms.legalServiceFee,
          feePaymentMode: draft.data.terms.feePaymentMode,
        },
      });

      return { success: true, data: contract };
    } catch (error) {
      console.error("生成合同失败:", error);
      return { success: false, error: "数据库操作失败" };
    }
  }

}
