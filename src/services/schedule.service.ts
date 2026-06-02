/**
 * 还款计划生成引擎
 * 支持三种还款方式：
 *   ONE_TIME         — 一次性还本付息（到期一次还清）
 *   EQUAL_INSTALLMENT — 等额本息（每期还款总额相同）
 *   EQUAL_PRINCIPAL   — 等额本金（每期本金相同，利息递减）
 */

import Decimal from "decimal.js";
import { addCalendarMonths } from "@/lib/calendar-period";

export type ScheduleInput = {
  principal: number | Decimal;
  termValue: number;
  termUnit: "MONTH" | "DAY";
  repaymentMethod: "ONE_TIME" | "EQUAL_INSTALLMENT" | "EQUAL_PRINCIPAL";
  annualRate: number | Decimal;   // 年化利率 (如 0.12 = 12%)
  feeAmount: number | Decimal;    // 服务费总额（首期收取）
  startDate: Date;
};

export type ScheduleItem = {
  periodNumber: number;
  dueDate: Date;
  principal: Decimal;
  interest: Decimal;
  fee: Decimal;
  totalDue: Decimal;
};

export type ScheduleResult = {
  totalPrincipal: Decimal;
  totalInterest: Decimal;
  totalFee: Decimal;
  totalPeriods: number;
  items: ScheduleItem[];
};

/**
 * 计算每期到期日
 */
function calcDayPeriodEndDay(period: number, totalPeriods: number, termValue: number): number {
  const safeTermDays = Math.max(1, termValue);
  const safeTotalPeriods = Math.max(1, totalPeriods);

  if (safeTotalPeriods === 1) return safeTermDays;

  const daysPerPeriod = Math.ceil(safeTermDays / safeTotalPeriods);
  return period === safeTotalPeriods ? safeTermDays : Math.min(safeTermDays, daysPerPeriod * period);
}

function calcDayPeriodDays(period: number, totalPeriods: number, termValue: number): number {
  const currentEndDay = calcDayPeriodEndDay(period, totalPeriods, termValue);
  const previousEndDay = period <= 1 ? 0 : calcDayPeriodEndDay(period - 1, totalPeriods, termValue);
  return Math.max(0, currentEndDay - previousEndDay);
}

function calcPeriodRate(
  annualRate: Decimal,
  termUnit: "MONTH" | "DAY",
  termValue: number,
  period: number,
  totalPeriods: number
): Decimal {
  if (termUnit === "MONTH") return annualRate.div(12);
  return annualRate.mul(calcDayPeriodDays(period, totalPeriods, termValue)).div(365);
}

function calcDueDate(
  startDate: Date,
  period: number,
  termUnit: "MONTH" | "DAY",
  totalPeriods: number,
  termValue: number
): Date {
  const d = new Date(startDate);
  if (termUnit === "MONTH") {
    return addCalendarMonths(startDate, period);
  } else {
    // DAY: 按等分天数推算每期
    d.setDate(d.getDate() + calcDayPeriodEndDay(period, totalPeriods, termValue));
  }
  return d;
}

function calcOneTimeRate(annualRate: Decimal, termUnit: "MONTH" | "DAY", termValue: number): Decimal {
  if (termUnit === "MONTH") return annualRate.div(12).mul(termValue);
  return annualRate.mul(termValue).div(365);
}

/**
 * 生成还款计划
 */
