import { firstPass } from "./stryker.workspace.mjs"

export default firstPass({
  name: "compile",
  dir: "packages/compile",
  tsconfigFile: "packages/compile/tsconfig.json",
  mutate: [
    "packages/compile/src/**/*.ts",
    "!packages/compile/src/**/*.test.ts",
    "!packages/compile/src/__tests__/**",
    "!packages/compile/src/contract/*-scenarios.ts",
    "!packages/compile/src/generated/**",
  ],
})
