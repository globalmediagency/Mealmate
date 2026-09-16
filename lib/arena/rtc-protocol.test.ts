import { describe, expect, it } from "vitest";
import { isOfferer, NonceMemory, parsePeerMessage, parseSignal, randomNonce } from "./rtc-protocol";

describe("rtc protocol", () => {
  it("lets the smaller id open the connection, and only one of the two", () => {
    expect(isOfferer("alice", "bob")).toBe(true);
    expect(isOfferer("bob", "alice")).toBe(false);
  });

  it("accepts well-formed peer messages and rejects the rest", () => {
    expect(parsePeerMessage(JSON.stringify({ t: "egg", nonce: "a1", target: "u2", x: 0.1, y: -0.2 }))).toEqual({ t: "egg", nonce: "a1", target: "u2", x: 0.1, y: -0.2 });
    expect(parsePeerMessage({ t: "hit", nonce: "a1", target: null, x: 0, y: 0, hit: true })).toMatchObject({ t: "hit", hit: true, target: null });
    expect(parsePeerMessage({ t: "tongue", nonce: "b", angle: 1, length: 2 })).toMatchObject({ t: "tongue" });
    expect(parsePeerMessage({ t: "eat", nonce: "c", bonusIds: ["x", "y"] })).toMatchObject({ t: "eat", bonusIds: ["x", "y"] });
    expect(parsePeerMessage({ t: "egg", nonce: "a1", target: 3, x: 0, y: 0 })).toBeNull();
    expect(parsePeerMessage({ t: "egg", target: "u2", x: 0, y: 0 })).toBeNull();
    expect(parsePeerMessage({ t: "hit", nonce: "a", target: "u", x: Number.NaN, y: 0, hit: false })).toBeNull();
    expect(parsePeerMessage({ t: "eat", nonce: "c", bonusIds: [1] })).toBeNull();
    expect(parsePeerMessage("not json")).toBeNull();
    expect(parsePeerMessage({ t: "boom", nonce: "z" })).toBeNull();
  });

  it("reads signals", () => {
    expect(parseSignal({ type: "hello", session: "s1" })).toEqual({ type: "hello", session: "s1" });
    expect(parseSignal({ type: "offer", session: "s1", sdp: "v=0" })).toEqual({ type: "offer", session: "s1", sdp: "v=0" });
    expect(parseSignal({ type: "answer", session: "s2", target: "s1", sdp: "v=0" })).toMatchObject({ type: "answer", target: "s1" });
    expect(parseSignal({ type: "answer", session: "s2", sdp: "v=0" })).toBeNull();
    expect(parseSignal({ type: "offer", session: "" })).toBeNull();
  });

  it("remembers ids once, within its capacity", () => {
    const memory = new NonceMemory(3);
    expect(memory.add("a")).toBe(true);
    expect(memory.add("a")).toBe(false);
    memory.add("b");
    memory.add("c");
    memory.add("d");
    expect(memory.has("a")).toBe(false);
    expect(memory.has("d")).toBe(true);
    expect(memory.add(undefined)).toBe(true);
    expect(randomNonce()).toMatch(/^[0-9a-f]{16}$/);
    expect(randomNonce()).not.toBe(randomNonce());
  });
});
