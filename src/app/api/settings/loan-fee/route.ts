import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_FEE_RATES, FEE_SETTING_KEYS, type FeeRates } from "@/lib/loan-fee-rules";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const KEYS_TO_RATE: Record<string, keyof FeeRates> = {
  [FEE_SETTING_KEYS.upfrontFlatRate]: "upfrontFlatRate",
  [FEE_SETTING_KEYS.fee5hRate]: "fee5hRate",
  [FEE_SETTING_KEYS.fee24hRate]: "fee24hRate",
  [FEE_SETTING_KEYS.fee48hRate]: "fee48hRate",
  [FEE_SETTING_KEYS.fee7dRate]: "fee7dRate",
  [FEE_SETTING_KEYS.overdueGraceHours]: "overdueGraceHours",
  [FEE_SETTING_KEYS.overdueRatePerDayBefore7]: "overdueRatePerDayBefore7",
  [FEE_SETTING_KEYS.overdueRatePerDayBefore30]: "overdueRatePerDayBefore30",
  [FEE_SETTING_KEYS.overdueRatePerDayAfter30]: "overdueRatePerDayAfter30",
  [FEE_SETTING_KEYS.commercialMonthlyRate]: "commercialMonthlyRate",
};

function parseValue(raw: string): number | null {
  const direct = Number(raw);
  if (!Number.isNaN(direct)) return direct;
  try {
    const parsed = JSON.parse(raw) as { value?: unknown };
    const nested = Number(parsed?.value);
    return Number.isNaN(nested) ? null : nested;
  } catch {
    return null;
  }
}

async function loadRatesFromDb(): Promise<Partial<FeeRates>> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(FEE_SETTING_KEYS) } },
  });

  const result: Partial<FeeRates> = {};
  for (const row of rows) {
    const key = KEYS_TO_RATE[row.key];
    const value = parseValue(row.value);
    if (key && value != null) {
      result[key] = value;
    }
  }
  return result;
}

function requireSuperAdmin(session: { roles: string[] } | null) {
  if (!session?.roles?.includes("super_admin")) {
    return NextResponse.json({ error: "仅超级管理员可查看或修改费率配置" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const session = await getAdminSession();
  const error = requireSuperAdmin(session);
  if (error) return error;

  const fromDb = await loadRatesFromDb();
  return NextResponse.json({ ...DEFAULT_FEE_RATES, ...fromDb });
}

const BODY_KEYS: (keyof FeeRates)[] = [
  "upfrontFlatRate",
  "fee5hRate",
  "fee24hRate",
  "fee48hRate",
  "fee7dRate",
  "overdueGraceHours",
  "overdueRatePerDayBefore7",
  "overdueRatePerDayBefore30",
  "overdueRatePerDayAfter30",
  "commercialMonthlyRate",
];

const RATE_TO_KEY: Record<keyof FeeRates, string> = {
  upfrontFlatRate: FEE_SETTING_KEYS.upfrontFlatRate,
  fee5hRate: FEE_SETTING_KEYS.fee5hRate,
  fee24hRate: FEE_SETTING_KEYS.fee24hRate,
  fee48hRate: FEE_SETTING_KEYS.fee48hRate,
  fee7dRate: FEE_SETTING_KEYS.fee7dRate,
  overdueGraceHours: FEE_SETTING_KEYS.overdueGraceHours,
  overdueRatePerDayBefore7: FEE_SETTING_KEYS.overdueRatePerDayBefore7,
  overdueRatePerDayBefore30: FEE_SETTING_KEYS.overdueRatePerDayBefore30,
  overdueRatePerDayAfter30: FEE_SETTING_KEYS.overdueRatePerDayAfter30,
  commercialMonthlyRate: FEE_SETTING_KEYS.commercialMonthlyRate,
};

export async function PUT(req: Request) {
  const session = await getAdminSession();
  const error = requireSuperAdmin(session);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const updates: Partial<FeeRates> = {};
  for (const key of BODY_KEYS) {
    if (typeof body[key] === "number") updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "没有可保存的费率字段" }, { status: 400 });
  }

  for (const [key, value] of Object.entries(updates) as Array<[keyof FeeRates, number]>) {
    const settingKey = RATE_TO_KEY[key];
    const existing = await prisma.systemSetting.findUnique({ where: { key: settingKey } });
    if (existing) {
      await prisma.systemSetting.update({
        where: { key: settingKey },
        data: { value: String(value) },
      });
    } else {
      await prisma.systemSetting.create({
        data: {
          key: settingKey,
          value: String(value),
          group: "LOAN_FEE",
          remark: key,
        },
      });
    }
  }

  await writeAuditLog({
    userId: session!.sub,
    action: "update",
    entityType: "system_setting",
    entityId: "loan_fee",
    newValue: updates,
    changeSummary: "更新借款费率配置",
  }).catch(() => undefined);

  const fromDb = await loadRatesFromDb();
  return NextResponse.json({ ...DEFAULT_FEE_RATES, ...fromDb });
}
