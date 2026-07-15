export const CONTRACT_HTML_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "media-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "img-src data:",
  "font-src data:",
  "style-src 'unsafe-inline'",
].join("; ");

export function buildIsolatedContractDocument(content: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${CONTRACT_HTML_CONTENT_SECURITY_POLICY}" />
    <meta name="referrer" content="no-referrer" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; min-height: 100%; background: #fff; color: #0f172a; }
      body { box-sizing: border-box; padding: 16px; overflow-wrap: anywhere; }
      *, *::before, *::after { box-sizing: border-box; }
      img { max-width: 100%; }
    </style>
  </head>
  <body>${content}</body>
</html>`;
}
