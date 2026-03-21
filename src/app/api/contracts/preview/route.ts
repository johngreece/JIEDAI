import { NextResponse } from "next/server";
import { z } from "zod";
import { ContractService } from "@/services/contract.service";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  applicationId: z.string().min(1),
  basePrincipal: z.number().positive().optional(),
  capitalizedInterestAmount: z.number().min(0).optional(),
  contractPrincipal: z.number().positive().optional(),
  contractDisplayInterestRate: z.string().min(1).optional(),
  weeklyInterestAmount: z.string().optional(),
  monthlyInterestAmount: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await requirePermission(["contract:generate"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数错误", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { applicationId, ...options } = parsed.data;
    const result = await ContractService.previewMainContract(applicationId, options);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      preview: result.data,
    });
  } catch (error) {
    console.error("合同预览接口异常:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
