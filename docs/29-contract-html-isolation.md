# Contract HTML isolation

## Decision

Contract templates remain editable HTML because the internal workflow needs printable layout and inline signature images. Stored template and contract HTML is never mounted directly into an application page.

## Enforcement

- Template variables are HTML-escaped before they are inserted into generated contracts.
- Customer signing, administrator contract preview, and template preview all render through `ContractHtmlFrame`.
- The frame has an empty iframe sandbox and no-referrer policy.
- The generated frame document uses a fail-closed Content Security Policy. Scripts, network requests, forms, nested frames, objects, media, and base URL changes are denied. Inline styles and data images remain available for contract layout and signatures.
- `npm run check:invariants` rejects any new `dangerouslySetInnerHTML` use in application source and verifies the frame controls.

## Residual trust boundary

Users with `settings:edit` can author the visual and legal contents of a contract template. Their changes remain subject to existing authorization, template version increments, and audit logging. The browser isolation protects the surrounding application and session; operational approval of legal wording remains an internal control.
