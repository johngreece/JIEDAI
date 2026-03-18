/**
 * 还款计划生成引擎
 * 支持三种还款方式：
 *   ONE_TIME         — 一次性还本付息（到期一次还清）
 *   EQUAL_INSTALLMENT — 等额本息（每期还款总额相同）
 *   EQUAL_PRINCIPAL   — 等额本金（每期本金相同，利息递减）
 */

import Decimal from "decimal.js";

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
function calcDueDate(startDate: Date, period: number, termUnit: "MONTH" | "DAY", totalPeriods: number): Date {
  const d = new Date(startDate);
  if (termUnit === "MONTH") {
    d.setMonth(d.getMonth() + period);
  } else {
    // DAY: 按等分天数推算每期
    const totalDays = totalPeriods; // termValue 就是总天数
    const daysPerPeriod = Math.ceil(totalDays / totalPeriods);
    d.setDate(d.getDate() + daysPerPeriod * period);
  }
  return d;
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
  let periodRate: Decimal;

  if (termUnit === "MONTH") {
    totalPeriods = termValue;
    periodRate = annualRate.div(12); // 月利率
  } else {
    // DAY: 按天计息，合并为 1 期（短期借款）或按 30 天拆期
    if (termValue <= 90) {
      totalPeriods = 1;
      periodRate = annualRate.mul(termValue).div(365);
    } else {
      totalPeriods = Math.ceil(termValue / 30);
      periodRate = annualRate.mul(30).div(365);
    }
  }

  // 至少 1 期
  totalPeriods = Math.max(1, totalPeriods);

  const items: ScheduleItem[] = [];
  let totalInterest = new Decimal(0);

  switch (input.repaymentMethod) {
    case "ONE_TIME": {
      // 到期一次还清：1 期，利息 = 本金 × 期利率
      const interest = principal.mul(periodRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
      totalInterest = interest;
      items.push({
        periodNumber: 1,
        dueDate: calcDueDate(input.startDate, totalPeriods, termUnit, totalPeriods),
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
      if (periodRate.isZero()) {
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
            dueDate: calcDueDate(input.startDate, i, termUnit, totalPeriods),
            principal: thisPrincipal,
            interest: new Decimal(0),
            fee,
            totalDue: thisPrincipal.plus(fee),
          });
        }
      } else {
        const r = periodRate;
        const rPow = r.plus(1).pow(totalPeriods);
        const monthlyPayment = principal.mul(r).mul(rPow).div(rPow.minus(1)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

        let remainingPrincipal = principal;
        for (let i = 1; i <= totalPeriods; i++) {
          const interest = remainingPrincipal.mul(r).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
          const isLast = i === totalPeriods;
          const thisPrincipal = isLast
            ? remainingPrincipal
            : monthlyPayment.minus(interest).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
          remainingPrincipal = remainingPrincipal.minus(thisPrincipal);
          totalInterest = totalInterest.plus(interest);
          const fee = i === 1 ? feeAmount : new Decimal(0);
          items.push({
            periodNumber: i,
            dueDate: calcDueDate(input.startDate, i, termUnit, totalPeriods),
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
        const interest = remainingPrincipal.mul(periodRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        remainingPrincipal = remainingPrincipal.minus(thisPrincipal);
        totalInterest = totalInterest.plus(interest);
        const fee = i === 1 ? feeAmount : new Decimal(0);
        items.push({
          periodNumber: i,
          dueDate: calcDueDate(input.startDate, i, termUnit, totalPeriods),
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
