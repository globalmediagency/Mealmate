/**
 * Test helper: an embedded Postgres (PGlite) initialised with db/init.sql and
 * wired into `getDb()`. Import only from *.test.ts files.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { schema, setDbForTests, type Db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export type TestDatabase = { pglite: PGlite; db: Db; close: () => Promise<void> };

export async function createTestDatabase(): Promise<TestDatabase> {
  const pglite = new PGlite();
  const initSql = readFileSync(path.resolve(process.cwd(), "db/init.sql"), "utf8");
  await pglite.exec(initSql);
  const db = drizzle(pglite, { schema }) as unknown as Db;
  setDbForTests(db);
  return {
    pglite,
    db,
    close: async () => {
      setDbForTests(null);
      await pglite.close();
    },
  };
}

/** Inserts a bare Better Auth user row (no password) and returns its id. */
export async function insertTestUser(db: Db, email: string, name = "Testeur"): Promise<string> {
  const id = `user_${email.replace(/[^a-z0-9]/gi, "_")}`;
  await db.insert(user).values({ id, name, email, emailVerified: false });
  return id;
}
