// packages/cli's first pass narrowed to its commands: commands, hooks and the entry modules beside them.
import { readFileSync } from "node:fs"

const cliFirstPass = JSON.parse(
  readFileSync(new URL("./stryker.config.json", import.meta.url), "utf8")
)

export default {
  ...cliFirstPass,
  mutate: [
    "packages/cli/src/cli/{commands,hooks}/**/*.{ts,tsx}",
    "packages/cli/src/cli/*.{ts,tsx}",
    ...cliFirstPass.mutate.filter((pattern) => pattern.startsWith("!")),
  ],
  incrementalFile: "reports/stryker-incremental.cli-commands.json",
}
