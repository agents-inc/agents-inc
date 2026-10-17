// For the `*.css` import; setting tsconfig `types` would drop automatic @types.
/// <reference types="vite/client" />

import type { Preview } from "@storybook/react-vite"

import "../src/styles/globals.css"

// Light by default (headless `vitest run` included); `chromatic.modes` asks for dark.
type Theme = "light" | "dark"

const DEFAULT_THEME: Theme = "light"

// The attribute beats `prefers-color-scheme` both ways (guard added by scripts/hexify-tokens.ts).
const stampTheme = (theme: Theme) => {
  document.documentElement.dataset["theme"] = theme
}

// Globals arrive as untyped URL strings.
const themeFrom = (globals: Record<string, unknown>): Theme =>
  globals["theme"] === "dark" ? "dark" : DEFAULT_THEME

const preview: Preview = {
  initialGlobals: { theme: DEFAULT_THEME },

  globalTypes: {
    theme: {
      description: "The palette the story is drawn with",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },

  // A decorator: it must run for headless stories and re-run when the global changes.
  decorators: [
    (Story, { globals }) => {
      stampTheme(themeFrom(globals))
      return Story()
    },
  ],

  parameters: {
    layout: "centered",

    // Chromatic captures every story once per mode, each with its own baseline. Opt out per story
    // with `modes: { dark: { disable: true } }`.
    chromatic: {
      modes: {
        light: { theme: "light" },
        dark: { theme: "dark" },
      },
    },

    // `error` makes axe a gate (the addon's default fails nothing). `color-contrast` is held out by
    // owner ruling, measured on the light palette only.
    a11y: {
      test: "error",
      config: { rules: [{ id: "color-contrast", enabled: false }] },
    },
  },
}

export default preview
