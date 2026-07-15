import { describe, expect, it } from "vitest";
import {
  buildIsolatedContractDocument,
  CONTRACT_HTML_CONTENT_SECURITY_POLICY,
} from "./contract-html";

describe("isolated contract document", () => {
  it("applies a fail-closed policy before rendering stored contract content", () => {
    const malicious = '<script>parent.document.body.textContent = "owned"</script>';
    const document = buildIsolatedContractDocument(malicious);

    expect(document.indexOf("Content-Security-Policy")).toBeLessThan(document.indexOf(malicious));
    expect(CONTRACT_HTML_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(CONTRACT_HTML_CONTENT_SECURITY_POLICY).toContain("script-src 'none'");
    expect(CONTRACT_HTML_CONTENT_SECURITY_POLICY).toContain("connect-src 'none'");
    expect(CONTRACT_HTML_CONTENT_SECURITY_POLICY).toContain("form-action 'none'");
    expect(CONTRACT_HTML_CONTENT_SECURITY_POLICY).toContain("img-src data:");
  });

  it("keeps contract formatting and signature data available inside the isolated document", () => {
    const content = '<style>.amount{font-weight:700}</style><p class="amount">EUR 100</p><img src="data:image/png;base64,AA==">';
    const document = buildIsolatedContractDocument(content);

    expect(document).toContain(content);
    expect(document).toContain('name="referrer" content="no-referrer"');
  });
});
