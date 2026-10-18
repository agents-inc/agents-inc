import { firstPass } from "./stryker.workspace.mjs"

export default firstPass({
  name: "api-mocks",
  dir: "packages/api-mocks",
  tsconfigFile: "packages/api-mocks/tsconfig.json",
  mutate: [
    "packages/api-mocks/src/**/*.ts",
    "!packages/api-mocks/src/**/*.test.ts",
  ],
})
