import Decimal from "decimal.js";

export type ReconciliationSeverity = "ERROR" | "WARNING";

export type ReconciliationFindingDraft = {
  fingerprint: string;
  code: string;
  severity: ReconciliationSeverity;
  entityType: string;
  entityId?: string;
  expectedValue?: string;
  actualValue?: string;
  description: string;
  owner: "FINANCE" | "ENGINEERING" | "OPERATIONS";
  recommendedAction: string;
};

export type ReconciliationEntry = {
  id: string;
  type: string;
  direction: string;
  amount: Decimal.Value;
  balanceBefore: Decimal.Value;
  balanceAfter: Decimal.Value;
  ownerId?: string | null;
};

type ExpectedEntry = {
  type: string;
  direction: string;
  amount: Decimal.Value;
  ownerId?: string | null;
};

const MONEY_SCALE = 4;

export function money(value: Decimal.Value | null | undefined) {
  return new Decimal(value ?? 0).toDecimalPlaces(MONEY_SCALE);
}

export function moneyText(value: Decimal.Value | null | undefined) {
  return money(value).toFixed(MONEY_SCALE);
}

export function sameMoney(
  left: Decimal.Value | null | undefined,
  right: Decimal.Value | null | undefined,
) {
  return money(left).equals(money(right));
}

function findingFingerprint(input: {
  code: string;
  entityType: string;
  entityId?: string;
  expectedValue?: string;
  actualValue?: string;
}) {
  return [
    input.code,
    input.entityType,
    input.entityId ?? "",
    input.expectedValue ?? "",
    input.actualValue ?? "",
  ]
    .map((value) => encodeURIComponent(value))
    .join("|");
}

export function createFinding(
  input: Omit<ReconciliationFindingDraft, "fingerprint">,
): ReconciliationFindingDraft {
  return {
    ...input,
    fingerprint: findingFingerprint(input),
  };
}

function entryText(entry: Pick<ReconciliationEntry, "type" | "direction" | "amount" | "ownerId">) {
  return JSON.stringify({
    type: entry.type,
    direction: entry.direction,
    amount: moneyText(entry.amount),
    ownerId: entry.ownerId ?? null,
  });
}

export function expectEntry(input: {
  code: string;
  entityType: string;
  entityId: string;
  label: string;
  expected: ExpectedEntry;
  actual?: ReconciliationEntry;
  owner?: ReconciliationFindingDraft["owner"];
  recommendedAction: string;
}): ReconciliationFindingDraft[] {
  const expectedValue = entryText(input.expected);
  if (!input.actual) {
    return [
      createFinding({
        code: `${input.code}_MISSING`,
        severity: "ERROR",
        entityType: input.entityType,
        entityId: input.entityId,
        expectedValue,
        actualValue: "MISSING",
        description: `${input.label} is missing`,
        owner: input.owner ?? "FINANCE",
        recommendedAction: input.recommendedAction,
      }),
    ];
  }

  const ownerMatches =
    input.expected.ownerId === undefined || input.expected.ownerId === input.actual.ownerId;
  const matches =
    input.expected.type === input.actual.type &&
    input.expected.direction === input.actual.direction &&
    sameMoney(input.expected.amount, input.actual.amount) &&
    ownerMatches;

  if (matches) return [];

  return [
    createFinding({
      code: `${input.code}_MISMATCH`,
      severity: "ERROR",
      entityType: input.entityType,
      entityId: input.entityId,
      expectedValue,
      actualValue: entryText(input.actual),
      description: `${input.label} does not match the business record`,
      owner: input.owner ?? "FINANCE",
      recommendedAction: input.recommendedAction,
    }),
  ];
}

