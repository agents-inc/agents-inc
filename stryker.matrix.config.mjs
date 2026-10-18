import { firstPass } from "./stryker.workspace.mjs"

// vendor/ is generated from packages/cli by its generate-matrix-package script.
export default firstPass({
  name: "matrix",
  dir: "packages/matrix",
  tsconfigFile: "packages/matrix/tsconfig.json",
  mutate: [
    "packages/matrix/src/**/*.ts",
    "!packages/matrix/src/**/*.test.ts",
    "!packages/matrix/src/contract/*-scenarios.ts",
    "!packages/matrix/src/generated/**",
    "!packages/matrix/src/vendor/**",
  ],
})
