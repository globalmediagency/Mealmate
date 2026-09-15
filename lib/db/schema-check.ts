import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { MIGRATIONS, missingMigrations, type Migration } from "./migrations-catalog";

export type SchemaStatus = { missing: Migration[] };

let readyPromise: Promise<SchemaStatus> | null = null;

/**
 * Checks that every migration of the catalogue is applied (one query on
 * `information_schema`). A complete schema is remembered for the life of the
 * process; an incomplete one is re-checked on every call so the app recovers
 * as soon as the SQL is pasted in Neon. Throws `ConfigError` when the
 * database is not configured, like any query.
 */
export async function checkSchema(): Promise<SchemaStatus> {
  if (readyPromise) return readyPromise;
  const status = await querySchema();
  if (status.missing.length === 0) readyPromise = Promise.resolve(status);
  return status;
}

async function querySchema(): Promise<SchemaStatus> {
  const tables = [...new Set(MIGRATIONS.flatMap((m) => m.checks.map((c) => c.table)))];
  const rows = await getDb().execute<{ table_name: string; column_name: string | null }>(sql`
    select t.table_name, c.column_name
    from information_schema.tables t
    left join information_schema.columns c on c.table_schema = t.table_schema and c.table_name = t.table_name
    where t.table_schema = 'public' and t.table_name in ${tables}
  `);
  const existing = new Set<string>();
  for (const row of rowsOf<{ table_name: string; column_name: string | null }>(rows)) {
    existing.add(row.table_name);
    if (row.column_name) existing.add(`${row.table_name}.${row.column_name}`);
  }
  return { missing: missingMigrations(existing) };
}

/** Drizzle drivers disagree on the shape of `execute()`: Neon HTTP returns `{ rows }`, PGlite an array. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows: unknown }).rows)) return (result as { rows: T[] }).rows;
  return [];
}

/** Test-only: forget a remembered complete schema. */
export function resetSchemaCheckForTests(): void {
  readyPromise = null;
}

/** Postgres "undefined column / table" errors, i.e. a migration was not applied. */
export function isSchemaError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (code === "42703" || code === "42P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
