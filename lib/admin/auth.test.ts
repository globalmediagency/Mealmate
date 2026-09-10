import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdminToken, isLoginThrottled, registerLoginAttempt, verifyAdminCredentials, verifyAdminToken } from "./auth";

describe("admin credentials", () => {
  beforeEach(() => {
    process.env.ADMIN_USERNAME = "chef";
    process.env.ADMIN_PASSWORD = "secret-mot-de-passe";
  });
  afterEach(() => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
  });

  it("accepts the exact pair only", () => {
    expect(verifyAdminCredentials("chef", "secret-mot-de-passe")).toBe(true);
    expect(verifyAdminCredentials("chef", "autre")).toBe(false);
    expect(verifyAdminCredentials("Chef", "secret-mot-de-passe")).toBe(false);
    expect(verifyAdminCredentials("", "")).toBe(false);
  });

  it("refuses everything when not configured", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(verifyAdminCredentials("chef", "secret-mot-de-passe")).toBe(false);
  });
});

describe("admin token", () => {
  it("round-trips and expires", () => {
    const now = 1_700_000_000_000;
    const token = createAdminToken(now, "k");
    expect(verifyAdminToken(token, now + 1000, "k")).toBe(true);
    expect(verifyAdminToken(token, now + 13 * 3_600_000, "k")).toBe(false);
  });

  it("rejects tampering and other keys", () => {
    const now = 1_700_000_000_000;
    const token = createAdminToken(now, "k");
    const [expires, signature] = token.split(".");
    expect(verifyAdminToken(`${Number(expires) + 99_999}.${signature}`, now, "k")).toBe(false);
    expect(verifyAdminToken(token, now, "other-key")).toBe(false);
    expect(verifyAdminToken("garbage", now, "k")).toBe(false);
    expect(verifyAdminToken(undefined, now, "k")).toBe(false);
  });
});

describe("login throttle", () => {
  it("blocks after too many failures and resets on success", () => {
    const ip = "203.0.113.9";
    const now = 1_700_000_000_000;
    for (let i = 0; i < 8; i += 1) expect(registerLoginAttempt(ip, false, now).allowed).toBe(true);
    expect(registerLoginAttempt(ip, false, now).allowed).toBe(false);
    expect(isLoginThrottled(ip, now)).toBe(true);
    expect(isLoginThrottled(ip, now + 16 * 60_000)).toBe(false);
    registerLoginAttempt(ip, true, now);
    expect(isLoginThrottled(ip, now)).toBe(false);
  });
});
