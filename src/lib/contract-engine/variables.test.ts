import { describe, it, expect } from "vitest";
import {
  parseVariableNames,
  fillTemplate,
  validateRequired,
  buildContractContext,
} from "./variables";

describe("contract variable engine", () => {
  it("parseVariableNames extracts variable names", () => {
    const html = "甲方：{{ customer_name }}，借款金额 {{ loan_amount }} 欧元。";
    expect(parseVariableNames(html)).toEqual(
      expect.arrayContaining(["customer_name", "loan_amount"])
    );
    expect(parseVariableNames(html).length).toBe(2);
  });

  it("fillTemplate replaces placeholders", () => {
    const html = "甲方：{{ customer_name }}，金额 {{ loan_amount }} 欧元。";
    const out = fillTemplate(html, {
      customer_name: "张三",
      loan_amount: "100,000.00",
    });
    expect(out).toBe("甲方：张三，金额 100,000.00 欧元。");
  });

  it("fillTemplate uses empty string for missing vars", () => {
    const html = "{{ a }} {{ b }}";
    expect(fillTemplate(html, { a: "1" })).toBe("1 ");
  });

  it("validateRequired returns missing list", () => {
    const ctx = { a: "1", b: "" };
    const r = validateRequired(ctx, ["a", "b", "c"]);
    expect(r.valid).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(["b", "c"]));
  });

  it("buildContractContext returns all standard vars", () => {
    const ctx = buildContractContext({
      customerName: "李四",
      loanAmount: "50000.00",
      termValue: 12,
      termUnit: "月",
      interestRate: "10%",
      serviceFee: "500.00",
      totalRepay: "55500.00",
      contractNo: "HT001",
    });
    expect(ctx.customer_name).toBe("李四");
    expect(ctx.loan_amount).toBe("50000.00");
    expect(ctx.contract_no).toBe("HT001");
  });
});
