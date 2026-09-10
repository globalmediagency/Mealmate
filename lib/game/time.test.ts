import { describe, expect, it } from "vitest";
import { daysBetween, gameDate, hoursBetween, shiftDate } from "./time";

describe("gameDate", () => {
  it("uses the Paris calendar day", () => {
    // 23:30 UTC on 9 Sept is already 10 Sept in Paris (UTC+2 in summer).
    expect(gameDate(new Date("2026-09-09T23:30:00Z"))).toBe("2026-09-10");
    // 23:30 UTC on 9 Jan is 00:30 on 10 Jan in Paris (UTC+1 in winter).
    expect(gameDate(new Date("2026-01-09T23:30:00Z"))).toBe("2026-01-10");
    expect(gameDate(new Date("2026-01-09T22:30:00Z"))).toBe("2026-01-09");
  });
});

describe("shiftDate", () => {
  it("handles month and year boundaries", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2026-09-10", -13)).toBe("2026-08-28");
  });
});

describe("daysBetween / hoursBetween", () => {
  it("floors days and never goes negative", () => {
    const a = new Date("2026-09-01T10:00:00Z");
    expect(daysBetween(a, new Date("2026-09-03T09:59:00Z"))).toBe(1);
    expect(daysBetween(a, new Date("2026-09-03T10:00:00Z"))).toBe(2);
    expect(daysBetween(new Date("2026-09-05T00:00:00Z"), a)).toBe(0);
  });

  it("returns fractional hours", () => {
    const a = new Date("2026-09-01T10:00:00Z");
    expect(hoursBetween(a, new Date("2026-09-01T11:30:00Z"))).toBeCloseTo(1.5);
    expect(hoursBetween(new Date("2026-09-02T10:00:00Z"), a)).toBe(0);
  });
});
