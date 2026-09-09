/**
 * End-to-end check of Better Auth + the Drizzle schema + the profile hook,
 * running against an embedded Postgres (PGlite) initialised with db/init.sql.
 * This is the closest we can get to Neon without a network.
 */
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, schema, setDbForTests, type Db } from "@/lib/db";
import { createProfile, getProfile, UsernameTakenError } from "@/lib/profile/service";
import { createAuth, resetAuthForTests, type Auth } from "./index";

const HOST_HEADERS = { host: "localhost:3000", origin: "http://localhost:3000" };

let pglite: PGlite;
let db: Db;
let auth: Auth;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-1234";
  pglite = new PGlite();
  await pglite.exec(readFileSync(path.resolve(__dirname, "../../db/init.sql"), "utf8"));
  db = drizzle(pglite, { schema }) as unknown as Db;
  setDbForTests(db);
  resetAuthForTests();
  auth = createAuth(db);
});

afterAll(async () => {
  setDbForTests(null);
  resetAuthForTests();
  await pglite.close();
});

describe("init.sql", () => {
  it("creates every table declared in the Drizzle schema", async () => {
    const rows = await pglite.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    const names = new Set(rows.rows.map((r) => r.table_name));
    for (const table of [
      "user",
      "session",
      "account",
      "verification",
      "profiles",
      "creatures",
      "meals",
      "step_entries",
      "play_sessions",
      "user_accessories",
      "creature_outfits",
      "friendships",
      "purchases",
      "inventory",
      "strava_connections",
    ]) {
      expect(names.has(table), `missing table ${table}`).toBe(true);
    }
  });

  it("is idempotent (can be re-run)", async () => {
    await expect(
      pglite.exec(readFileSync(path.resolve(__dirname, "../../db/init.sql"), "utf8")),
    ).resolves.not.toThrow();
  });
});

describe("sign-up with a valid pseudo", () => {
  it("creates the user, the session and the profile with a friend code", async () => {
    const result = await auth.api.signUpEmail({
      body: { name: "Chabond_42", email: "chabond@example.com", password: "motdepasse123" },
      headers: new Headers(HOST_HEADERS),
    });
    expect(result.user.email).toBe("chabond@example.com");
    expect(result.token).toBeTruthy();

    const profile = await getProfile(result.user.id);
    expect(profile?.username).toBe("Chabond_42");
    expect(profile?.friendCode).toMatch(/^MM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("signs in and resolves the session from the cookie", async () => {
    const signIn = await auth.api.signInEmail({
      body: { email: "chabond@example.com", password: "motdepasse123" },
      headers: new Headers(HOST_HEADERS),
      asResponse: true,
    });
    expect(signIn.status).toBe(200);
    const setCookie = signIn.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("better-auth.session_token");
    const cookie = setCookie
      .split(",")
      .map((part) => part.split(";")[0].trim())
      .filter((part) => part.includes("better-auth"))
      .join("; ");

    const session = await auth.api.getSession({
      headers: new Headers({ ...HOST_HEADERS, cookie }),
    });
    expect(session?.user.email).toBe("chabond@example.com");
  });

  it("rejects a wrong password", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: "chabond@example.com", password: "mauvais-mdp" },
        headers: new Headers(HOST_HEADERS),
      }),
    ).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });

  it("rejects a duplicate email", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { name: "Autre_Pseudo", email: "chabond@example.com", password: "motdepasse123" },
        headers: new Headers(HOST_HEADERS),
      }),
    ).rejects.toMatchObject({ status: "UNPROCESSABLE_ENTITY" });
  });
});

describe("sign-up with a name that is not a valid pseudo (Google-like)", () => {
  it("creates the user but no profile, then onboarding can create it", async () => {
    const result = await auth.api.signUpEmail({
      body: { name: "Jean Dupont", email: "jean@example.com", password: "motdepasse123" },
      headers: new Headers(HOST_HEADERS),
    });
    expect(await getProfile(result.user.id)).toBeNull();

    const profile = await createProfile(result.user.id, "JeanD");
    expect(profile.username).toBe("JeanD");
  });

  it("refuses a pseudo already taken, case-insensitively", async () => {
    const result = await auth.api.signUpEmail({
      body: { name: "Encore Un Nom", email: "encore@example.com", password: "motdepasse123" },
      headers: new Headers(HOST_HEADERS),
    });
    await expect(createProfile(result.user.id, "chabond_42")).rejects.toBeInstanceOf(
      UsernameTakenError,
    );
    expect(await getProfile(result.user.id)).toBeNull();
  });
});

describe("schema constraints", () => {
  it("allows a single active creature per user", async () => {
    const [user] = await getDb().select().from(schema.user).where(eq(schema.user.email, "chabond@example.com"));
    await getDb().insert(schema.creatures).values({ userId: user.id, tier: "facile" });
    // Drizzle wraps driver errors in DrizzleQueryError; the Postgres code is on `cause`.
    await expect(
      getDb().insert(schema.creatures).values({ userId: user.id, tier: "moyen" }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("cascades deletes from user to profile and creatures", async () => {
    const [user] = await getDb().select().from(schema.user).where(eq(schema.user.email, "chabond@example.com"));
    await getDb().delete(schema.user).where(eq(schema.user.id, user.id));
    expect(await getProfile(user.id)).toBeNull();
    const creatures = await getDb().select().from(schema.creatures).where(eq(schema.creatures.userId, user.id));
    expect(creatures).toHaveLength(0);
  });
});
