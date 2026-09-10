import { describe, expect, it } from "vitest";
import { clampManualSteps, crackLevel, hatchProgress, stepCredit } from "./steps";

describe("stepCredit", () => {
  it("credits one health and two xp per thousand steps", () => {
    expect(stepCredit(3400, 0)).toEqual({ healthGain: 3, xpGain: 6, credited: 3400 });
  });

  it("only credits the new thousands after an edit", () => {
    expect(stepCredit(5200, 3400)).toEqual({ healthGain: 2, xpGain: 4, credited: 5200 });
    expect(stepCredit(3900, 3400)).toEqual({ healthGain: 0, xpGain: 0, credited: 3900 });
  });

  it("caps health at +10 per day but not xp", () => {
    expect(stepCredit(25_000, 0)).toEqual({ healthGain: 10, xpGain: 50, credited: 25_000 });
    expect(stepCredit(30_000, 25_000)).toEqual({ healthGain: 0, xpGain: 10, credited: 30_000 });
    expect(stepCredit(12_000, 8_000)).toEqual({ healthGain: 2, xpGain: 8, credited: 12_000 });
  });

  it("never removes effects when the total is lowered", () => {
    expect(stepCredit(2000, 5000)).toEqual({ healthGain: 0, xpGain: 0, credited: 5000 });
  });
});

describe("hatchProgress / crackLevel", () => {
  it("scales with the tier goal", () => {
    expect(hatchProgress(7500, "facile")).toBeCloseTo(0.5);
    expect(hatchProgress(7500, "moyen")).toBeCloseTo(0.25);
    expect(hatchProgress(99_999, "difficile")).toBe(1);
  });

  it("maps progress to crack levels", () => {
    expect(crackLevel(0.1)).toBe(0);
    expect(crackLevel(0.25)).toBe(1);
    expect(crackLevel(0.5)).toBe(2);
    expect(crackLevel(0.75)).toBe(3);
    expect(crackLevel(1)).toBe(4);
  });
});

describe("clampManualSteps", () => {
  it("rounds and clamps to 0–40 000", () => {
    expect(clampManualSteps(-5)).toBe(0);
    expect(clampManualSteps(1234.6)).toBe(1235);
    expect(clampManualSteps(99_999)).toBe(40_000);
    expect(clampManualSteps(Number.NaN)).toBe(0);
  });
});
