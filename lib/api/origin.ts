import { optionalEnv } from "@/lib/env";

/** Public origin of the current request (Vercel preview or production), for redirect URLs. */
export function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return optionalEnv("APP_URL") ?? new URL(request.url).origin;
}
