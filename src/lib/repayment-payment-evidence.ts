import { Prisma } from "@prisma/client";
import { z } from "zod";

const repaymentPaymentEvidenceSchema = z.object({
  transactionId: z
    .string()
    .trim()
    .min(3, "Transaction or receipt ID must contain at least 3 characters")
    .max(120, "Transaction or receipt ID cannot exceed 120 characters")
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
      "Transaction or receipt ID contains unsupported characters",
    ),
  payerBank: z.string().trim().min(2).max(120),
  payerAccount: z.string().trim().min(3).max(120),
  proofUrl: z
    .string()
    .trim()
    .url("Evidence link is invalid")
    .refine((value) => value.startsWith("https://"), "Evidence link must use HTTPS")
    .optional(),
  proofFileName: z.string().trim().max(160).optional(),
  proofMimeType: z.string().trim().max(100).optional(),
});

export type RepaymentPaymentEvidenceInput = z.infer<
  typeof repaymentPaymentEvidenceSchema
>;

export type ParsedRepaymentPaymentRequest = {
  values: Record<string, unknown>;
  proofFile: File | null;
};

export type RepaymentPaymentEvidenceResult =
  | {
      success: true;
      data: { input: RepaymentPaymentEvidenceInput; proofFile: File | null };
    }
  | { success: false; error: string; details?: unknown };

export function validateRepaymentPaymentEvidence(
  values: unknown,
  proofFile: File | null,
): RepaymentPaymentEvidenceResult {
  const parsed = repaymentPaymentEvidenceSchema.safeParse(values);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid repayment payment evidence",
      details: parsed.error.flatten(),
    };
  }

  if (!proofFile && !parsed.data.proofUrl) {
    return {
      success: false,
      error: "Upload payment evidence or provide an HTTPS evidence link",
    };
  }

  return { success: true, data: { input: parsed.data, proofFile } };
}

export async function parseRepaymentPaymentRequest(
  req: Request,
): Promise<ParsedRepaymentPaymentRequest> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const proofValue = formData.get("proof");
    const values = Object.fromEntries(formData.entries());
    delete values.proof;
    return {
      values,
      proofFile: proofValue && typeof proofValue !== "string" ? proofValue : null,
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    values: body && typeof body === "object" ? (body as Record<string, unknown>) : {},
    proofFile: null,
  };
}

export function isRepaymentTransactionConstraintError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = Array.isArray(error.meta?.target)
    ? error.meta.target.join(" ")
    : String(error.meta?.target ?? "");

  return target.includes("transaction_id") || target.includes("transactionId");
}