export function expectNoEntry(input: {
  code: string;
  entityType: string;
  entityId: string;
  label: string;
  actual?: ReconciliationEntry;
  recommendedAction: string;
}): ReconciliationFindingDraft[] {
  if (!input.actual) return [];
  return [
    createFinding({
      code: input.code,
      severity: "ERROR",
      entityType: input.entityType,
      entityId: input.entityId,
      expectedValue: "MISSING",
      actualValue: entryText(input.actual),
      description: `${input.label} exists without a valid business event`,
      owner: "FINANCE",
      recommendedAction: input.recommendedAction,
    }),
  ];
}

export function compareMoney(input: {
  code: string;
  entityType: string;
  entityId: string;
  label: string;
  expected: Decimal.Value;
  actual: Decimal.Value;
  owner?: ReconciliationFindingDraft["owner"];
  recommendedAction: string;
}): ReconciliationFindingDraft[] {
  if (sameMoney(input.expected, input.actual)) return [];
  return [
    createFinding({
      code: input.code,
      severity: "ERROR",
      entityType: input.entityType,
      entityId: input.entityId,
      expectedValue: moneyText(input.expected),
      actualValue: moneyText(input.actual),
      description: `${input.label} does not match`,
      owner: input.owner ?? "FINANCE",
      recommendedAction: input.recommendedAction,
    }),
  ];
}

export function evaluateBalanceChain(input: {
  entityType: string;
  entityId: string;
  entries: ReconciliationEntry[];
  recordedBalance?: Decimal.Value;
  codePrefix: string;
  label: string;
  allowNegative?: boolean;
}): ReconciliationFindingDraft[] {
  const findings: ReconciliationFindingDraft[] = [];
  let runningBalance = money(0);

  for (const entry of input.entries) {
    if (!sameMoney(entry.balanceBefore, runningBalance)) {
      findings.push(
        createFinding({
          code: `${input.codePrefix}_BALANCE_BEFORE`,
          severity: "ERROR",
          entityType: input.entityType,
          entityId: input.entityId,
          expectedValue: moneyText(runningBalance),
          actualValue: moneyText(entry.balanceBefore),
          description: `${input.label} entry ${entry.id} has a broken opening balance`,
          owner: "ENGINEERING",
          recommendedAction: "Freeze new money operations for this account and investigate the originating transaction and database history.",
        }),
      );
    }

    const expectedAfter =
      entry.direction === "CREDIT"
        ? runningBalance.plus(money(entry.amount))
        : runningBalance.minus(money(entry.amount));

    if (!sameMoney(entry.balanceAfter, expectedAfter)) {
      findings.push(
        createFinding({
          code: `${input.codePrefix}_BALANCE_AFTER`,
          severity: "ERROR",
          entityType: input.entityType,
          entityId: input.entityId,
          expectedValue: moneyText(expectedAfter),
          actualValue: moneyText(entry.balanceAfter),
          description: `${input.label} entry ${entry.id} has an invalid closing balance`,
          owner: "ENGINEERING",
          recommendedAction: "Freeze new money operations for this account and investigate the originating transaction and database history.",
        }),
      );
    }

    if (!input.allowNegative && expectedAfter.lt(0)) {
      findings.push(
        createFinding({
          code: `${input.codePrefix}_NEGATIVE_BALANCE`,
          severity: "ERROR",
          entityType: input.entityType,
          entityId: input.entityId,
          expectedValue: ">= 0.0000",
          actualValue: moneyText(expectedAfter),
          description: `${input.label} becomes negative at entry ${entry.id}`,
          owner: "FINANCE",
          recommendedAction: "Stop outgoing payments from this account and verify the transaction sequence and source documents.",
        }),
      );
    }

    runningBalance = expectedAfter;
  }

  if (input.recordedBalance !== undefined) {
    findings.push(
      ...compareMoney({
        code: `${input.codePrefix}_CURRENT_BALANCE`,
        entityType: input.entityType,
        entityId: input.entityId,
        label: `${input.label} current balance`,
        expected: runningBalance,
        actual: input.recordedBalance,
        owner: "FINANCE",
        recommendedAction: "Freeze outgoing payments and compare the account row with the complete journal before any corrective entry is approved.",
      }),
    );
  }

  return findings;
}
