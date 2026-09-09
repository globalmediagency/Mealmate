/**
 * Environment access helpers.
 *
 * The build must never depend on environment variables: every external client
 * (Neon, Better Auth, R2, Gemini, Stripe, Strava) is created lazily, at request
 * time, through `requireEnv`. When a variable is missing we throw a
 * `ConfigError` that API routes turn into a clean 503 JSON response and pages
 * turn into a friendly banner instead of crashing.
 */

export class ConfigError extends Error {
  readonly code = "config_missing" as const;
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `Configuration incomplète : variable(s) d'environnement manquante(s) : ${missing.join(", ")}`,
    );
    this.name = "ConfigError";
    this.missing = missing;
  }
}

export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError;
}

/** Returns the trimmed value of an env var, or `undefined` when unset/blank. */
export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Returns the values of the requested env vars, throwing `ConfigError` if any is missing. */
export function requireEnv<const T extends readonly string[]>(
  ...names: T
): { [K in keyof T]: string } {
  const missing = names.filter((name) => optionalEnv(name) === undefined);
  if (missing.length > 0) throw new ConfigError(missing);
  return names.map((name) => optionalEnv(name) as string) as {
    [K in keyof T]: string;
  };
}

export type ConfigStatus = {
  database: boolean;
  authSecret: boolean;
  google: boolean;
  r2: boolean;
  gemini: boolean;
  stripe: boolean;
  strava: boolean;
};

/** Non-secret overview of which integrations are configured (booleans only). */
export function getConfigStatus(): ConfigStatus {
  const has = (...names: string[]) =>
    names.every((name) => optionalEnv(name) !== undefined);
  return {
    database: has("DATABASE_URL"),
    authSecret: has("BETTER_AUTH_SECRET"),
    google: has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    r2: has(
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
    ),
    gemini: has("GEMINI_API_KEY"),
    stripe: has("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"),
    strava: has("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"),
  };
}

/** True when the minimum needed to sign in exists (database + auth secret). */
export function isCoreConfigured(): boolean {
  const status = getConfigStatus();
  return status.database && status.authSecret;
}

export function isDevGalleryEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_GALLERY === "true";
}
