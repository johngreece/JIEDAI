const CUSTOMER_SIGNATURE_START = "<!-- CUSTOMER_SIGNATURE_BLOCK_START -->";
const CUSTOMER_SIGNATURE_END = "<!-- CUSTOMER_SIGNATURE_BLOCK_END -->";

const EMPTY_SIGNATURE_BOX_REGEX =
  /<div\s+style="height:\s*96px;\s*border:\s*1px\s+dashed\s+#94a3b8;\s*margin-top:\s*10px;\s*">\s*<\/div>/i;

const SIGNATURE_CONTAINER_STYLE =
  "height: 96px; border: 1px dashed #94a3b8; margin-top: 10px; display: flex; flex-direction: column; justify-content: center; padding: 6px 10px; box-sizing: border-box;";

export type CustomerSignatureStamp = {
  signatureData: string;
  signerName: string;
  signedAt: Date;
};

export function isValidSignatureDataUrl(
  value: string | null | undefined
): value is string {
  return /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(value ?? "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSignedAt(value: Date) {
  return value.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function buildCustomerSignatureBlock(stamp: CustomerSignatureStamp) {
  const signerName = escapeHtml(stamp.signerName || "客户本人");
  const signedAt = escapeHtml(formatSignedAt(stamp.signedAt));

  return `${CUSTOMER_SIGNATURE_START}<div data-contract-customer-signature="true" style="width: 100%; text-align: left;">
  <img src="${stamp.signatureData}" alt="乙方电子签名" style="display: block; max-width: 220px; max-height: 56px; object-fit: contain;" />
  <div style="margin-top: 4px; color: #475569; font-size: 12px; line-height: 1.4;">签署人：${signerName}；签署时间：${signedAt}</div>
</div>${CUSTOMER_SIGNATURE_END}`;
}

export function stampCustomerSignatureOnContract(
  content: string,
  stamp: CustomerSignatureStamp
) {
  if (!isValidSignatureDataUrl(stamp.signatureData)) {
    throw new Error("签名图片格式不正确");
  }

  const block = buildCustomerSignatureBlock(stamp);
  const existingStart = content.indexOf(CUSTOMER_SIGNATURE_START);
  const existingEnd = content.indexOf(CUSTOMER_SIGNATURE_END);

  if (existingStart >= 0 && existingEnd > existingStart) {
    return (
      content.slice(0, existingStart) +
      block +
      content.slice(existingEnd + CUSTOMER_SIGNATURE_END.length)
    );
  }

  if (EMPTY_SIGNATURE_BOX_REGEX.test(content)) {
    return content.replace(
      EMPTY_SIGNATURE_BOX_REGEX,
      `<div style="${SIGNATURE_CONTAINER_STYLE}">${block}</div>`
    );
  }

  const signatureSection = `<div class="signature" style="margin-top: 40px;">
  <div style="${SIGNATURE_CONTAINER_STYLE}">${block}</div>
</div>`;

  if (/<\/body>/i.test(content)) {
    return content.replace(/<\/body>/i, `${signatureSection}\n  </body>`);
  }

  return `${content}\n${signatureSection}`;
}
