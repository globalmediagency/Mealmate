import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTurnIceServers, isTurnConfigured, parseIceServers, resetTurnCacheForTests, TURN_TTL_SECONDS } from "./turn";

const answer = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:5349?transport=tcp"], username: "u1", credential: "c1" },
  ],
};

function fakeFetch(status = 201, body: unknown = answer) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("Cloudflare TURN credentials", () => {
  beforeEach(() => {
    resetTurnCacheForTests();
    vi.stubEnv("CLOUDFLARE_TURN_KEY_ID", "key-123");
    vi.stubEnv("CLOUDFLARE_TURN_API_TOKEN", "secret-token");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is optional: nothing without the variables", async () => {
    vi.stubEnv("CLOUDFLARE_TURN_API_TOKEN", "");
    expect(isTurnConfigured()).toBe(false);
    const { impl, calls } = fakeFetch();
    expect(await getTurnIceServers({ fetchImpl: impl })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("asks Cloudflare with the token, the key and the lifetime, and caches the answer for half of it", async () => {
    let clock = 1_000_000;
    const { impl, calls } = fakeFetch();
    const servers = await getTurnIceServers({ fetchImpl: impl, now: () => clock });
    expect(servers).toEqual(answer.iceServers);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://rtc.live.cloudflare.com/v1/turn/keys/key-123/credentials/generate-ice-servers");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ ttl: TURN_TTL_SECONDS });
    clock += (TURN_TTL_SECONDS * 1000) / 2 - 1;
    expect(await getTurnIceServers({ fetchImpl: impl, now: () => clock })).toEqual(answer.iceServers);
    expect(calls).toHaveLength(1);
    clock += 2;
    await getTurnIceServers({ fetchImpl: impl, now: () => clock });
    expect(calls).toHaveLength(2);
  });

  it("gives up quietly on an error or an unusable answer", async () => {
    expect(await getTurnIceServers({ fetchImpl: fakeFetch(401).impl })).toBeNull();
    expect(await getTurnIceServers({ fetchImpl: fakeFetch(201, { iceServers: [] }).impl })).toBeNull();
    const failing = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await getTurnIceServers({ fetchImpl: failing })).toBeNull();
  });

  it("reads both answer shapes and drops malformed entries", () => {
    expect(parseIceServers({ iceServers: { urls: "turn:a", username: "u", credential: "c" } })).toEqual([{ urls: ["turn:a"], username: "u", credential: "c" }]);
    expect(parseIceServers({ iceServers: [{ urls: [] }, { urls: ["stun:b"], username: 3 }, null, "x"] })).toEqual([{ urls: ["stun:b"] }]);
    expect(parseIceServers(null)).toEqual([]);
  });
});
