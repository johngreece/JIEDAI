import { prisma } from "@/lib/prisma";
import { paginatedResponse, type PaginatedResult, type PaginationParams, toPrismaArgs } from "@/lib/pagination";

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string;
  idType: string;
  idNumber: string;
  email: string | null;
  riskLevel: string;
  source: string | null;
  createdAt: Date;
};

export type LoanApplicationListItem = {
  id: string;
  applicationNo: string;
  status: string;
  amount: number;
  termValue: number;
  termUnit: string;
  createdAt: Date;
  customer: { id: string; name: string; phone: string };
  product: { id: string; name: string };
};

export type RepaymentPlanPrefetchItem = {
  id: string;
  planNo: string;
  status: string;
  application: null | {
    id: string;
    applicationNo: string;
    customer: { name: string; phone: string };
    product: { name: string };
  };
};

export type RepaymentPrefetchItem = {
  id: string;
  repaymentNo: string;
  amount: number;
  status: string;
  paymentMethod?: string;
  receivedAt?: Date | null;
  plan: { id: string; planNo: string; applicationId: string };
  application: null | { applicationNo: string; customer: { name: string; phone: string } };
  allocations?: Array<{ id: string; itemId: string; amount: number; type: string }>;
};

export type FunderPrefetchItem = {
  id: string;
  name: string;
  type: string;
  contactPerson: string | null;
  contactPhone: string | null;
  profitShareRatio: number | null;
  cooperationMode: string;
  monthlyRate: number;
  weeklyRate: number;
  loginPhone: string | null;
  priority: number;
  riskSharing: boolean;
  riskShareRatio: number;
  withdrawalCooldownDays: number;
  isActive: boolean;
  accountCount: number;
  createdAt: Date;
};

export async function getCustomersList({
  page = 1,
  pageSize = 20,
  keyword,
  riskLevel,
}: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  riskLevel?: string;
}): Promise<PaginatedResult<CustomerListItem>> {
  const pagination: PaginationParams = { page, pageSize };
  const where: Record<string, unknown> = { deletedAt: null };

  if (keyword) {
    where.OR = [
      { name: { contains: keyword } },
      { phone: { contains: keyword } },
      { idNumber: { contains: keyword } },
    ];
  }

  if (riskLevel) {
    where.riskLevel = riskLevel;
  }

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        idType: true,
        idNumber: true,
        email: true,
        riskLevel: true,
        source: true,
        createdAt: true,
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.customer.count({ where }),
  ]);

  return paginatedResponse(items, total, pagination);
}

