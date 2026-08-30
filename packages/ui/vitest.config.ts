import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import { playwright } from "@vitest/browser-playwright"
import { nodeConfig } from "@workspace/vitest-config/node"
import { defineConfig, mergeConfig } from "vitest/config"

// TWO PROJECTS, and they answer different questions.
//
// `storybook` is the one this package was built around: the plugin derives its
// test list from `stories` in `.storybook/main.ts` and renders every story in a
// real Chromium, so a component with no story is a component with no coverage.
// It is standalone rather than `mergeConfig(nodeConfig, …)`, because
// `@workspace/vitest-config` exists for pure logic and says so — environment
// "node", include `src/**/*.test.ts`, no DOM, on the stated grounds that
// anything which renders is covered in a real browser instead. This suite IS
// that browser, so all three of those options are the opposite of what it
// needs and merging them in would leave three dead settings on a config that
// ignores them.
//
// `unit` exists because that reasoning covered the browser suite and nothing
// else. Not everything here renders: `src/lib/` holds pure data — the ink-ramp
// syntax theme is a plain object with no DOM anywhere near it — and a story is
// the wrong instrument for a value with no appearance. Until 2026-08-26 there
// was no project whose `include` matched a `.test.ts` at all, so such a file
// was silently never collected: `vitest run` reported 11 files and 63 tests,
// every one of them a story, and exited 0 with a 19-assertion unit test sitting
// on disk. `tsc` and `eslint` both read that file, which is exactly why nothing
// signalled it.
//
// There are no story files to include below: the plugin derives the test list
// from `.storybook/main.ts`, so the glob is stated once.
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
