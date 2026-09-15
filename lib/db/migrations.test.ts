import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@/lib/test/pglite";
import { MIGRATIONS, migrationsSql, missingMigrations } from "./migrations-catalog";
import { checkSchema, isSchemaError, resetSchemaCheckForTests } from "./schema-check";

const stripComments = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.startsWith("--") && line.trim() !== "")
    .join("\n");

describe("migrations catalogue", () => {
  it("mirrors every file of db/migrations, statements included", () => {
    const dir = path.resolve(process.cwd(), "db/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    expect(MIGRATIONS.map((m) => m.file)).toEqual(files);
    for (const m of MIGRATIONS) {
      expect(m.file.startsWith(`${m.id}_`)).toBe(true);
      expect(stripComments(m.sql)).toBe(stripComments(readFileSync(path.join(dir, m.file), "utf8")));
    }
  });

  it("reports the migrations whose tables or columns are absent", () => {
    const all = new Set(MIGRATIONS.flatMap((m) => m.checks.map((c) => (c.column ? `${c.table}.${c.column}` : c.table))));
    expect(missingMigrations(all)).toEqual([]);
    all.delete("boardings.status");
    all.delete("creatures.chest_bonus_steps");
    expect(missingMigrations(all).map((m) => m.id)).toEqual(["011", "012"]);
    expect(migrationsSql(missingMigrations(all))).toContain("-- Migration 011");
  });

  it("recognises Postgres undefined column / table errors, even wrapped", () => {
    expect(isSchemaError({ code: "42703" })).toBe(true);
    expect(isSchemaError(new Error("Failed query", { cause: { code: "42P01" } }))).toBe(true);
    expect(isSchemaError(new Error("boom"))).toBe(false);
    expect(isSchemaError({ code: "23505" })).toBe(false);
  });
});

describe("checkSchema", () => {
  let tdb: TestDatabase;
  beforeAll(async () => {
    tdb = await createTestDatabase();
  });
  afterAll(async () => {
    await tdb.close();
  });

  it("finds a complete schema, then a dropped column, then recovers once the SQL is applied", async () => {
    resetSchemaCheckForTests();
    expect((await checkSchema()).missing).toEqual([]);

    resetSchemaCheckForTests();
    await tdb.pglite.exec("ALTER TABLE creatures DROP COLUMN chest_bonus_steps; ALTER TABLE boardings DROP COLUMN owner_seen_at;");
    const missing = (await checkSchema()).missing;
    expect(missing.map((m) => m.id)).toEqual(["011", "012"]);

    // Not remembered while incomplete: applying the SQL is enough.
    await tdb.pglite.exec(migrationsSql(missing));
    expect((await checkSchema()).missing).toEqual([]);
  });
});
