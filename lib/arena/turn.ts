/**
 * Short-lived TURN credentials for the arena's direct link (spec § 3.22),
 * from Cloudflare Realtime TURN. Optional: without the two variables the
 * phones only get public STUN servers. The API token never leaves the
 * server; the phones receive credentials that expire by themselves.
 */
import { optionalEnv } from "@/lib/env";

export type IceServer = { urls: string[]; username?: string; credential?: string };

export type TurnOptions = {
  /** Lifetime of the credentials, in seconds. */
  ttlSeconds?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

/** A battle lasts minutes; credentials live long enough for a lobby and a few matches. */
export const TURN_TTL_SECONDS = 4 * 3600;
/** The same credentials are handed to every player for half their lifetime. */
const CACHE_FRACTION = 0.5;
const ENDPOINT = (keyId: string) => `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;

type Cached = { servers: IceServer[]; expiresAt: number; keyId: string };
let cache: Cached | null = null;

/** Whether the relay is configured (no secret revealed). */
export function isTurnConfigured(): boolean {
  return optionalEnv("CLOUDFLARE_TURN_KEY_ID") !== undefined && optionalEnv("CLOUDFLARE_TURN_API_TOKEN") !== undefined;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string" && s.length > 0);

/** Reads Cloudflare's answer (`iceServers` as an array, or one object in older answers). */
export function parseIceServers(body: unknown): IceServer[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as { iceServers?: unknown }).iceServers;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
  const servers: IceServer[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const urls = typeof e.urls === "string" ? [e.urls] : isStringArray(e.urls) ? e.urls : null;
    if (!urls || urls.length === 0) continue;
    const server: IceServer = { urls };
    if (typeof e.username === "string" && typeof e.credential === "string") {
      server.username = e.username;
      server.credential = e.credential;
    }
    servers.push(server);
  }
  return servers;
}

/**
 * The relay's ICE servers for a phone, or null when the relay is not
 * configured or does not answer (the phones then keep public STUN only).
 * Credentials are cached for half their lifetime.
 */
export async function getTurnIceServers(options: TurnOptions = {}): Promise<IceServer[] | null> {
  const keyId = optionalEnv("CLOUDFLARE_TURN_KEY_ID");
  const token = optionalEnv("CLOUDFLARE_TURN_API_TOKEN");
  if (!keyId || !token) return null;
  const now = options.now ?? Date.now;
  const ttl = options.ttlSeconds ?? TURN_TTL_SECONDS;
  if (cache && cache.keyId === keyId && cache.expiresAt > now()) return cache.servers;
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(ENDPOINT(keyId), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl }),
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn(`[arena] Cloudflare TURN answered ${response.status}`);
      return null;
    }
    const servers = parseIceServers(await response.json());
    if (servers.length === 0) return null;
    cache = { servers, expiresAt: now() + ttl * 1000 * CACHE_FRACTION, keyId };
    return servers;
  } catch (error) {
    console.warn("[arena] Cloudflare TURN unreachable", error);
    return null;
  }
}

/** Test helper. */
export function resetTurnCacheForTests() {
  cache = null;
}
