const FULL_WIDTH_DIGITS = "０１２３４５６７８９";

function toAsciiPhoneChars(input: string) {
  return input.replace(/[０-９＋（）]/g, (char) => {
    if (char === "＋") return "+";
    if (char === "（") return "(";
    if (char === "）") return ")";
    const index = FULL_WIDTH_DIGITS.indexOf(char);
    return index >= 0 ? String(index) : char;
  });
}

export function normalizePhoneInput(input: string): string {
  return toAsciiPhoneChars(input)
    .trim()
    .replace(/[\s\-().]/g, "");
}

export function buildPhoneLookupCandidates(input: string): string[] {
  const normalized = normalizePhoneInput(input);
  const digits = normalized.replace(/^\+/, "");
  const candidates = new Set<string>();

  if (normalized) candidates.add(normalized);
  if (digits) candidates.add(digits);

  if (digits.startsWith("86") && digits.length > 11) {
    candidates.add(digits.slice(2));
  }

  if (digits.startsWith("30") && digits.length > 10) {
    candidates.add(digits.slice(2));
  }

  return [...candidates].filter(Boolean);
}
