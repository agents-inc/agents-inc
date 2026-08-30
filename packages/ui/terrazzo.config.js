import { defineConfig } from "@terrazzo/cli"
import css from "@terrazzo/plugin-css"

// The core palette's single source of truth is tokens/tokens.json; this emits
// it as CSS. `src/styles/tokens.css` is GENERATED — edit the JSON.
//
// Why a build step for CSS we could type: a token declares its light and dark
// value in one place, so the two cannot drift. That is the whole reason this
// exists, and it is what makes "every token needs a dark complement" a property
// of the file rather than a rule somebody has to remember.
//
// Only the CORE tier is generated. The semantic tier stays hand-written in
// globals.css, because its names carry the design's reasoning in prose and a
// `$description` in JSON is a worse home for it.
export default defineConfig({
  tokens: ["./tokens/tokens.json"],
  outDir: "./src/styles",
  plugins: [
    css({
      filename: "tokens.css",
      baseSelector: ":root",
      // Three states, not two. The media query serves the reader who has
      // expressed no preference, and the attribute serves an explicit choice —
      // which has to win over the OS in both directions, so it is a separate
      // selector rather than a wrapper.
      modeSelectors: [
        {
          mode: "dark",
          selectors: [
            "@media (prefers-color-scheme: dark)",
            '[data-theme="dark"]',
          ],
          scheme: "dark",
        },
      ],
    }),
  ],
})
