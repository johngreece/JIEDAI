import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getAdminSession, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { paginatedResponse, parsePagination, toPrismaArgs } from "@/lib/pagination";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["INDIVIDUAL", "COMPANY", "PLATFORM"]).default("INDIVIDUAL"),
  contactPerson: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  profitShareRatio: z.number().min(0).max(1).optional(),
  remark: z.string().optional(),
  cooperationMode: z.enum(["FIXED_MONTHLY", "VOLUME_BASED"]).default("FIXED_MONTHLY"),
  monthlyRate: z.number().min(0).max(100).default(2),
  weeklyRate: z.number().min(0).max(100).default(1.5),
  loginPhone: z.string().min(1).optional(),
  loginPassword: z.string().min(6).optional(),
  priority: z.number().int().min(0).default(0),
  riskSharing: z.boolean().default(false),
  riskShareRatio: z.number().min(0).max(1).default(0),
  withdrawalCooldownDays: z.number().int().min(0).default(0),
});

function requireSuperAdminSession() {
  return getAdminSession().then((session) => {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isSuperAdmin(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return session;
  });
}

export async function GET(req: Request) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const url = new URL(req.url);
  const pagination = parsePagination(url);
  const isActive = url.searchParams.get("isActive");

  const where: Record<string, unknown> = { deletedAt: null };
  if (isActive !== null) where.isActive = isActive === "true";

  const [items, total] = await Promise.all([
    prisma.funder.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { accounts: true } } },
      ...toPrismaArgs(pagination),
    }),
    prisma.funder.count({ where }),
  ]);

  return NextResponse.json(
    paginatedResponse(
      items.map((funder) => ({
        ...funder,
        profitShareRatio: funder.profitShareRatio ? Number(funder.profitShareRatio) : null,
        monthlyRate: Number(funder.monthlyRate),
        weeklyRate: Number(funder.weeklyRate),
        riskShareRatio: Number(funder.riskShareRatio),
        accountCount: funder._count.accounts,
        _count: undefined,
        passwordHash: undefined,
      })),
      total,
      pagination
    )
  );
}

export async function POST(req: Request) {
  const session = await requireSuperAdminSession();
  if (session instanceof Response) return session;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const duplicate = await prisma.funder.findFirst({
    where: {
      OR: [
        { name: parsed.data.name, deletedAt: null },
        parsed.data.loginPhone ? { loginPhone: parsed.data.loginPhone, deletedAt: null } : undefined,
      ].filter(Boolean) as any,
    },
  });

  if (duplicate) {
    return NextResponse.json({ error: "资金方名称或登录手机号已存在" }, { status: 409 });
  }

  const { loginPassword, ...rest } = parsed.data;
  const createData: Record<string, unknown> = { ...rest };
  if (loginPassword) {
    createData.passwordHash = await bcrypt.hash(loginPassword, 10);
  }

  const funder = await prisma.funder.create({
    data: createData as never,
  });

  return NextResponse.json(
    {
      ...funder,
      profitShareRatio: funder.profitShareRatio ? Number(funder.profitShareRatio) : null,
      monthlyRate: Number(funder.monthlyRate),
      weeklyRate: Number(funder.weeklyRate),
      riskShareRatio: Number(funder.riskShareRatio),
      passwordHash: undefined,
    },
    { status: 201 }
  );
}
