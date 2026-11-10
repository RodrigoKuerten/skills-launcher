import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@skills-hub/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/**/tests/**/*.test.ts", "apps/**/tests/**/*.test.ts", "apps/web/lib/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
  },
});
