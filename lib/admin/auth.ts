import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { optionalEnv } from "@/lib/env";

export const ADMIN_COOKIE = "mm_admin";
const SESSION_HOURS = 12;

/** True when both admin credentials are configured on Vercel. */
export function isAdminConfigured(): boolean {
  return Boolean(optionalEnv("ADMIN_USERNAME") && optionalEnv("ADMIN_PASSWORD"));
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Constant-time check of the submitted credentials against the env vars. */
export function verifyAdminCredentials(username: string, password: string): boolean {
  const expectedUser = optionalEnv("ADMIN_USERNAME");
  const expectedPassword = optionalEnv("ADMIN_PASSWORD");
  if (!expectedUser || !expectedPassword) return false;
  // Compare both so timing does not leak which one is wrong.
  const userOk = safeEqual(username, expectedUser);
  const passwordOk = safeEqual(password, expectedPassword);
  return userOk && passwordOk;
}

function signingKey(): string {
  // The admin password itself keys the HMAC: changing it revokes every session.
  return `${optionalEnv("BETTER_AUTH_SECRET") ?? ""}|${optionalEnv("ADMIN_PASSWORD") ?? ""}`;
}

function sign(payload: string, key = signingKey()): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Creates a signed, expiring token: `<expiry ms>.<hmac>`. */
export function createAdminToken(now = Date.now(), key?: string): string {
  const expires = String(now + SESSION_HOURS * 3_600_000);
  return `${expires}.${sign(expires, key)}`;
}

export function verifyAdminToken(token: string | undefined, now = Date.now(), key?: string): boolean {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < now) return false;
  return safeEqual(signature, sign(expires, key));
}

export const adminCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_HOURS * 3600,
};

/** True when the request carries a valid admin cookie. */
export async function isAdminSession(): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}

/** Server pages: redirects to the login page when not signed in as admin. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdminSession())) redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// Tiny in-memory throttle for login attempts (per serverless instance).
// ---------------------------------------------------------------------------
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60_000;

export function registerLoginAttempt(ip: string, success: boolean, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const entry = attempts.get(ip);
  if (entry && entry.resetAt <= now) attempts.delete(ip);
  const current = attempts.get(ip) ?? { count: 0, resetAt: now + WINDOW_MS };
  if (success) {
    attempts.delete(ip);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  attempts.set(ip, current);
  if (current.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function isLoginThrottled(ip: string, now = Date.now()): boolean {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    attempts.delete(ip);
    return false;
  }
  return entry.count > MAX_ATTEMPTS;
}
