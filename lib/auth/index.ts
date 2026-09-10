import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, type Db } from "@/lib/db";
import { account, session, user, verification } from "@/lib/db/schema";
import { purgeExternalData } from "@/lib/account/service";
import { isAdminIdentifier } from "@/lib/admin/auth";
import { optionalEnv, requireEnv } from "@/lib/env";
import { tryCreateProfileFromName } from "@/lib/profile/service";
import { r2Storage } from "@/lib/storage/r2";
import { stravaApi } from "@/lib/strava/api";

/**
 * Hosts allowed to serve the auth API. Vercel preview deployments each get a
 * different `*.vercel.app` hostname, so the base URL is resolved per request
 * from the `Host` header and checked against this allow-list.
 */
function allowedHosts(): string[] {
  const hosts = new Set<string>(["localhost:3000", "127.0.0.1:3000", "*.vercel.app"]);
  const appUrl = optionalEnv("APP_URL");
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).host);
    } catch {
      // Ignore malformed APP_URL; the fallback below will surface it.
    }
  }
  for (const extra of (optionalEnv("AUTH_ALLOWED_HOSTS") ?? "").split(",")) {
    const host = extra.trim();
    if (host) hosts.add(host);
  }
  return [...hosts];
}

function socialProviders(): BetterAuthOptions["socialProviders"] {
  const clientId = optionalEnv("GOOGLE_CLIENT_ID");
  const clientSecret = optionalEnv("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return {};
  return { google: { clientId, clientSecret, prompt: "select_account" } };
}

/** Builds a Better Auth instance bound to `db` (exported for integration tests). */
export function createAuth(db?: Db) {
  const [secret] = requireEnv("DATABASE_URL", "BETTER_AUTH_SECRET");
  const database = db ?? getDb();
  return betterAuth({
    appName: "MealMate",
    secret,
    baseURL: {
      allowedHosts: allowedHosts(),
      fallback: optionalEnv("APP_URL"),
      protocol: "auto",
    },
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: false,
      autoSignIn: true,
    },
    socialProviders: socialProviders(),
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: {
      deleteUser: {
        enabled: true,
        // Photos (R2) and the Strava grant are outside the database cascade.
        beforeDelete: async (deleted) => {
          await purgeExternalData(deleted.id, { storage: r2Storage, stravaApi });
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // The admin login is reserved: no player account may use it as email or pseudo.
          before: async (newUser) => {
            if (isAdminIdentifier(newUser.email) || isAdminIdentifier(newUser.name)) {
              throw new APIError("BAD_REQUEST", { message: "Cet identifiant est réservé." });
            }
          },
          after: async (createdUser) => {
            await tryCreateProfileFromName(createdUser.id, createdUser.name);
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

let cached: Auth | null = null;

/** Lazily builds the Better Auth instance (never at build time). */
export function getAuth(): Auth {
  if (cached) return cached;
  cached = createAuth();
  return cached;
}

/** Test-only: drop the cached instance so the next `getAuth()` rebuilds it. */
export function resetAuthForTests(): void {
  cached = null;
}

/** True when Google sign-in is configured (client id + secret present). */
export function isGoogleEnabled(): boolean {
  return Boolean(optionalEnv("GOOGLE_CLIENT_ID") && optionalEnv("GOOGLE_CLIENT_SECRET"));
}
