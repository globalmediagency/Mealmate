/**
 * Minimal Strava API client (OAuth2 + activities). Every call is lazy: the
 * client id / secret are read with `requireEnv` at call time, never at import.
 */
import { z } from "zod";
import { DomainError } from "@/lib/api/errors";
import { requireEnv } from "@/lib/env";

const STRAVA_OAUTH = "https://www.strava.com/oauth";
const STRAVA_API = "https://www.strava.com/api/v3";

export const STRAVA_SCOPE = "activity:read_all";

export type StravaTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  athlete: { id: number; name: string | null } | null;
};

export type StravaActivity = {
  id: number;
  name: string;
  sportType: string;
  distanceMetres: number;
  movingTimeSeconds: number;
  /** ISO timestamp in the athlete's local time (Strava `start_date_local`). */
  startDateLocal: string;
};

export type StravaApi = {
  authorizeUrl(input: { redirectUri: string; state: string }): string;
  exchangeCode(code: string): Promise<StravaTokens>;
  refresh(refreshToken: string): Promise<StravaTokens>;
  listActivities(accessToken: string, input: { after: Date; page: number; perPage: number }): Promise<StravaActivity[]>;
  deauthorize(accessToken: string): Promise<void>;
};

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number(),
  athlete: z
    .object({ id: z.number(), firstname: z.string().nullish(), lastname: z.string().nullish() })
    .passthrough()
    .nullish(),
});

const activitySchema = z
  .object({
    id: z.number(),
    name: z.string().default(""),
    sport_type: z.string().nullish(),
    type: z.string().nullish(),
    distance: z.number().nullish(),
    moving_time: z.number().nullish(),
    start_date_local: z.string(),
  })
  .passthrough();

function toTokens(raw: z.infer<typeof tokenSchema>): StravaTokens {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: new Date(raw.expires_at * 1000),
    athlete: raw.athlete ? { id: raw.athlete.id, name: raw.athlete.firstname?.trim() || null } : null,
  };
}

async function stravaError(response: Response, what: string): Promise<never> {
  const text = await response.text().catch(() => "");
  console.warn(`[strava] ${what} failed`, response.status, text.slice(0, 300));
  if (response.status === 401) throw new DomainError("strava_unauthorized", "Strava a refusé l'accès : reconnecte ton compte.", 401);
  if (response.status === 429) throw new DomainError("strava_rate_limited", "Strava limite les appels pour le moment : réessaie dans quelques minutes.", 429);
  throw new DomainError("strava_error", "Strava ne répond pas correctement. Réessaie plus tard.", 502);
}

async function tokenRequest(body: Record<string, string>, what: string): Promise<StravaTokens> {
  const [clientId, clientSecret] = requireEnv("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET");
  const response = await fetch(`${STRAVA_OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...body }),
    cache: "no-store",
  });
  if (!response.ok) await stravaError(response, what);
  return toTokens(tokenSchema.parse(await response.json()));
}

export const stravaApi: StravaApi = {
  authorizeUrl({ redirectUri, state }) {
    const [clientId] = requireEnv("STRAVA_CLIENT_ID");
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      approval_prompt: "auto",
      scope: STRAVA_SCOPE,
      state,
    });
    return `${STRAVA_OAUTH}/authorize?${params.toString()}`;
  },

  exchangeCode(code) {
    return tokenRequest({ code, grant_type: "authorization_code" }, "code exchange");
  },

  refresh(refreshToken) {
    return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" }, "token refresh");
  },

  async listActivities(accessToken, { after, page, perPage }) {
    const params = new URLSearchParams({
      after: String(Math.floor(after.getTime() / 1000)),
      page: String(page),
      per_page: String(perPage),
    });
    const response = await fetch(`${STRAVA_API}/athlete/activities?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) await stravaError(response, "activities");
    const rows = z.array(activitySchema).parse(await response.json());
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sportType: row.sport_type ?? row.type ?? "Workout",
      distanceMetres: row.distance ?? 0,
      movingTimeSeconds: row.moving_time ?? 0,
      startDateLocal: row.start_date_local,
    }));
  },

  async deauthorize(accessToken) {
    const response = await fetch(`${STRAVA_OAUTH}/deauthorize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    // Best effort: a revoked or expired token is already deauthorized.
    if (!response.ok && response.status !== 401) console.warn("[strava] deauthorize failed", response.status);
  },
};
