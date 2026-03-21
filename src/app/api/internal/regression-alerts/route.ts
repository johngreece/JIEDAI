import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RegressionAlertService } from "@/services/regression-alert.service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.string().min(1),
  workflow: z.string().min(1),
  repository: z.string().min(1),
  branch: z.string().min(1),
  sha: z.string().min(1),
  actor: z.string().optional(),
  runId: z.string().optional(),
  runNumber: z.string().optional(),
  runUrl: z.string().optional(),
  failedJob: z.string().optional(),
  summary: z.string().optional(),
  triggeredAt: z.string().optional(),
});

function isAuthorized(req: NextRequest) {
  const token = process.env.REGRESSION_ALERT_TOKEN;
  if (!token) return false;

  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader === `Bearer ${token}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await RegressionAlertService.notifyFailure(parsed.data);
  return NextResponse.json({ ok: true, result });
}
