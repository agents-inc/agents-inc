// packages/cli's first pass narrowed to its library code: lib, utils and components.
import { readFileSync } from "node:fs"

const cliFirstPass = JSON.parse(
  readFileSync(new URL("./stryker.config.json", import.meta.url), "utf8")
)

export default {
  ...cliFirstPass,
  mutate: [
    "packages/cli/src/cli/{lib,utils,components}/**/*.{ts,tsx}",
    ...cliFirstPass.mutate.filter((pattern) => pattern.startsWith("!")),
  ],
  incrementalFile: "reports/stryker-incremental.cli-lib.json",
}
