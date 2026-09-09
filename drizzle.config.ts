import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit is only used for `drizzle-kit check` / introspection helpers.
 * The source of truth applied to Neon is `db/init.sql` + `db/migrations/*.sql`
 * (pasted by hand in the Neon SQL editor). The TypeScript schema must match.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./db/drizzle-out",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://user:password@localhost:5432/mealmate",
  },
});
