/**
 * Admin account actions against PGlite + a real Better Auth instance: the
 * one-time password link handed to the admin, and the deletion of a player.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countUserFootprint } from "@/lib/account/service";
import { createAuth, resetAuthForTests, type Auth } from "@/lib/auth";
import { createEgg } from "@/lib/creatures/service";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import type { ObjectStorage } from "@/lib/storage/r2";
import type { StravaApi } from "@/lib/strava/api";
import { createTestDatabase, insertTestUser, type TestDatabase } from "@/lib/test/pglite";
import { createPasswordResetLink, deletePlayerAccount } from "./accounts";

const HOST_HEADERS = { host: "localhost:3000", origin: "http://localhost:3000" };
const ORIGIN = "https://mealmate.example";

let tdb: TestDatabase;
let auth: Auth;

const storage: ObjectStorage = {
  async put() {},
  async get() {
    return null;
  },
  async signedUrl(key) {
    return `https://signed.example/${key}`;
  },
  async remove() {},
  async removePrefix() {
    return 0;
  },
};
const stravaApi: StravaApi = {
  authorizeUrl: () => "https://strava.test",
  async exchangeCode() {
    return { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3_600_000), athlete: { id: 1, name: "X" } };
  },
  async refresh() {
    return { accessToken: "a", refreshToken: "r", expiresAt: new Date(Date.now() + 3_600_000), athlete: null };
  },
  async listActivities() {
    return [];
  },
  async deauthorize() {},
};

/** The session token cookie alone (without the 5-minute cookie cache, which would answer without the database). */
function cookieOf(response: Response): string {
  return (response.headers.get("set-cookie") ?? "")
    .split(",")
    .map((part) => part.split(";")[0].trim())
    .filter((part) => part.includes("session_token"))
    .join("; ");
}

function tokenOf(url: string): string {
  const token = new URL(url).searchParams.get("token");
  expect(token).toBeTruthy();
  return token ?? "";
}

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
  tdb = await createTestDatabase();
  resetAuthForTests();
  auth = createAuth(tdb.db);
});

afterAll(async () => {
  resetAuthForTests();
  await tdb.close();
});

describe("createPasswordResetLink", () => {
  it("hands the admin a one-time link that sets a new password and closes the other sessions", async () => {
    const signUp = await auth.api.signUpEmail({ body: { name: "Lina_7", email: "lina@example.com", password: "ancien-mdp-123" }, headers: new Headers(HOST_HEADERS) });
    const userId = signUp.user.id;
    const session = await auth.api.signInEmail({ body: { email: "lina@example.com", password: "ancien-mdp-123" }, headers: new Headers(HOST_HEADERS), asResponse: true });
    const cookie = cookieOf(session);
    expect((await auth.api.getSession({ headers: new Headers({ ...HOST_HEADERS, cookie }) }))?.user.id).toBe(userId);

    const link = await createPasswordResetLink(userId, ORIGIN, new Headers(HOST_HEADERS), auth);
    expect(link.url.startsWith(`${ORIGIN}/reset-password?token=`)).toBe(true);
    expect(link.email).toBe("lina@example.com");
    expect(link.validHours).toBe(24);
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    const token = tokenOf(link.url);

    const reset = await auth.api.resetPassword({ body: { newPassword: "nouveau-mdp-456", token }, headers: new Headers(HOST_HEADERS) });
    expect(reset.status).toBe(true);

    // New password in, old password out, old session closed, link spent.
    const again = await auth.api.signInEmail({ body: { email: "lina@example.com", password: "nouveau-mdp-456" }, headers: new Headers(HOST_HEADERS) });
    expect(again.user.id).toBe(userId);
    await expect(auth.api.signInEmail({ body: { email: "lina@example.com", password: "ancien-mdp-123" }, headers: new Headers(HOST_HEADERS) })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    expect(await auth.api.getSession({ headers: new Headers({ ...HOST_HEADERS, cookie }) })).toBeNull();
    await expect(auth.api.resetPassword({ body: { newPassword: "encore-un-autre-789", token }, headers: new Headers(HOST_HEADERS) })).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("gives a password to an account that never had one (Google sign-in)", async () => {
    const userId = await insertTestUser(tdb.db, "google-only@example.com", "Googly");
    const link = await createPasswordResetLink(userId, ORIGIN, new Headers(HOST_HEADERS), auth);
    const reset = await auth.api.resetPassword({ body: { newPassword: "premier-mdp-123", token: tokenOf(link.url) }, headers: new Headers(HOST_HEADERS) });
    expect(reset.status).toBe(true);
    const signIn = await auth.api.signInEmail({ body: { email: "google-only@example.com", password: "premier-mdp-123" }, headers: new Headers(HOST_HEADERS) });
    expect(signIn.user.id).toBe(userId);
  });

  it("refuses an unknown player", async () => {
    await expect(createPasswordResetLink("nobody", ORIGIN, new Headers(HOST_HEADERS), auth)).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps the public request endpoint closed: only the admin makes links", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json", ...HOST_HEADERS },
        body: JSON.stringify({ email: "lina@example.com", redirectTo: "/reset-password" }),
      }),
    );
    expect(response.status).toBe(404);
  });
});

describe("deletePlayerAccount", () => {
  it("removes the player and everything attached, and reports an unknown id", async () => {
    const signUp = await auth.api.signUpEmail({ body: { name: "Tom_9", email: "tom@example.com", password: "mot-de-passe-tom" }, headers: new Headers(HOST_HEADERS) });
    const userId = signUp.user.id;
    await createEgg(userId, "facile");
    expect((await countUserFootprint(userId)).creatures).toBe(1);
    const profilesBefore = await getDb().select().from(profiles);
    expect(profilesBefore.some((p) => p.userId === userId)).toBe(true);

    const report = await deletePlayerAccount(userId, { storage, stravaApi });
    expect(report.deleted).toBe(true);
    const footprint = await countUserFootprint(userId);
    for (const [table, n] of Object.entries(footprint)) expect(n, table).toBe(0);
    await expect(auth.api.signInEmail({ body: { email: "tom@example.com", password: "mot-de-passe-tom" }, headers: new Headers(HOST_HEADERS) })).rejects.toMatchObject({ status: "UNAUTHORIZED" });

    expect((await deletePlayerAccount(userId, { storage, stravaApi })).deleted).toBe(false);
  });
});
