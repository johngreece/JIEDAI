export type RepaymentAllocationType = "PRINCIPAL" | "INTEREST" | "FEE" | "PENALTY";

export type RepaymentAllocationInput = {
  itemId: string;
  amount: number;
  type: RepaymentAllocationType;
};

export type RepaymentAllocationRow = {
  itemId: string;
  type: string;
  amount: unknown;
};

export type RepaymentAllocationScheduleItem = {
  id: string;
  periodNumber: number;
  principal: unknown;
  interest: unknown;
  fee: unknown;
  remaining: unknown;
  remainingPrincipal?: unknown;
  remainingInterest?: unknown;
  remainingFee?: unknown;
};

export type RepaymentOpenComponents = {
  principal: number;
  interest: number;
  fee: number;
  penalty: number;
};

export type RepaymentAllocationComponentError = {
  code: "ALLOCATION_COMPONENT_OVER_LIMIT";
  periodNumber: number;
  type: RepaymentAllocationType;
  available: number;
};

export const REPAYMENT_ALLOCATION_TYPES: RepaymentAllocationType[] = [
  "PRINCIPAL",
  "INTEREST",
  "FEE",
  "PENALTY",
];

export const REPAYMENT_ALLOCATION_TYPE_LABELS: Record<RepaymentAllocationType, string> = {
  PRINCIPAL: "本金",
  INTEREST: "利息",
  FEE: "费用",
  PENALTY: "罚息",
};

function emptyTypeTotals(): Record<RepaymentAllocationType, number> {
  return { PRINCIPAL: 0, INTEREST: 0, FEE: 0, PENALTY: 0 };
}

function buildUsageMap(rows: RepaymentAllocationRow[]) {
  const map = new Map<string, Record<RepaymentAllocationType, number>>();

  for (const row of rows) {
    const type = row.type as RepaymentAllocationType;
    if (!REPAYMENT_ALLOCATION_TYPES.includes(type)) continue;

    const current = map.get(row.itemId) ?? emptyTypeTotals();
    current[type] += Number(row.amount);
    map.set(row.itemId, current);
  }

  return map;
}

function getTypeTotals(
  map: Map<string, Record<RepaymentAllocationType, number>>,
  itemId: string
) {
  return map.get(itemId) ?? emptyTypeTotals();
}

export function deriveRepaymentOpenComponents(
  item: Pick<
    RepaymentAllocationScheduleItem,
    "remainingPrincipal" | "remainingInterest" | "remainingFee"
  >,
  totalOpen: number,
): RepaymentOpenComponents {
  let available = Math.max(0, Number(totalOpen) || 0);
  const take = (value: unknown) => {
    const amount = Math.min(available, Math.max(0, Number(value) || 0));
    available = Math.max(0, available - amount);
    return amount;
  };

  const principal = take(item.remainingPrincipal);
  const interest = take(item.remainingInterest);
  const fee = take(item.remainingFee);

  return {
    principal,
    interest,
    fee,
    penalty: available,
  };
}

function getRequestedTypeTotals(allocations: RepaymentAllocationInput[]) {
  const map = new Map<string, Record<RepaymentAllocationType, number>>();

  for (const allocation of allocations) {
    const current = map.get(allocation.itemId) ?? emptyTypeTotals();
    current[allocation.type] += allocation.amount;
    map.set(allocation.itemId, current);
  }

  return map;
}

export function serializeRepaymentAllocationComponentError(
  error: RepaymentAllocationComponentError
) {
  return `${error.code}:${error.periodNumber}:${error.type}:${error.available.toFixed(2)}`;
}

export function parseRepaymentAllocationComponentError(message: string) {
  const [code, periodNumber, type, available] = message.split(":");
  if (code !== "ALLOCATION_COMPONENT_OVER_LIMIT") return null;
  if (!REPAYMENT_ALLOCATION_TYPES.includes(type as RepaymentAllocationType)) return null;

  return {
    code,
    periodNumber: Number(periodNumber),
    type: type as RepaymentAllocationType,
    available: Number(available),
  } satisfies RepaymentAllocationComponentError;
}

export function formatRepaymentAllocationComponentError(
  error: RepaymentAllocationComponentError
) {
  const label = REPAYMENT_ALLOCATION_TYPE_LABELS[error.type];
  return `期次 ${error.periodNumber} 的${label}可分配金额不足，当前可用 ${error.available.toFixed(2)}`;
}

export function validateRepaymentAllocationComponentCaps(params: {
  allocations: RepaymentAllocationInput[];
  itemMap: Map<string, RepaymentAllocationScheduleItem>;
  dynamicAvailableByItem: Map<string, number>;
  confirmedRows: RepaymentAllocationRow[];
  pendingRows: RepaymentAllocationRow[];
  dynamicComponentsByItem?: Map<string, RepaymentOpenComponents>;
  epsilon?: number;
}): RepaymentAllocationComponentError | null {
  const epsilon = params.epsilon ?? 0.000001;
  const confirmedMap = buildUsageMap(params.confirmedRows);
  const pendingMap = buildUsageMap(params.pendingRows);
  const requestedMap = getRequestedTypeTotals(params.allocations);

  for (const [itemId, requested] of requestedMap.entries()) {
    const item = params.itemMap.get(itemId);
    if (!item) continue;

    const confirmed = getTypeTotals(confirmedMap, itemId);
    const pending = getTypeTotals(pendingMap, itemId);
    const dynamicComponents = params.dynamicComponentsByItem?.get(itemId);
    const hasComponentBalances =
      item.remainingPrincipal != null &&
      item.remainingInterest != null &&
      item.remainingFee != null;
    const principalCap = Math.max(0, (
      dynamicComponents?.principal ??
      (hasComponentBalances
        ? Number(item.remainingPrincipal)
        : Number(item.principal) - confirmed.PRINCIPAL)
    ) - pending.PRINCIPAL);
    const interestCap = Math.max(0, (
      dynamicComponents?.interest ??
      (hasComponentBalances
        ? Number(item.remainingInterest)
        : Number(item.interest) - confirmed.INTEREST)
    ) - pending.INTEREST);
    const feeCap = Math.max(0, (
      dynamicComponents?.fee ??
      (hasComponentBalances ? Number(item.remainingFee) : Number(item.fee) - confirmed.FEE)
    ) - pending.FEE);
    const totalOpen = params.dynamicAvailableByItem.get(itemId) ?? Number(item.remaining);
    const pendingTotal = REPAYMENT_ALLOCATION_TYPES.reduce((sum, type) => sum + pending[type], 0);
    const totalAvailable = Math.max(0, totalOpen - pendingTotal);
    const penaltyCap = Math.max(
      0,
      dynamicComponents
        ? dynamicComponents.penalty - pending.PENALTY
        : totalAvailable - principalCap - interestCap - feeCap,
    );
    const caps: Record<RepaymentAllocationType, number> = {
      PRINCIPAL: principalCap,
      INTEREST: interestCap,
      FEE: feeCap,
      PENALTY: penaltyCap,
    };

    for (const type of REPAYMENT_ALLOCATION_TYPES) {
      if (requested[type] - caps[type] > epsilon) {
        return {
          code: "ALLOCATION_COMPONENT_OVER_LIMIT",
          periodNumber: item.periodNumber,
          type,
          available: caps[type],
        };
      }
    }
  }

  return null;
}
