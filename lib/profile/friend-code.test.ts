import { describe, expect, it } from "vitest";
import { generateFriendCode, normalizeFriendCode } from "./friend-code";

describe("generateFriendCode", () => {
  it("has the documented shape", () => {
    const code = generateFriendCode();
    expect(code).toMatch(/^MM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("is deterministic with an injected random source", () => {
    expect(generateFriendCode(() => 0)).toBe("MM-AAAAAA");
  });

  it("never contains ambiguous characters", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateFriendCode()).not.toMatch(/[01IO]/);
    }
  });
});

describe("normalizeFriendCode", () => {
  it("accepts lowercase, spaces and a missing prefix", () => {
    expect(normalizeFriendCode("mm-7k3q2x")).toBe("MM-7K3Q2X");
    expect(normalizeFriendCode(" 7K3Q2X ")).toBe("MM-7K3Q2X");
    expect(normalizeFriendCode("MM 7K3Q2X")).toBe("MM-7K3Q2X");
  });

  it("rejects bad lengths or characters", () => {
    expect(normalizeFriendCode("MM-7K3Q")).toBeNull();
    expect(normalizeFriendCode("MM-7K3Q2I")).toBeNull();
    expect(normalizeFriendCode("")).toBeNull();
  });
});
