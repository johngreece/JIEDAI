import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { resolveLoanContractTerms } from "@/lib/loan-contract-terms";
import { parsePagination, toPrismaArgs, paginatedResponse } from "@/lib/pagination";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  customerId: z.string().min(1),
  productId: z.string().min(1),
  amount: z.number().positive(),
  termValue: z.number().int().positive(),
  termUnit: z.string().min(1).default("MONTH"),
  purpose: z.string().optional(),
  remark: z.string().optional(),
});

function genApplicationNo() {
  return `LA${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function GET(req: Request) {
  const session = await requirePermission(["loan:view"]);
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const pagination = parsePagination(url);

  const where = {
    deletedAt: null,
    ...(status ? { status } : {}),
  };

  const [list, total] = await Promise.all([
    prisma.loanApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        product: { select: { id: true, name: true } },
        contracts: {
          where: { contractType: "MAIN", status: "SIGNED", deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            variableData: true,
            currency: true,
            basePrincipal: true,
            capitalizedInterestAmount: true,
            contractPrincipal: true,
            legalServiceFee: true,
            feePaymentMode: true,
          },
        },
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.loanApplication.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(
    list.map((x: {
      id: string;
      applicationNo: string;
      status: string;
      amount: unknown;
      termValue: number;
      termUnit: string;
      customer: { id: string; name: string; phone: string };
      product: { id: string; name: string };
      contracts: Array<{
        variableData: string | null;
        currency: string;
        basePrincipal: unknown | null;
        capitalizedInterestAmount: unknown | null;
        contractPrincipal: unknown | null;
        legalServiceFee: unknown | null;
        feePaymentMode: string | null;
      }>;
      createdAt: Date;
    }) => ({
      id: x.id,
      applicationNo: x.applicationNo,
      status: x.status,
      amount: Number(x.amount),
      termValue: x.termValue,
      termUnit: x.termUnit,
      customer: x.customer,
      product: x.product,
      contractTerms: x.contracts[0]
        ? resolveLoanContractTerms(x.contracts[0], x.amount)
        : null,
      createdAt: x.createdAt,
    })),
    total,
    pagination,
  ));
}

export async function POST(req: Request) {
  const session = await requirePermission(["loan:create"]);
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;

  const [customer, product] = await Promise.all([
    prisma.customer.findFirst({ where: { id: input.customerId, deletedAt: null }, select: { id: true } }),
    prisma.loanProduct.findFirst({ where: { id: input.productId, deletedAt: null }, select: { id: true } }),
  ]);

  if (!customer) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }
  if (!product) {
    return NextResponse.json({ error: "借款产品不存在" }, { status: 404 });
  }

  const created = await prisma.loanApplication.create({
    data: {
      applicationNo: genApplicationNo(),
      customerId: input.customerId,
      productId: input.productId,
      amount: input.amount,
      termValue: input.termValue,
      termUnit: input.termUnit,
      purpose: input.purpose ?? null,
      status: "DRAFT",
      createdById: session.sub,
      remark: input.remark ?? null,
    },
  });

  await writeAuditLog({
    userId: session.sub,
    action: "create",
    entityType: "loan_application",
    entityId: created.id,
    newValue: {
      applicationNo: created.applicationNo,
      status: created.status,
      amount: Number(created.amount),
    },
    changeSummary: "创建借款申请",
  }).catch((e) => console.error("[AuditLog] loan-application-create", e));

  return NextResponse.json({
    id: created.id,
    applicationNo: created.applicationNo,
    status: created.status,
  });
}
