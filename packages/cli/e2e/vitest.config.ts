import os from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
    // the cap exists to prevent, inverted. Taking the lower of the two handles
    // both ends with no environment check. Measured 2026-08-05: 16 workers run
    // the suite in ~6m20s locally; 4 workers finish inside CI's 40-minute
    // bound on a runner (~19 minutes of a 25-minute job).
    maxWorkers: Math.min(16, os.availableParallelism()),
    // Was 2, tuned against flake that turned out to be Ink's CI detection
    // buffering every frame (fixed 2026-08-05 by the render wrapper trusting a
    // real terminal). Measured after the fix: the full suite passes at retry 0
    // — 647 tests, zero retries used. One retry stays because runner
    // contention is the one variable a local run cannot measure; it bounds a
    // genuine failure's cost at 2x instead of 3x, and a retry that fires shows
    // up in vitest's flaky report rather than passing silently.
    retry: 1,
    // Two gates over one tree, split by filename rather than by directory —
    // `smoke/pom-framework.e2e.test.ts` validates OUR page objects and belongs
    // in the suite that runs on every commit, while its neighbours probe the
    // real `claude` binary and are worth running only where that binary is.
    //
    // Named projects rather than a second config file: the include is the only
    // thing that differs, and every option above has to reach both. It is also
    // the shape vitest.config.ts at the package root already uses. Each gate
    // needs a script (`test:e2e`, `test:smoke`) — a project nothing selects
    // runs whenever the OTHER project is asked for by name and never
    // otherwise, which is how `e2e/smoke/*.smoke.test.ts` went unrun for
    // months. src/cli/lib/__tests__/spec-gates.test.ts is what now says so.
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
