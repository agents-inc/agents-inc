import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { nodeConfig } from "@workspace/vitest-config/node"
import { defineConfig, mergeConfig } from "vitest/config"

// `storybook` renders every story in Chromium, standalone because nodeConfig is DOM-free by design.
// `unit` collects the pure-logic `.test.ts` files.
export default defineConfig({
  test: {
    projects: [
      mergeConfig(nodeConfig, { test: { name: "unit" } }),
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
