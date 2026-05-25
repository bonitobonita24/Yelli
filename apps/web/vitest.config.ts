import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globals: true,
    env: {
      SKIP_ENV_VALIDATION: "1",
      // Satisfies @yelli/jobs/connection.ts buildRedisUrl() guard at module
      // load time. ioredis lazy-connects on first command — no real Redis
      // round-trip happens during unit tests that don't enqueue jobs.
      REDIS_URL: "redis://localhost:6379",
    },
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/server/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      // Threshold gate — locks the safety net at current measured coverage so
      // accidental test skips or deletion regressions trigger CI failure.
      // Global floor: catches catastrophic regression (e.g. an entire suite
      // disabled via `.skip`). Raise as coverage grows.
      // Per-file gates: tight thresholds on fully-tested routers so partial
      // deletion of their test files surfaces immediately.
      thresholds: {
        statements: 12,
        branches: 6,
        functions: 12,
        lines: 12,
        "src/server/trpc/routers/auth.ts": {
          statements: 100,
          branches: 75,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
});