export async function getLoanApplicationsList({
  page = 1,
  pageSize = 20,
  status,
}: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<PaginatedResult<LoanApplicationListItem>> {
  const pagination: PaginationParams = { page, pageSize };
  const where = {
    deletedAt: null,
    ...(status && status !== "ALL" ? { status } : {}),
  };

  const [list, total] = await Promise.all([
    prisma.loanApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        product: { select: { id: true, name: true } },
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.loanApplication.count({ where }),
  ]);

  return paginatedResponse(
    list.map((item) => ({
      id: item.id,
      applicationNo: item.applicationNo,
      status: item.status,
      amount: Number(item.amount),
      termValue: item.termValue,
      termUnit: item.termUnit,
      createdAt: item.createdAt,
      customer: item.customer,
      product: item.product,
    })),
    total,
    pagination,
  );
}

export async function getActiveRepaymentPlans(): Promise<RepaymentPlanPrefetchItem[]> {
  const plans = await prisma.repaymentPlan.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const apps = plans.length
    ? await prisma.loanApplication.findMany({
        where: { id: { in: plans.map((item) => item.applicationId) } },
        select: {
          id: true,
          applicationNo: true,
          customer: { select: { name: true, phone: true } },
          product: { select: { name: true } },
        },
      })
    : [];

  const appMap = new Map(apps.map((item) => [item.id, item]));

  return plans.map((item) => ({
    id: item.id,
    planNo: item.planNo,
    status: item.status,
    application: appMap.get(item.applicationId) ?? null,
  }));
}

export async function getRepaymentsList({
  page = 1,
  pageSize = 20,
  status,
}: {
  page?: number;
  pageSize?: number;
  status?: string;
} = {}): Promise<PaginatedResult<RepaymentPrefetchItem>> {
  const pagination: PaginationParams = { page, pageSize };
  const where = {
    ...(status ? { status } : {}),
  };

  const [list, total] = await Promise.all([
    prisma.repayment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { id: true, planNo: true, applicationId: true } },
        operator: { select: { id: true, username: true, realName: true } },
      },
      ...toPrismaArgs(pagination),
    }),
    prisma.repayment.count({ where }),
  ]);

  const appIds = list.map((item) => item.plan.applicationId);
  const apps = appIds.length
    ? await prisma.loanApplication.findMany({
        where: { id: { in: appIds } },
        select: {
          id: true,
          applicationNo: true,
          customer: { select: { id: true, name: true, phone: true } },
          product: { select: { id: true, name: true } },
        },
      })
    : [];

  const appMap = new Map(apps.map((item) => [item.id, item]));

  return paginatedResponse(
    list.map((item) => ({
      id: item.id,
      repaymentNo: item.repaymentNo,
      status: item.status,
      amount: Number(item.amount),
      paymentMethod: item.paymentMethod,
      receivedAt: item.receivedAt,
      plan: item.plan,
      application: appMap.get(item.plan.applicationId) ?? null,
    })),
    total,
    pagination,
  );
}

export async function getPendingConfirmRepayments(): Promise<RepaymentPrefetchItem[]> {
  const list = await prisma.repayment.findMany({
    where: { status: { in: ["PENDING_CONFIRM", "CUSTOMER_CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
    include: {
      plan: { select: { id: true, planNo: true, applicationId: true } },
      allocations: { select: { id: true, itemId: true, amount: true, type: true } },
    },
    take: 200,
  });

  const appIds = list.map((item) => item.plan.applicationId);
  const apps = appIds.length
    ? await prisma.loanApplication.findMany({
        where: { id: { in: appIds } },
        select: {
          id: true,
          applicationNo: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      })
    : [];

  const appMap = new Map(apps.map((item) => [item.id, item]));

  return list.map((item) => ({
    id: item.id,
    repaymentNo: item.repaymentNo,
    amount: Number(item.amount),
    status: item.status,
    receivedAt: item.receivedAt,
    plan: item.plan,
    application: appMap.get(item.plan.applicationId) ?? null,
    allocations: item.allocations.map((allocation) => ({
      ...allocation,
      amount: Number(allocation.amount),
    })),
  }));
}

export async function getFundersList({
  page = 1,
  pageSize = 20,
  isActive,
}: {
  page?: number;
  pageSize?: number;
  isActive?: boolean;
} = {}): Promise<PaginatedResult<FunderPrefetchItem>> {
  const pagination: PaginationParams = { page, pageSize };
  const where: Record<string, unknown> = { deletedAt: null };
  if (typeof isActive === "boolean") {
    where.isActive = isActive;
  }

  const [items, total] = await Promise.all([
    prisma.funder.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { accounts: true } } },
      ...toPrismaArgs(pagination),
    }),
    prisma.funder.count({ where }),
  ]);

  return paginatedResponse(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      contactPerson: item.contactPerson,
      contactPhone: item.contactPhone,
      profitShareRatio: item.profitShareRatio ? Number(item.profitShareRatio) : null,
      cooperationMode: item.cooperationMode,
      monthlyRate: Number(item.monthlyRate),
      weeklyRate: Number(item.weeklyRate),
      loginPhone: item.loginPhone,
      priority: item.priority,
      riskSharing: item.riskSharing,
      riskShareRatio: Number(item.riskShareRatio),
      withdrawalCooldownDays: item.withdrawalCooldownDays,
      isActive: item.isActive,
      accountCount: item._count.accounts,
      createdAt: item.createdAt,
    })),
    total,
    pagination,
  );
}
