import { firstPass } from "./stryker.workspace.mjs"

// Most components only the Playwright suite reaches; their mutants are NoCoverage here.
export default firstPass({
  name: "editor",
  dir: "apps/editor",
  tsconfigFile: "apps/editor/tsconfig.app.json",
  mutate: [
    "apps/editor/src/**/*.{ts,tsx}",
    "!apps/editor/src/**/*.test.{ts,tsx}",
    "!apps/editor/src/__tests__/**",
    "!apps/editor/src/lib/skill-icons.ts",
  ],
})
