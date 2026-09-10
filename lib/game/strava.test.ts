import { describe, expect, it } from "vitest";
import { activityDate, activityStepEquivalent, sportLabel, syncGate, syncWindowStart } from "./strava";

describe("activityStepEquivalent", () => {
  it("converts distance on foot, on a bike, and time otherwise", () => {
    expect(activityStepEquivalent({ sportType: "Run", distanceMetres: 5000, movingTimeSeconds: 1500 })).toBe(6500);
    expect(activityStepEquivalent({ sportType: "Hike", distanceMetres: 12_345, movingTimeSeconds: 0 })).toBe(16_049);
    expect(activityStepEquivalent({ sportType: "Ride", distanceMetres: 10_000, movingTimeSeconds: 1800 })).toBe(4000);
    expect(activityStepEquivalent({ sportType: "Swim", distanceMetres: 1000, movingTimeSeconds: 1800 })).toBe(3000);
    expect(activityStepEquivalent({ sportType: "Yoga", distanceMetres: 0, movingTimeSeconds: 45 * 60 })).toBe(4500);
  });

  it("caps at the daily manual maximum and never goes negative", () => {
    expect(activityStepEquivalent({ sportType: "Ride", distanceMetres: 300_000, movingTimeSeconds: 36_000 })).toBe(40_000);
    expect(activityStepEquivalent({ sportType: "Run", distanceMetres: -5, movingTimeSeconds: -5 })).toBe(0);
    expect(activityStepEquivalent({ sportType: "Run", distanceMetres: Number.NaN, movingTimeSeconds: 0 })).toBe(0);
  });
});

describe("helpers", () => {
  it("takes the local date of the activity as the game day", () => {
    expect(activityDate("2026-03-14T23:30:00Z")).toBe("2026-03-14");
    expect(activityDate("garbage")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("labels sports in French with a readable fallback", () => {
    expect(sportLabel("Run")).toBe("Course");
    expect(sportLabel("MountainBikeRide")).toBe("VTT");
    expect(sportLabel("TableTennis")).toBe("Table Tennis");
  });

  it("uses a 30-day window on first sync, then overlaps the previous sync by two days", () => {
    const now = new Date("2026-03-31T12:00:00Z");
    expect(syncWindowStart(now, null).toISOString()).toBe("2026-03-01T12:00:00.000Z");
    expect(syncWindowStart(now, new Date("2026-03-30T08:00:00Z")).toISOString()).toBe("2026-03-28T08:00:00.000Z");
    expect(syncWindowStart(now, new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-03-01T12:00:00.000Z");
  });

  it("throttles manual syncs to one every five minutes", () => {
    const now = new Date("2026-03-31T12:00:00Z");
    expect(syncGate(null, now)).toEqual({ allowed: true, retryAt: null, retryInMinutes: 0 });
    expect(syncGate(new Date("2026-03-31T11:54:00Z"), now).allowed).toBe(true);
    const gate = syncGate(new Date("2026-03-31T11:58:30Z"), now);
    expect(gate.allowed).toBe(false);
    expect(gate.retryInMinutes).toBe(4);
    expect(gate.retryAt?.toISOString()).toBe("2026-03-31T12:03:30.000Z");
  });
});
