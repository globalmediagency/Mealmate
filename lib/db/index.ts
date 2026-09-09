import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

/** Any Drizzle Postgres database bound to the MealMate schema. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: Db | null = null;
let override: Db | null = null;

/**
 * Lazily creates the Drizzle client on first use. Nothing connects at build
 * time; a missing `DATABASE_URL` throws a `ConfigError` at request time.
 */
export function getDb(): Db {
  if (override) return override;
  if (cached) return cached;
  const [databaseUrl] = requireEnv("DATABASE_URL");
  cached = drizzle(neon(databaseUrl), { schema });
  return cached;
}

/** Test-only: route every `getDb()` call to an in-memory database. */
export function setDbForTests(db: Db | null): void {
  override = db;
}

export { schema };
