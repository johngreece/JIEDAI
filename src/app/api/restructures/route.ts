import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";
import { apiError, apiSuccess, ErrorCodes } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await requirePermission(["loan:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const pagination = parsePagination(url);
  const status = url.searchParams.get("status") ?? undefined;
  const applicationId = url.searchParams.get("applicationId") ?? undefined;

  const where = {
    ...(status ? { status } : {}),
    ...(applicationId ? { applicationId } : {}),
  };

  const [list, total] = await Promise.all([
    prisma.restructure.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toPrismaArgs(pagination),
    }),
    prisma.restructure.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(list, total, pagination));
}

const createSchema = z.object({
  applicationId: z.string().min(1),
  remainingPrincipal: z.number().positive(),
  remainingInterest: z.number().min(0),
  newTermValue: z.number().int().min(1).max(360),
  newTermUnit: z.enum(["MONTH", "DAY"]).default("MONTH"),
  newRate: z.number().min(0).max(1),
  applyReason: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await requirePermission(["loan:create"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(ErrorCodes.VALIDATION_ERROR, parsed.error.flatten());
  }

  const { applicationId, remainingPrincipal, remainingInterest, newTermValue, newTermUnit, newRate, applyReason } = parsed.data;

  // 检查申请存在
  const app = await prisma.loanApplication.findUnique({ where: { id: applicationId } });
  if (!app) {
    return apiError(ErrorCodes.LOAN_NOT_FOUND);
  }

  // 检查无待审批的重组
  const pending = await prisma.restructure.findFirst({
    where: { applicationId, status: "PENDING" },
  });
  if (pending) {
    return apiError(ErrorCodes.CONFLICT);
  }

  const created = await prisma.restructure.create({
    data: {
      applicationId,
      remainingPrincipal,
      remainingInterest,
      newTermValue,
      newTermUnit,
      newRate,
      applyReason: applyReason ?? null,
    },
  });

  return apiSuccess({ id: created.id, status: created.status }, 201);
}
