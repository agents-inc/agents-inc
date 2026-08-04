import os from "node:os";
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
    //
    // The cap alone only guards the top end. A CI runner has four cores, so a
    // flat 16 put four PTY-driven workers on every core — the exact contention
    // the cap exists to prevent, inverted. The first CI run to reach this suite
    // was still going after 20 minutes against 6 locally. Taking the lower of
    // the two handles both ends with no environment check: 16 on a 20-core
    // machine, 4 on a runner, right on anything.
    maxWorkers: Math.min(16, os.availableParallelism()),
    retry: 2,
  },
});
