import { firstPass } from "./stryker.workspace.mjs"

export default firstPass({
  name: "server",
  dir: "apps/server",
  tsconfigFile: "apps/server/tsconfig.json",
  mutate: [
    "apps/server/src/**/*.ts",
    "!apps/server/src/**/*.test.ts",
    "!apps/server/src/**/*.d.ts",
    "!apps/server/src/db/seed-session.ts",
  ],
})
