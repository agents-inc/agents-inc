import { firstPass } from "./stryker.workspace.mjs"

export default firstPass({
  name: "api",
  dir: "packages/api",
  tsconfigFile: "packages/api/tsconfig.json",
  mutate: ["packages/api/src/**/*.ts", "!packages/api/src/**/*.test.ts"],
})
