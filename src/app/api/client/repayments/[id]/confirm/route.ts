import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveClientSession } from "@/lib/portal-session";
import { confirmRepayment } from "@/lib/repayment-confirm";

export const dynamic = "force-dynamic";

const confirmedAmountSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value), {
    message: "Amount must be a positive number with up to four decimal places",
  })
  .refine((value) => Number(value) > 0, { message: "Amount must be greater than zero" });

const bodySchema = z
  .object({
    action: z.enum(["CONFIRMED", "DECLARED_PAID", "REJECTED"]).default("DECLARED_PAID"),
    confirmedAmount: confirmedAmountSchema.optional(),
    signatureData: z.string().optional(),
    rejectReason: z.string().optional(),
    deviceInfo: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.action !== "REJECTED" && !value.confirmedAmount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmedAmount"],
        message: "Confirmed amount is required",
      });
    }
  });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireActiveClientSession();
  if (session instanceof Response) return session;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await confirmRepayment({
      repaymentId: id,
      customerId: session.sub,
      action: parsed.data.action,
      confirmedAmount: parsed.data.confirmedAmount,
      signatureData: parsed.data.signatureData,
      rejectReason: parsed.data.rejectReason,
      ipAddress: ip,
      deviceInfo: parsed.data.deviceInfo,
    });

    return NextResponse.json({
      ok: true,
      status: parsed.data.action === "REJECTED" ? "REJECTED" : "CUSTOMER_CONFIRMED",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Confirm failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
