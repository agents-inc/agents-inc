import tailwindcss from "@tailwindcss/vite"
import type { StorybookConfig } from "@storybook/react-vite"

// Stories sit beside the components they document, so the glob follows the
// components rather than a parallel tree.
//
// Two addons, both of which run on every story without being asked: the vitest
// addon turns each story into a real test in a real browser, and the a11y addon
// runs axe on the result. Nothing else — a story here is a component in
// isolation, and the design ships no toolbar states to switch between.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-vitest", "@storybook/addon-a11y"],
  framework: "@storybook/react-vite",

  // `vitest run` is a gate, and a gate should not phone home. Off here rather
  // than by environment variable so it is off for everyone, CI included.
  core: { disableTelemetry: true },

  // `styles/globals.css` opens with `@import "tailwindcss"`, so without this
  // plugin every story renders unstyled and the a11y addon's contrast checks
  // would be measuring nothing.
  //
  // It goes here rather than in `vitest.config.ts` because the vitest addon
  // replays `viteFinal` when it builds the test run — one declaration covers
  // both the dev server and `vitest run`.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), tailwindcss()],
  }),
}

export default config
