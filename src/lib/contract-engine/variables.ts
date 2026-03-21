/**
 * Contract template variable engine
 * - placeholder format: {{ variableName }}
 * - generated HTML can be stored directly in contract.content
 * - raw variables can be snapshotted into contract.variableData
 */

const PLACEHOLDER_REGEX = /\{\{\s*(\w+)\s*\}\}/g;

export type VariableContext = Record<string, string | number | boolean | null | undefined>;

export function parseVariableNames(html: string): string[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");

  while ((match = regex.exec(html)) !== null) {
    names.add(match[1]);
  }

  return Array.from(names);
}

export function fillTemplate(html: string, context: VariableContext): string {
  return html.replace(PLACEHOLDER_REGEX, (_, name: string) => {
    const value = context[name];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

export function validateRequired(
  context: VariableContext,
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing = required.filter((key) => {
    const value = context[key];
    return value === undefined || value === null || String(value).trim() === "";
  });

  return { valid: missing.length === 0, missing };
}

export const CONTRACT_VARS = {
  platform_name: "platform_name",
  lender_name: "lender_name",
  application_no: "application_no",
  product_name: "product_name",
  customer_name: "customer_name",
  customer_id_number: "customer_id_number",
  customer_phone: "customer_phone",
  loan_amount: "loan_amount",
  loan_amount_cn: "loan_amount_cn",
  base_principal: "base_principal",
  weekly_interest_amount: "weekly_interest_amount",
  monthly_interest_amount: "monthly_interest_amount",
  capitalized_interest_amount: "capitalized_interest_amount",
  contract_principal: "contract_principal",
  contract_display_interest_rate: "contract_display_interest_rate",
  contract_display_interest_note: "contract_display_interest_note",
  disbursement_amount: "disbursement_amount",
  term_value: "term_value",
  term_unit: "term_unit",
  interest_rate: "interest_rate",
  service_fee: "service_fee",
  total_repay: "total_repay",
  repay_schedule_summary: "repay_schedule_summary",
  legal_service_basis: "legal_service_basis",
  dispute_resolution_court: "dispute_resolution_court",
  sign_date: "sign_date",
  sign_time: "sign_time",
  sign_location: "sign_location",
  contract_no: "contract_no",
} as const;

export function buildContractContext(params: {
  platformName?: string;
  lenderName?: string;
  applicationNo?: string;
  productName?: string;
  customerName: string;
  idNumber?: string;
  phone?: string;
  loanAmount: string;
  loanAmountCn?: string;
  basePrincipal?: string;
  weeklyInterestAmount?: string;
  monthlyInterestAmount?: string;
  capitalizedInterestAmount?: string;
  contractPrincipal?: string;
  contractDisplayInterestRate?: string;
  contractDisplayInterestNote?: string;
  disbursementAmount?: string;
  termValue: number;
  termUnit: string;
  interestRate: string;
  serviceFee: string;
  totalRepay: string;
  repaySummary?: string;
  legalServiceBasis?: string;
  disputeResolutionCourt?: string;
  contractNo: string;
  signDate?: string;
  signTime?: string;
  signLocation?: string;
}): VariableContext {
  return {
    platform_name: params.platformName ?? "平台指定服务方",
    lender_name: params.lenderName ?? "甲方指定出借主体",
    application_no: params.applicationNo ?? "",
    product_name: params.productName ?? "",
    customer_name: params.customerName,
    customer_id_number: params.idNumber ?? "",
    customer_phone: params.phone ?? "",
    loan_amount: params.loanAmount,
    loan_amount_cn: params.loanAmountCn ?? params.loanAmount,
    base_principal: params.basePrincipal ?? params.loanAmount,
    weekly_interest_amount: params.weeklyInterestAmount ?? "待确认",
    monthly_interest_amount: params.monthlyInterestAmount ?? "待确认",
    capitalized_interest_amount: params.capitalizedInterestAmount ?? "0.00",
    contract_principal: params.contractPrincipal ?? params.loanAmount,
    contract_display_interest_rate: params.contractDisplayInterestRate ?? "2%",
    contract_display_interest_note:
      params.contractDisplayInterestNote ??
      "该 2% 仅用于合同文本列示与法律依据，不参与系统正常利息重复计算。",
    disbursement_amount: params.disbursementAmount ?? params.loanAmount,
    term_value: params.termValue,
    term_unit: params.termUnit,
    interest_rate: params.interestRate,
    service_fee: params.serviceFee,
    total_repay: params.totalRepay,
    repay_schedule_summary: params.repaySummary ?? "",
    legal_service_basis:
      params.legalServiceBasis ??
      "依据双方签约确认的借款安排、平台服务安排及补充条款执行。",
    dispute_resolution_court:
      params.disputeResolutionCourt ?? "有管辖权的人民法院/当地有管辖权法院",
    contract_no: params.contractNo,
    sign_date: params.signDate ?? "",
    sign_time: params.signTime ?? "",
    sign_location: params.signLocation ?? "",
  };
}
