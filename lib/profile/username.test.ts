import { describe, expect, it } from "vitest";
import { validateUsername } from "./username";

describe("validateUsername", () => {
  it("accepts a plain pseudo and trims it", () => {
    expect(validateUsername("  Chabond_42 ")).toEqual({
      ok: true,
      username: "Chabond_42",
    });
  });

  it("rejects too short or too long values", () => {
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("a".repeat(21)).ok).toBe(false);
  });

  it("rejects forbidden characters and reserved names", () => {
    expect(validateUsername("jean dupont").ok).toBe(false);
    expect(validateUsername("émile").ok).toBe(false);
    expect(validateUsername("Admin").ok).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(validateUsername(42).ok).toBe(false);
    expect(validateUsername(undefined).ok).toBe(false);
  });
});
