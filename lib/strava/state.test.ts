import { describe, expect, it } from "vitest";
import { createStravaState, verifyStravaState } from "./state";

const KEY = "test-secret";

describe("strava oauth state", () => {
  it("round-trips for the same user within ten minutes", () => {
    const now = 1_700_000_000_000;
    const state = createStravaState("user_1", now, KEY);
    expect(verifyStravaState(state, "user_1", now + 60_000, KEY)).toBe(true);
    expect(verifyStravaState(state, "user_1", now + 11 * 60_000, KEY)).toBe(false);
    expect(verifyStravaState(state, "user_2", now, KEY)).toBe(false);
  });

  it("rejects tampering, wrong keys and garbage", () => {
    const now = Date.now();
    const state = createStravaState("user_1", now, KEY);
    const [payload, signature] = state.split(".");
    const forged = `${Buffer.from(JSON.stringify({ u: "user_2", e: now + 60_000 })).toString("base64url")}.${signature}`;
    expect(verifyStravaState(forged, "user_2", now, KEY)).toBe(false);
    expect(verifyStravaState(`${payload}.abc`, "user_1", now, KEY)).toBe(false);
    expect(verifyStravaState(state, "user_1", now, "other-key")).toBe(false);
    expect(verifyStravaState("", "user_1", now, KEY)).toBe(false);
    expect(verifyStravaState("nodot", "user_1", now, KEY)).toBe(false);
  });
});
