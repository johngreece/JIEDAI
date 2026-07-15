import { z } from "zod";

const evidenceSchema = z.object({
  transactionId: z
    .string()
    .trim()
    .min(3, "Bank transaction ID must contain at least 3 characters")
    .max(120, "Bank transaction ID cannot exceed 120 characters")
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
      "Bank transaction ID contains unsupported characters",
    ),
  proofUrl: z
    .string()
    .trim()
    .url("Evidence link is invalid")
    .refine((value) => value.startsWith("https://"), "Evidence link must use HTTPS")
    .optional(),
  proofFileName: z.string().trim().max(160).optional(),
  proofMimeType: z.string().trim().max(100).optional(),
});

export type DisbursementEvidenceInput = z.infer<typeof evidenceSchema>;

export type ParsedDisbursementEvidence = {
  input: DisbursementEvidenceInput;
  proofFile: File | null;
};

export type DisbursementEvidenceParseResult =
  | { success: true; data: ParsedDisbursementEvidence }
  | { success: false; error: string; details?: unknown };

export function validateDisbursementEvidence(
  values: unknown,
  proofFile: File | null,
): DisbursementEvidenceParseResult {
  const parsed = evidenceSchema.safeParse(values);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid disbursement evidence",
      details: parsed.error.flatten(),
    };
  }

  if (!proofFile && !parsed.data.proofUrl) {
    return {
      success: false,
      error: "Upload bank evidence or provide an HTTPS evidence link",
    };
  }

  return {
    success: true,
    data: {
      input: parsed.data,
      proofFile,
    },
  };
}

export const validateBankTransactionEvidence = validateDisbursementEvidence;

export async function parseDisbursementEvidenceRequest(
  req: Request,
): Promise<DisbursementEvidenceParseResult> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData().catch(() => null);
    if (!formData) return { success: false, error: "Invalid multipart form data" };

    const proofValue = formData.get("proof");
    const proofFile =
      proofValue && typeof proofValue !== "string" ? proofValue : null;

    return validateDisbursementEvidence(
      {
        transactionId: formData.get("transactionId"),
        proofUrl: formData.get("proofUrl") || undefined,
        proofFileName: formData.get("proofFileName") || undefined,
        proofMimeType: formData.get("proofMimeType") || undefined,
      },
      proofFile,
    );
  }

  const body = await req.json().catch(() => ({}));
  return validateDisbursementEvidence(body, null);
}
