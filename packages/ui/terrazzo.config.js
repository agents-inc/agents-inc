import { defineConfig } from "@terrazzo/cli"
import css from "@terrazzo/plugin-css"

// Emits the core tier of tokens/tokens.json as `src/styles/tokens.css` (generated), so a token's
// light and dark values live in one place. The semantic tier stays in globals.css.
export default defineConfig({
  tokens: ["./tokens/tokens.json"],
  outDir: "./src/styles",
  plugins: [
    css({
      filename: "tokens.css",
      baseSelector: ":root",
      // A separate attribute selector so an explicit choice beats the OS both ways.
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
