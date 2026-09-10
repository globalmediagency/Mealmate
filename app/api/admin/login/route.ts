import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminToken,
  isAdminConfigured,
  isLoginThrottled,
  registerLoginAttempt,
  verifyAdminCredentials,
} from "@/lib/admin/auth";
import { fail, handleRouteError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

const schema = z.object({ username: z.string().min(1).max(200), password: z.string().min(1).max(500) });

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** POST /api/admin/login { username, password } → sets the admin cookie. */
export async function POST(request: NextRequest) {
  try {
    if (!isAdminConfigured()) {
      return fail("config_missing", "ADMIN_USERNAME et ADMIN_PASSWORD ne sont pas définis sur Vercel.", 503);
    }
    const ip = clientIp(request);
    if (isLoginThrottled(ip)) {
      return fail("too_many_attempts", "Trop de tentatives. Réessaie dans quelques minutes.", 429);
    }
    const body = schema.parse(await request.json().catch(() => ({})));
    const ok = verifyAdminCredentials(body.username, body.password);
    const throttle = registerLoginAttempt(ip, ok);
    if (!ok) {
      return fail(
        throttle.allowed ? "invalid_credentials" : "too_many_attempts",
        throttle.allowed ? "Identifiant ou mot de passe incorrect." : "Trop de tentatives. Réessaie dans quelques minutes.",
        throttle.allowed ? 401 : 429,
      );
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, createAdminToken(), adminCookieOptions);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
