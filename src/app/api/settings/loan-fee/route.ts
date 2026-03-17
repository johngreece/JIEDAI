import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_FEE_RATES,
  FEE_SETTING_KEYS,
  type FeeRates,
} from "@/lib/loan-fee-rules";
import { writeAuditLog } from "@/lib/audit";

const KEYS_TO_RATE: Record<string, keyof FeeRates> = {
  [FEE_SETTING_KEYS.sameDayRate]: "sameDayRate",
  [FEE_SETTING_KEYS.nextDayRate]: "nextDayRate",
  [FEE_SETTING_KEYS.day3Day7Rate]: "day3Day7Rate",
  [FEE_SETTING_KEYS.otherDayRate]: "otherDayRate",
  [FEE_SETTING_KEYS.overdueGraceHours]: "overdueGraceHours",
  [FEE_SETTING_KEYS.overdueRateBefore14]: "overdueRatePerDayBefore14",
  [FEE_SETTING_KEYS.overdueRateAfter14]: "overdueRatePerDayAfter14",
};

async function loadRatesFromDb(): Promise<Partial<FeeRates>> {
  const keys = Object.values(FEE_SETTING_KEYS);
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: keys } },
  });
  const out: Partial<FeeRates> = {};
  for (const row of rows) {
    const k = KEYS_TO_RATE[row.key];
    if (k != null) {
      const v = Number(row.value);
      if (!Number.isNaN(v)) (out as Record<string, number>)[k] = v;
    }
  }
  return out;
}

function requireSuperAdmin(session: { roles: string[] } | null) {
  if (!session?.roles?.includes("super_admin")) {
    return NextResponse.json({ error: "仅管理员可操作" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const session = await getAdminSession();
  const err = requireSuperAdmin(session);
  if (err) return err;
  const fromDb = await loadRatesFromDb();
  const rates: FeeRates = { ...DEFAULT_FEE_RATES, ...fromDb };
  return NextResponse.json(rates);
}

const BODY_KEYS: (keyof FeeRates)[] = [
  "sameDayRate",
  "nextDayRate",
  "day3Day7Rate",
  "otherDayRate",
  "overdueGraceHours",
  "overdueRatePerDayBefore14",
  "overdueRatePerDayAfter14",
];

const RATE_TO_KEY: Record<string, string> = {
  sameDayRate: FEE_SETTING_KEYS.sameDayRate,
  nextDayRate: FEE_SETTING_KEYS.nextDayRate,
  day3Day7Rate: FEE_SETTING_KEYS.day3Day7Rate,
  otherDayRate: FEE_SETTING_KEYS.otherDayRate,
  overdueGraceHours: FEE_SETTING_KEYS.overdueGraceHours,
  overdueRatePerDayBefore14: FEE_SETTING_KEYS.overdueRateBefore14,
  overdueRatePerDayAfter14: FEE_SETTING_KEYS.overdueRateAfter14,
};

export async function PUT(req: Request) {
  const session = await getAdminSession();
  const err = requireSuperAdmin(session);
  if (err) return err;
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, number> = {};
  for (const k of BODY_KEYS) {
    if (typeof body[k] === "number") updates[k] = body[k];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "无有效字段" }, { status: 400 });
  }
  const userId = session!.sub;
  for (const [rateKey, value] of Object.entries(updates)) {
    const key = RATE_TO_KEY[rateKey];
    if (!key) continue;
    const existing = await prisma.systemSetting.findUnique({ where: { key } });
    if (existing) {
      await prisma.systemSetting.update({
        where: { key },
        data: { value: String(value) },
      });
    } else {
      await prisma.systemSetting.create({
        data: {
          key,
          value: String(value),
          group: "LOAN_FEE",
        },
      });
    }
  }
  await writeAuditLog({
    userId,
    action: "update",
    entityType: "system_setting",
    entityId: "loan_fee",
    newValue: updates,
  });
  const fromDb = await loadRatesFromDb();
  const rates: FeeRates = { ...DEFAULT_FEE_RATES, ...fromDb };
  return NextResponse.json(rates);
}
