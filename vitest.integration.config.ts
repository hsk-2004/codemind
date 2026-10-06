import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests need a real pgvector database (DATABASE_URL).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    env: { SKIP_ENV_VALIDATION: "1" },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
