import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Required for @oclif/test and ink-testing-library
    disableConsoleIntercept: true,
    clearMocks: true,
    setupFiles: ["./vitest.setup.ts"],
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
