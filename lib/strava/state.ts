/**
 * Signed OAuth `state` parameter: binds the Strava callback to the user who
 * started the flow (CSRF protection) without any server-side storage.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";

const STATE_TTL_MS = 10 * 60_000;

function key(explicit?: string): string {
  return explicit ?? requireEnv("BETTER_AUTH_SECRET")[0];
}

function sign(payload: string, signingKey: string): string {
  return createHmac("sha256", signingKey).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** `<base64url payload>.<hmac>` with payload `{ u: userId, e: expiry ms }`. */
export function createStravaState(userId: string, now = Date.now(), signingKey?: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: now + STATE_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload, key(signingKey))}`;
}

/** True when the state was issued for `userId`, is untampered and not expired. */
export function verifyStravaState(state: string | null | undefined, userId: string, now = Date.now(), signingKey?: string): boolean {
  if (!state) return false;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload, key(signingKey)))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; e?: unknown };
    return parsed.u === userId && typeof parsed.e === "number" && parsed.e >= now;
  } catch {
    return false;
  }
}
