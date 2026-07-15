import { Prisma } from "@prisma/client";
import { z } from "zod";

const capitalInflowEvidenceSchema = z.object({
  transactionId: z
    .string()
    .trim()
    .min(3, "Bank transaction ID must contain at least 3 characters")
    .max(120, "Bank transaction ID cannot exceed 120 characters")
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
      "Bank transaction ID contains unsupported characters",
    ),
  senderBank: z.string().trim().min(2).max(120),
  senderAccount: z.string().trim().min(3).max(120),
  proofUrl: z
    .string()
    .trim()
    .url("Evidence link is invalid")
    .refine((value) => value.startsWith("https://"), "Evidence link must use HTTPS")
    .optional(),
  proofFileName: z.string().trim().max(160).optional(),
  proofMimeType: z.string().trim().max(100).optional(),
});

export type CapitalInflowEvidenceInput = z.infer<typeof capitalInflowEvidenceSchema>;

export type ParsedCapitalInflowEvidence = {
  input: CapitalInflowEvidenceInput;
  proofFile: File | null;
};

export type CapitalInflowEvidenceParseResult =
  | { success: true; data: ParsedCapitalInflowEvidence }
  | { success: false; error: string; details?: unknown };

export function validateCapitalInflowEvidence(
  values: unknown,
  proofFile: File | null,
): CapitalInflowEvidenceParseResult {
  const parsed = capitalInflowEvidenceSchema.safeParse(values);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid capital inflow bank evidence",
      details: parsed.error.flatten(),
    };
  }

  if (!proofFile && !parsed.data.proofUrl) {
    return {
      success: false,
      error: "Upload bank evidence or provide an HTTPS evidence link",
    };
  }

  return { success: true, data: { input: parsed.data, proofFile } };
}

export async function parseCapitalInflowEvidenceRequest(
  req: Request,
): Promise<CapitalInflowEvidenceParseResult> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData().catch(() => null);
    if (!formData) return { success: false, error: "Invalid multipart form data" };

    const proofValue = formData.get("proof");
    const proofFile = proofValue && typeof proofValue !== "string" ? proofValue : null;
    return validateCapitalInflowEvidence(
      {
        transactionId: formData.get("transactionId"),
        senderBank: formData.get("senderBank"),
        senderAccount: formData.get("senderAccount"),
        proofUrl: formData.get("proofUrl") || undefined,
        proofFileName: formData.get("proofFileName") || undefined,
        proofMimeType: formData.get("proofMimeType") || undefined,
      },
      proofFile,
    );
  }

  const body = await req.json().catch(() => ({}));
  return validateCapitalInflowEvidence(body, null);
}

export function isCapitalInflowTransactionConstraintError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = Array.isArray(error.meta?.target)
    ? error.meta.target.join(" ")
    : String(error.meta?.target ?? "");

  return target.includes("fund_account_id") && target.includes("transaction_id");
}
