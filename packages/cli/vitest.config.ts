import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Required for @oclif/test and ink-testing-library
    disableConsoleIntercept: true,
    clearMocks: true,
    setupFiles: ["./vitest.setup.ts"],
    // Refuses the run when dist/ predates a tree compiled into it — src/ and
    // packages/matrix/src, which tsup inlines. `pretest` covers `bun run test`
    // and `npm test`, but a script hook cannot see `npx vitest run <file>` —
    // which is how most scoped runs in this repository are actually made, and
    // the `commands` specs execute dist/ rather than src/ whichever way they
    // were started. This is the half that cannot be bypassed.
    globalSetup: ["./vitest.global-setup.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/cli/**/*.ts", "src/cli/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/cli/index.ts"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
          exclude: [
            "src/cli/lib/__tests__/integration/**",
            "src/cli/lib/__tests__/user-journeys/**",
            "src/cli/lib/__tests__/commands/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: [
            "src/cli/lib/__tests__/integration/**/*.test.{ts,tsx}",
            "src/cli/lib/__tests__/user-journeys/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "commands",
          include: ["src/cli/lib/__tests__/commands/**/*.test.ts"],
          retry: 1,
        },
      },
    ],
  },
});
