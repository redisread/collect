import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "miniflare",
    environmentOptions: {
      bindings: {
        DB: {},
        COLLECT_KV: {},
        COLLECT_R2: {},
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "drizzle/",
        "**/*.d.ts",
        "**/*.config.*",
      ],
    },
  },
});
