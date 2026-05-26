import { describe, expect, it } from "vitest";
import {
  isValidSignatureDataUrl,
  stampCustomerSignatureOnContract,
} from "./contract-signature";

const signatureData =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

describe("contract signature stamping", () => {
  it("validates image data URLs used by canvas signatures", () => {
    expect(isValidSignatureDataUrl(signatureData)).toBe(true);
    expect(isValidSignatureDataUrl("javascript:alert(1)")).toBe(false);
  });

  it("stamps the customer signature into the standard empty signature box", () => {
    const html =
      '<div>乙方</div><div style="height: 96px; border: 1px dashed #94a3b8; margin-top: 10px;"></div>';

    const signed = stampCustomerSignatureOnContract(html, {
      signatureData,
      signerName: "张三",
      signedAt: new Date("2026-05-26T12:00:00.000Z"),
    });

    expect(signed).toContain('data-contract-customer-signature="true"');
    expect(signed).toContain(signatureData);
    expect(signed).toContain("签署人：张三");
    expect(signed).not.toContain('style="height: 96px; border: 1px dashed #94a3b8; margin-top: 10px;"></div>');
  });

  it("replaces an existing stamped block instead of appending duplicates", () => {
    const first = stampCustomerSignatureOnContract("<main>合同</main>", {
      signatureData,
      signerName: "张三",
      signedAt: new Date("2026-05-26T12:00:00.000Z"),
    });
    const second = stampCustomerSignatureOnContract(first, {
      signatureData,
      signerName: "李四",
      signedAt: new Date("2026-05-26T13:00:00.000Z"),
    });

    expect(second.match(/data-contract-customer-signature/g)?.length).toBe(1);
    expect(second).not.toContain("签署人：张三");
    expect(second).toContain("签署人：李四");
  });
});
