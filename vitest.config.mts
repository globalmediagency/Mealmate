import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json keeps `jsx: preserve` for Next.js; tests need real JSX output (Vite 8 uses oxc).
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
    // Several embedded Postgres (PGlite) instances boot in parallel: give hooks room.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
