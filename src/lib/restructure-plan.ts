import Decimal from "decimal.js";
import { generateSchedule } from "@/services/schedule.service";

export const RESTRUCTURE_BLOCKING_REPAYMENT_STATUSES = [
  "PENDING",
  "MATCHED",
  "MANUAL_REVIEW",
  "PENDING_CONFIRM",
  "CUSTOMER_CONFIRMED",
] as const;

type ComponentBalanceItem = {
  remaining: Decimal.Value;
  remainingPrincipal: Decimal.Value;
  remainingInterest: Decimal.Value;
  remainingFee: Decimal.Value;
};

export type RestructureBalances = {
  principal: Decimal;
  interest: Decimal;
  fee: Decimal;
  penalty: Decimal;
};

export function calculateRestructureBalances(
  items: ComponentBalanceItem[],
  outstandingPenalties: Decimal.Value[] = [],
): RestructureBalances {
  const balances = items.reduce(
    (total, item) => {
      const remaining = new Decimal(item.remaining.toString());
      const principal = new Decimal(item.remainingPrincipal.toString());
      const interest = new Decimal(item.remainingInterest.toString());
      const fee = new Decimal(item.remainingFee.toString());

      if (remaining.gt(0) && principal.plus(interest).plus(fee).lte(0)) {
        throw new Error("Repayment schedule item is missing component balances");
      }

      return {
        principal: total.principal.plus(principal),
        interest: total.interest.plus(interest),
        fee: total.fee.plus(fee),
        penalty: total.penalty,
      };
    },
    {
      principal: new Decimal(0),
      interest: new Decimal(0),
      fee: new Decimal(0),
      penalty: new Decimal(0),
    },
  );

  balances.penalty = outstandingPenalties.reduce<Decimal>(
    (total, value) => total.plus(value.toString()),
    new Decimal(0),
  );

  return {
    principal: balances.principal.toDecimalPlaces(4),
    interest: balances.interest.toDecimalPlaces(4),
    fee: balances.fee.toDecimalPlaces(4),
    penalty: balances.penalty.toDecimalPlaces(4),
  };
}

export function generateRestructurePlan(params: {
  principal: Decimal.Value;
  carriedFee: Decimal.Value;
  newTermValue: number;
  newTermUnit: "MONTH" | "DAY";
  newAnnualRate: Decimal.Value;
  startDate: Date;
}) {
  return generateSchedule({
    principal: new Decimal(params.principal.toString()),
    termValue: params.newTermValue,
    termUnit: params.newTermUnit,
    repaymentMethod: "ONE_TIME",
    annualRate: new Decimal(params.newAnnualRate.toString()),
    feeAmount: new Decimal(params.carriedFee.toString()),
    startDate: params.startDate,
  });
}

export function restructureBalancesMatch(
  left: RestructureBalances,
  right: RestructureBalances,
) {
  return (
    left.principal.eq(right.principal) &&
    left.interest.eq(right.interest) &&
    left.fee.eq(right.fee) &&
    left.penalty.eq(right.penalty)
  );
}
