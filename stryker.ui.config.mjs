import { firstPass } from "./stryker.workspace.mjs"

// Components only the Storybook browser project reaches are NoCoverage here.
export default firstPass({
  name: "ui",
  dir: "packages/ui",
  tsconfigFile: "packages/ui/tsconfig.json",
  mutate: [
    "packages/ui/src/**/*.{ts,tsx}",
    "!packages/ui/src/**/*.test.ts",
    "!packages/ui/src/**/*.stories.tsx",
  ],
})
