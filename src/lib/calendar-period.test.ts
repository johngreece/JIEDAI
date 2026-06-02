import { describe, expect, it } from "vitest";

import {
  addCalendarMonths,
  buildCalendarMonthCycles,
  getNextCalendarMonthBoundary,
} from "@/lib/calendar-period";

describe("calendar month periods", () => {
  it("uses 28 days for a non-leap February monthly cycle", () => {
    const start = new Date(2026, 1, 1, 21, 0, 0);
    const end = addCalendarMonths(start, 1);

    expect(end).toEqual(new Date(2026, 2, 1, 21, 0, 0));
    expect((end.getTime() - start.getTime()) / 86400000).toBe(28);
  });

  it("uses 29 days for a leap-year February monthly cycle", () => {
    const start = new Date(2024, 1, 1, 21, 0, 0);
    const end = addCalendarMonths(start, 1);

    expect(end).toEqual(new Date(2024, 2, 1, 21, 0, 0));
    expect((end.getTime() - start.getTime()) / 86400000).toBe(29);
  });

  it("uses 30 and 31 days for normal calendar months", () => {
    const juneStart = new Date(2026, 5, 1, 21, 0, 0);
    const julyStart = new Date(2026, 6, 1, 21, 0, 0);

    expect((addCalendarMonths(juneStart, 1).getTime() - juneStart.getTime()) / 86400000).toBe(30);
    expect((addCalendarMonths(julyStart, 1).getTime() - julyStart.getTime()) / 86400000).toBe(31);
  });

  it("clamps end-of-month dates instead of overflowing into the following month", () => {
    const start = new Date(2026, 0, 31, 21, 0, 0);

    expect(addCalendarMonths(start, 1)).toEqual(new Date(2026, 1, 28, 21, 0, 0));
    expect(addCalendarMonths(start, 2)).toEqual(new Date(2026, 2, 31, 21, 0, 0));
  });

  it("builds full and partial calendar month cycles", () => {
    const start = new Date(2026, 1, 1, 21, 0, 0);
    const end = new Date(2026, 2, 15, 21, 0, 0);
    const cycles = buildCalendarMonthCycles(start, end, true);

    expect(cycles).toHaveLength(2);
    expect(cycles[0].scheduledDays).toBe(28);
    expect(cycles[0].elapsedDays).toBe(28);
    expect(cycles[1].scheduledDays).toBe(31);
    expect(cycles[1].elapsedDays).toBe(14);
    expect(cycles[1].finalPartial).toBe(true);
  });

  it("finds the next calendar month boundary from the original anchor", () => {
    const start = new Date(2026, 0, 31, 21, 0, 0);
    const current = new Date(2026, 1, 28, 21, 0, 0);

    expect(getNextCalendarMonthBoundary(start, current).boundary).toEqual(new Date(2026, 2, 31, 21, 0, 0));
  });
});
