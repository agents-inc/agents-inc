import os from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./e2e/global-setup.ts"],
    setupFiles: ["./e2e/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    // PTY-driven specs drop keystrokes under heavy parallelism; never more than one worker per core.
    maxWorkers: Math.min(16, os.availableParallelism()),
    retry: 1,
    // Smoke specs probe the real `claude` binary, so they are a separate project (`test:smoke`).
    projects: [
      {
        extends: true,
        test: { name: "e2e", include: ["e2e/**/*.e2e.test.ts"] },
      },
      {
        extends: true,
        test: { name: "smoke", include: ["e2e/**/*.smoke.test.ts"] },
      },
    ],
  },
});
