import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // The real fixtures include a 25 MB model. Running test files serially keeps
    // peak memory predictable on modest CI runners.
    fileParallelism: false,
  },
});
