import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  normalizePricingRuleCondition,
  validatePricingRuleCondition,
  validatePricingRuleType,
  validatePricingRuleValue,
} from "@/lib/pricing-rule-condition";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; ruleId: string }> };

const dateField = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date")
  .transform((value) => new Date(value));

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  ruleType: z.string().min(1).optional(),
  rateType: z.enum(["FIXED", "PERCENTAGE"]).optional(),
  rateValue: z.number().min(0).optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  conditionJson: z.string().nullable().optional(),
  priority: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  effectiveFrom: dateField.optional(),
  effectiveTo: z.union([dateField, z.null()]).optional(),
});

function serializeRule(rule: {
  id: string;
  productId: string;
  name: string;
  ruleType: string;
  rateType: string;
  rateValue: unknown;
  minValue: unknown | null;
  maxValue: unknown | null;
  conditionJson: string | null;
  priority: number;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  version: number;
}) {
  return {
    ...rule,
    rateValue: Number(rule.rateValue),
    minValue: rule.minValue == null ? null : Number(rule.minValue),
    maxValue: rule.maxValue == null ? null : Number(rule.maxValue),
  };
}

function auditShape(rule: ReturnType<typeof serializeRule>) {
  return {
    name: rule.name,
    ruleType: rule.ruleType,
    rateType: rule.rateType,
    rateValue: rule.rateValue,
    minValue: rule.minValue,
    maxValue: rule.maxValue,
    conditionJson: rule.conditionJson,
    priority: rule.priority,
    isActive: rule.isActive,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    version: rule.version,
  };
}

async function ensureRuleCanLoseCoverage(params: {
  productId: string;
  ruleId: string;
  nextRuleType: string;
  nextIsActive: boolean;
}) {
  const activeRules = await prisma.pricingRule.findMany({
    where: { productId: params.productId, isActive: true },
    select: { id: true, ruleType: true },
  });

  if (!activeRules.some((rule) => rule.id === params.ruleId)) return null;

  const remainingRules = activeRules
    .filter((rule) => rule.id !== params.ruleId)
    .concat(params.nextIsActive ? [{ id: params.ruleId, ruleType: params.nextRuleType }] : []);

  const hadChannelRule = activeRules.some((rule) => rule.ruleType === "CHANNEL");
  const hadTierRule = activeRules.some((rule) => rule.ruleType === "TIER_RATE");

  if (hadChannelRule && !remainingRules.some((rule) => rule.ruleType === "CHANNEL")) {
    return "不能停用或改掉产品最后一条 CHANNEL 规则";
  }

  if (hadTierRule && !remainingRules.some((rule) => rule.ruleType === "TIER_RATE")) {
    return "不能停用或改掉产品最后一条 TIER_RATE 规则";
  }

  return null;
}

async function updatePricingRule(req: Request, { params }: RouteContext) {
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;

  const { id: productId, ruleId } = await params;
  const existing = await prisma.pricingRule.findFirst({
    where: { id: ruleId, productId },
    include: { product: { select: { id: true, deletedAt: true } } },
  });

  if (!existing || existing.product.deletedAt) {
    return NextResponse.json({ error: "定价规则不存在" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const nextRuleType = parsed.data.ruleType ?? existing.ruleType;
  const nextRateValue = parsed.data.rateValue ?? Number(existing.rateValue);
  const nextIsActive = parsed.data.isActive ?? existing.isActive;

  const typeError = validatePricingRuleType(nextRuleType);
  if (typeError) {
    return NextResponse.json({ error: typeError }, { status: 400 });
  }

  const valueError = validatePricingRuleValue(nextRuleType, nextRateValue);
  if (valueError) {
    return NextResponse.json({ error: valueError }, { status: 400 });
  }

  const normalizedCondition =
    "conditionJson" in parsed.data
      ? normalizePricingRuleCondition(parsed.data.conditionJson)
      : { conditionJson: existing.conditionJson, condition: {} };
  if (normalizedCondition.error) {
    return NextResponse.json({ error: normalizedCondition.error }, { status: 400 });
  }

  const nextConditionJson = normalizedCondition.conditionJson ?? null;
  const conditionError = validatePricingRuleCondition(nextRuleType, nextConditionJson);
  if (conditionError) {
    return NextResponse.json({ error: conditionError }, { status: 400 });
  }

  const coverageError = await ensureRuleCanLoseCoverage({
    productId,
    ruleId,
    nextRuleType,
    nextIsActive,
  });
  if (coverageError) {
    return NextResponse.json({ error: coverageError }, { status: 409 });
  }

  const data = {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.ruleType !== undefined ? { ruleType: parsed.data.ruleType } : {}),
    ...(parsed.data.rateType !== undefined ? { rateType: parsed.data.rateType } : {}),
    ...(parsed.data.rateValue !== undefined ? { rateValue: parsed.data.rateValue } : {}),
    ...(parsed.data.minValue !== undefined ? { minValue: parsed.data.minValue } : {}),
    ...(parsed.data.maxValue !== undefined ? { maxValue: parsed.data.maxValue } : {}),
    ...("conditionJson" in parsed.data ? { conditionJson: nextConditionJson } : {}),
    ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
    ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    ...(parsed.data.effectiveFrom !== undefined ? { effectiveFrom: parsed.data.effectiveFrom } : {}),
    ...(parsed.data.effectiveTo !== undefined ? { effectiveTo: parsed.data.effectiveTo } : {}),
    version: { increment: 1 },
  };

  const updated = await prisma.pricingRule.update({
    where: { id: ruleId },
    data,
  });

  await writeAuditLog({
    userId: session.sub,
    action: "update",
    entityType: "pricing_rule",
    entityId: ruleId,
    oldValue: auditShape(serializeRule(existing)),
    newValue: auditShape(serializeRule(updated)),
    changeSummary: "Update product pricing rule",
  }).catch((error) => console.error("[AuditLog] pricing-rule-update", error));

  return NextResponse.json(serializeRule(updated));
}

export async function PUT(req: Request, context: RouteContext) {
  return updatePricingRule(req, context);
}

export async function PATCH(req: Request, context: RouteContext) {
  return updatePricingRule(req, context);
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;

  const { id: productId, ruleId } = await params;
  const existing = await prisma.pricingRule.findFirst({
    where: { id: ruleId, productId },
    include: { product: { select: { id: true, deletedAt: true } } },
  });

  if (!existing || existing.product.deletedAt) {
    return NextResponse.json({ error: "定价规则不存在" }, { status: 404 });
  }

  if (!existing.isActive) {
    return NextResponse.json({ ok: true, item: serializeRule(existing) });
  }

  const coverageError = await ensureRuleCanLoseCoverage({
    productId,
    ruleId,
    nextRuleType: existing.ruleType,
    nextIsActive: false,
  });
  if (coverageError) {
    return NextResponse.json({ error: coverageError }, { status: 409 });
  }

  const updated = await prisma.pricingRule.update({
    where: { id: ruleId },
    data: {
      isActive: false,
      effectiveTo: new Date(),
      version: { increment: 1 },
    },
  });

  await writeAuditLog({
    userId: session.sub,
    action: "delete",
    entityType: "pricing_rule",
    entityId: ruleId,
    oldValue: auditShape(serializeRule(existing)),
    newValue: auditShape(serializeRule(updated)),
    changeSummary: "Deactivate product pricing rule",
  }).catch((error) => console.error("[AuditLog] pricing-rule-delete", error));

  return NextResponse.json({ ok: true, item: serializeRule(updated) });
}

