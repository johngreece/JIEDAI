const DAY_MS = 24 * 60 * 60 * 1000;

export type PeriodCycle = {
  index: number;
  cycleStart: Date;
  cycleEnd: Date;
  scheduledDays: number;
  elapsedDays: number;
  finalPartial: boolean;
};

function wallClockMs(date: Date) {
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  );
}

export function diffDaysPrecise(from: Date, to: Date) {
  return Math.max(0, (wallClockMs(to) - wallClockMs(from)) / DAY_MS);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addCalendarMonths(date: Date, months: number) {
  const source = new Date(date);
  const rawMonth = source.getMonth() + months;
  const targetYear = source.getFullYear() + Math.floor(rawMonth / 12);
  const targetMonth = ((rawMonth % 12) + 12) % 12;
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(source.getDate(), daysInTargetMonth);

  return new Date(
    targetYear,
    targetMonth,
    targetDay,
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds(),
  );
}

export function getCalendarMonthCycle(start: Date, index: number): PeriodCycle {
  const cycleStart = addCalendarMonths(start, index - 1);
  const cycleEnd = addCalendarMonths(start, index);
  const scheduledDays = diffDaysPrecise(cycleStart, cycleEnd);

  return {
    index,
    cycleStart,
    cycleEnd,
    scheduledDays,
    elapsedDays: scheduledDays,
    finalPartial: false,
  };
}

export function getNextCalendarMonthBoundary(start: Date, current: Date) {
  let index = 1;
  let boundary = addCalendarMonths(start, index);

  while (boundary <= current) {
    index += 1;
    boundary = addCalendarMonths(start, index);
  }

  return { index, boundary };
}

export function buildCalendarMonthCycles(start: Date, endLimit: Date, includeFinalPartial = false) {
  const cycles: PeriodCycle[] = [];
  if (endLimit <= start) return cycles;

  let index = 1;
  let fullCycle = getCalendarMonthCycle(start, index);

  while (fullCycle.cycleEnd <= endLimit) {
    cycles.push(fullCycle);
    index += 1;
    fullCycle = getCalendarMonthCycle(start, index);
  }

  if (includeFinalPartial) {
    const partialStart = addCalendarMonths(start, index - 1);
    if (endLimit > partialStart) {
      const scheduledEnd = addCalendarMonths(start, index);
      cycles.push({
        index,
        cycleStart: partialStart,
        cycleEnd: endLimit,
        scheduledDays: diffDaysPrecise(partialStart, scheduledEnd),
        elapsedDays: diffDaysPrecise(partialStart, endLimit),
        finalPartial: true,
      });
    }
  }

  return cycles;
}
