import path from "node:path";
import { defineConfig } from "vitest/config";
import "dotenv/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      // Pure logic — no services required.
      { resolve: { alias }, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      // Needs PostgreSQL (+pgvector). Creates / migrates its own throw-away database `tripsync_test`.
      {
        resolve: { alias },
        test: { name: "db", include: ["tests/db/**/*.test.ts"], fileParallelism: false, testTimeout: 30000, globalSetup: ["tests/db/globalSetup.ts"] },
      },
      // Needs the running app (default http://localhost:3000, set API_BASE_URL) + both databases, migrated and seeded.
      { resolve: { alias }, test: { name: "api", include: ["tests/api/**/*.test.ts"], fileParallelism: false, testTimeout: 60000, hookTimeout: 60000 } },
    ],
  },
});
