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

const createSchema = z.object({
  name: z.string().min(1),
  ruleType: z.string().min(1),
  rateType: z.enum(["FIXED", "PERCENTAGE"]),
  rateValue: z.number().min(0),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  conditionJson: z.string().optional(),
  priority: z.number().int().min(0).default(0),
  effectiveFrom: z.string().transform((s) => new Date(s)),
  effectiveTo: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["settings:view"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "true";
  const rules = await prisma.pricingRule.findMany({
    where: { productId: id, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({
    items: rules.map((r) => ({
      ...r,
      rateValue: Number(r.rateValue),
      minValue: r.minValue ? Number(r.minValue) : null,
      maxValue: r.maxValue ? Number(r.maxValue) : null,
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission(["settings:edit"]);
  if (session instanceof Response) return session;

  const { id } = await params;
  const product = await prisma.loanProduct.findFirst({ where: { id, deletedAt: null } });
  if (!product) return NextResponse.json({ error: "产品不存在" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数错误", details: parsed.error.flatten() }, { status: 400 });
  }

  const typeError = validatePricingRuleType(parsed.data.ruleType);
  if (typeError) {
    return NextResponse.json({ error: typeError }, { status: 400 });
  }

  const valueError = validatePricingRuleValue(parsed.data.ruleType, parsed.data.rateValue);
  if (valueError) {
    return NextResponse.json({ error: valueError }, { status: 400 });
  }

  const normalizedCondition = normalizePricingRuleCondition(parsed.data.conditionJson);
  if (normalizedCondition.error) {
    return NextResponse.json({ error: normalizedCondition.error }, { status: 400 });
  }

  const conditionError = validatePricingRuleCondition(parsed.data.ruleType, normalizedCondition.conditionJson);
  if (conditionError) {
    return NextResponse.json({ error: conditionError }, { status: 400 });
  }

  const rule = await prisma.pricingRule.create({
    data: {
      ...parsed.data,
      conditionJson: normalizedCondition.conditionJson,
      productId: id,
      createdById: session.sub,
    },
  });

  await writeAuditLog({
    userId: session.sub,
    action: "create",
    entityType: "pricing_rule",
    entityId: rule.id,
    newValue: {
      productId: id,
      name: rule.name,
      ruleType: rule.ruleType,
      rateType: rule.rateType,
      rateValue: Number(rule.rateValue),
      conditionJson: rule.conditionJson,
      priority: rule.priority,
    },
    changeSummary: "Create product pricing rule",
  }).catch((error) => console.error("[AuditLog] pricing-rule-create", error));

  return NextResponse.json({
    ...rule,
    rateValue: Number(rule.rateValue),
    minValue: rule.minValue ? Number(rule.minValue) : null,
    maxValue: rule.maxValue ? Number(rule.maxValue) : null,
  }, { status: 201 });
}
