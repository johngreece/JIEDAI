export const PUBLIC_CLIENT_PRODUCT_CODES = ["UPFRONT_7D", "FULL_AMOUNT_7D"] as const;

export type PublicClientProductCode = (typeof PUBLIC_CLIENT_PRODUCT_CODES)[number];

export function isPublicClientProductCode(code: string): code is PublicClientProductCode {
  return PUBLIC_CLIENT_PRODUCT_CODES.includes(code as PublicClientProductCode);
}

export const PRODUCT_RULE_DISPLAY: Record<
  PublicClientProductCode,
  {
    title: string;
    summary: string;
    bullets: string[];
  }
> = {
  UPFRONT_7D: {
    title: "7天砍头息",
    summary: "借 10000 欧，放款先扣 5%，到账 9500 欧；7 天内任何时间还款，固定按 5% 成本执行。",
    bullets: [
      "到账示例：借 10000 欧，实际到账 9500 欧",
      "还款规则：7 天内任何时间还款，归还本金 10000 欧",
      "适合明确接受砍头息、追求固定成本的短期借款",
    ],
  },
  FULL_AMOUNT_7D: {
    title: "7天全额到账",
    summary: "借 10000 欧，到账 10000 欧；按还款时间分档计费，越早还成本越低。",
    bullets: [
      "5 小时内还款：2%",
      "24 小时内还款：3%",
      "48 小时内还款：4%",
      "超过 48 小时至 7 天内还款：6%",
    ],
  },
};

export const BUSINESS_LOAN_NOTICE = {
  title: "商业借款专案",
  summary: "用于日常商业经营的借款按月息 10% 处理，需要提前申请，不支持客户端即时放款。",
  bullets: [
    "需要律师签署协议，并由公证处盖章",
    "所有产生费用由借款人承担",
    "必须提供商业或房产担保",
    "该类借款需人工审核，不在本页即时申请流程内",
  ],
};
