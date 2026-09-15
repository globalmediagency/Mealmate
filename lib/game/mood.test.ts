import { describe, expect, it } from "vitest";
import { applyMoodToXp, chestBonusSteps, gloomyHours, moodBand, moodXpMultiplier } from "./mood";
import { DEFAULT_RULES } from "./rules";

describe("moodBand", () => {
  it("splits the gauge into gloomy < 20, low < 30, neutral, happy ≥ 70", () => {
    expect(moodBand(0)).toBe("gloomy");
    expect(moodBand(19.9)).toBe("gloomy");
    expect(moodBand(20)).toBe("low");
    expect(moodBand(29.9)).toBe("low");
    expect(moodBand(30)).toBe("neutral");
    expect(moodBand(69.9)).toBe("neutral");
    expect(moodBand(70)).toBe("happy");
    expect(moodBand(100)).toBe("happy");
  });
});

describe("moodXpMultiplier / applyMoodToXp", () => {
  it("gives +25 % when happy, −25 % when low or gloomy, nothing otherwise", () => {
    expect(moodXpMultiplier(80)).toBe(1.25);
    expect(moodXpMultiplier(50)).toBe(1);
    expect(moodXpMultiplier(25)).toBe(0.75);
    expect(moodXpMultiplier(5)).toBe(0.75);
    expect(applyMoodToXp(10, 80)).toBe(13);
    expect(applyMoodToXp(10, 50)).toBe(10);
    expect(applyMoodToXp(10, 25)).toBe(8);
  });

  it("never turns a positive gain into 0 unless the malus is total", () => {
    expect(applyMoodToXp(1, 25)).toBe(1);
    expect(applyMoodToXp(0, 80)).toBe(0);
    expect(applyMoodToXp(10, 25, { ...DEFAULT_RULES.mood, xpMalusPercent: 100 })).toBe(0);
  });

  it("follows the admin rules", () => {
    const rules = { ...DEFAULT_RULES.mood, happyMin: 50, xpBonusPercent: 50 };
    expect(moodXpMultiplier(55, rules)).toBe(1.5);
  });
});

describe("chestBonusSteps", () => {
  it("banks 10 % of the credited steps while happy, nothing otherwise", () => {
    expect(chestBonusSteps(3400, 80)).toBe(340);
    expect(chestBonusSteps(3400, 69)).toBe(0);
    expect(chestBonusSteps(0, 90)).toBe(0);
    expect(chestBonusSteps(999, 90, { ...DEFAULT_RULES.mood, chestStepsBonusPercent: 0 })).toBe(0);
  });
});

describe("gloomyHours", () => {
  it("counts the hours spent under the gloomy threshold as the mood decays", () => {
    expect(gloomyHours(10, 1, 5)).toBe(5);
    expect(gloomyHours(30, 1, 5)).toBe(0);
    expect(gloomyHours(30, 1, 15)).toBe(5);
    expect(gloomyHours(30, 0, 15)).toBe(0);
    expect(gloomyHours(10, 1, 0)).toBe(0);
  });
});
