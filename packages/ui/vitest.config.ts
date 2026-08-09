import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

// Standalone rather than `mergeConfig(nodeConfig, …)`. `@workspace/vitest-config`
// exists for pure logic and says so: environment "node", include
// `src/**/*.test.ts`, no DOM — on the stated grounds that anything which renders
// is covered in a real browser instead. This suite *is* that browser, so all
// three of those options are the opposite of what it needs, and merging them in
// would leave three dead settings sitting on a config that ignores them.
//
// There are no story files to include here: the plugin derives the test list
// from `stories` in `.storybook/main.ts`, so the glob is stated once.
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [await storybookTest({ configDir: ".storybook" })],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
})
