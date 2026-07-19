import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.test.ts"],
    globalSetup: ["./e2e/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    // PTY-driven wizard tests are load-sensitive: at full parallelism (one
    // worker per core, 21+ on dev machines) dropped keystrokes and slow
    // installs produce flaky failures that never reproduce solo. Cap the
    // worker count to keep the suite deterministic.
    maxWorkers: 16,
    retry: 2,
  },
});