export function generateSchedule(input: ScheduleInput): ScheduleResult {
  const principal = new Decimal(input.principal.toString());
  const annualRate = new Decimal(input.annualRate.toString());
  const feeAmount = new Decimal(input.feeAmount.toString());
  const termValue = input.termValue;
  const termUnit = input.termUnit;

  // 确定总期数和每期利率
  let totalPeriods: number;

  if (termUnit === "MONTH") {
    totalPeriods = termValue;
  } else {
    // DAY: 按天计息，合并为 1 期（短期借款）或按 30 天拆期
    if (termValue <= 90) {
      totalPeriods = 1;
    } else {
      totalPeriods = Math.ceil(termValue / 30);
    }
  }

  // 至少 1 期
  totalPeriods = Math.max(1, totalPeriods);
  const getPeriodRate = (period: number) => calcPeriodRate(annualRate, termUnit, termValue, period, totalPeriods);

  const items: ScheduleItem[] = [];
  let totalInterest = new Decimal(0);

  switch (input.repaymentMethod) {
    case "ONE_TIME": {
      // 到期一次还清：1 期，利息 = 本金 × 期利率
      const interest = principal.mul(calcOneTimeRate(annualRate, termUnit, termValue)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      totalInterest = interest;
      items.push({
        periodNumber: 1,
        dueDate: calcDueDate(input.startDate, totalPeriods, termUnit, totalPeriods, termValue),
        principal,
        interest,
        fee: feeAmount,
        totalDue: principal.plus(interest).plus(feeAmount),
      });
      totalPeriods = 1;
      break;
    }

    case "EQUAL_INSTALLMENT": {
      // 等额本息: M = P * r * (1+r)^n / ((1+r)^n - 1)
      const periodRates = Array.from({ length: totalPeriods }, (_, index) => getPeriodRate(index + 1));

      if (periodRates.every((rate) => rate.isZero())) {
        // 零利率时按等额本金处理
        const perPrincipal = principal.div(totalPeriods).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        for (let i = 1; i <= totalPeriods; i++) {
          const isLast = i === totalPeriods;
          const thisPrincipal = isLast
            ? principal.minus(perPrincipal.mul(totalPeriods - 1))
            : perPrincipal;
          const fee = i === 1 ? feeAmount : new Decimal(0);
          items.push({
            periodNumber: i,
            dueDate: calcDueDate(input.startDate, i, termUnit, totalPeriods, termValue),
            principal: thisPrincipal,
            interest: new Decimal(0),
            fee,
            totalDue: thisPrincipal.plus(fee),
          });
        }
      } else {
        let cumulativeDiscountBase = new Decimal(1);
        let discountSum = new Decimal(0);
        for (const rate of periodRates) {
          cumulativeDiscountBase = cumulativeDiscountBase.mul(rate.plus(1));
          discountSum = discountSum.plus(new Decimal(1).div(cumulativeDiscountBase));
        }
        const periodicPayment = principal.div(discountSum).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

        let remainingPrincipal = principal;
        for (let i = 1; i <= totalPeriods; i++) {
          const r = periodRates[i - 1];
          const interest = remainingPrincipal.mul(r).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
          const isLast = i === totalPeriods;
          const thisPrincipal = isLast
            ? remainingPrincipal
            : periodicPayment.minus(interest).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
          remainingPrincipal = remainingPrincipal.minus(thisPrincipal);
          totalInterest = totalInterest.plus(interest);
          const fee = i === 1 ? feeAmount : new Decimal(0);
          items.push({
            periodNumber: i,
            dueDate: calcDueDate(input.startDate, i, termUnit, totalPeriods, termValue),
            principal: thisPrincipal,
            interest,
            fee,
            totalDue: thisPrincipal.plus(interest).plus(fee),
          });
        }
      }
      break;
    }

    case "EQUAL_PRINCIPAL": {
      // 等额本金: 每期本金相同，利息 = 剩余本金 × 期利率
      const perPrincipal = principal.div(totalPeriods).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      let remainingPrincipal = principal;
      for (let i = 1; i <= totalPeriods; i++) {
        const isLast = i === totalPeriods;
        const thisPrincipal = isLast
          ? remainingPrincipal
          : perPrincipal;
        const interest = remainingPrincipal.mul(getPeriodRate(i)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        remainingPrincipal = remainingPrincipal.minus(thisPrincipal);
        totalInterest = totalInterest.plus(interest);
        const fee = i === 1 ? feeAmount : new Decimal(0);
        items.push({
          periodNumber: i,
          dueDate: calcDueDate(input.startDate, i, termUnit, totalPeriods, termValue),
          principal: thisPrincipal,
          interest,
          fee,
          totalDue: thisPrincipal.plus(interest).plus(fee),
        });
      }
      break;
    }
  }

  return {
    totalPrincipal: principal,
    totalInterest,
    totalFee: feeAmount,
    totalPeriods,
    items,
  };
}
