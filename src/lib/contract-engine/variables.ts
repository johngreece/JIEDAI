/**
 * 合同模板变量引擎
 * - 占位符格式: {{ variableName }}
 * - 填充后生成最终 HTML，变量快照可存 contract.variables_snapshot
 */

const PLACEHOLDER_REGEX = /\{\{\s*(\w+)\s*\}\}/g;

export type VariableContext = Record<string, string | number | boolean | null | undefined>;

/**
 * 从模板 HTML 中解析出所有变量名
 */
export function parseVariableNames(html: string): string[] {
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_REGEX.source, "g");
  while ((m = re.exec(html)) !== null) {
    names.add(m[1]);
  }
  return Array.from(names);
}

/**
 * 用上下文替换模板中的占位符
 * 缺失的变量替换为空字符串
 */
export function fillTemplate(html: string, context: VariableContext): string {
  return html.replace(PLACEHOLDER_REGEX, (_, name: string) => {
    const value = context[name];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

/**
 * 校验必填变量是否都有值
 */
export function validateRequired(
  context: VariableContext,
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing = required.filter((key) => {
    const v = context[key];
    return v === undefined || v === null || String(v).trim() === "";
  });
  return { valid: missing.length === 0, missing };
}

/**
 * 常用变量名常量，与文档 07 一致
 */
export const CONTRACT_VARS = {
  customer_name: "customer_name",
  customer_id_number: "customer_id_number",
  customer_phone: "customer_phone",
  loan_amount: "loan_amount",
  loan_amount_cn: "loan_amount_cn",
  term_value: "term_value",
  term_unit: "term_unit",
  interest_rate: "interest_rate",
  service_fee: "service_fee",
  total_repay: "total_repay",
  repay_schedule_summary: "repay_schedule_summary",
  sign_date: "sign_date",
  sign_time: "sign_time",
  sign_location: "sign_location",
  contract_no: "contract_no",
} as const;

/**
 * 将业务数据映射为合同变量上下文（示例）
 */
export function buildContractContext(params: {
  customerName: string;
  idNumber?: string;
  phone?: string;
  loanAmount: string;
  loanAmountCn?: string;
  termValue: number;
  termUnit: string;
  interestRate: string;
  serviceFee: string;
  totalRepay: string;
  repaySummary?: string;
  contractNo: string;
  signDate?: string;
  signTime?: string;
  signLocation?: string;
}): VariableContext {
  return {
    customer_name: params.customerName,
    customer_id_number: params.idNumber ?? "",
    customer_phone: params.phone ?? "",
    loan_amount: params.loanAmount,
    loan_amount_cn: params.loanAmountCn ?? params.loanAmount,
    term_value: params.termValue,
    term_unit: params.termUnit,
    interest_rate: params.interestRate,
    service_fee: params.serviceFee,
    total_repay: params.totalRepay,
    repay_schedule_summary: params.repaySummary ?? "",
    contract_no: params.contractNo,
    sign_date: params.signDate ?? "",
    sign_time: params.signTime ?? "",
    sign_location: params.signLocation ?? "",
  };
}
