import { readFileSync } from "node:fs"

import { staticPass } from "./stryker.workspace.mjs"

const cliFirstPass = JSON.parse(
  readFileSync(new URL("./stryker.config.json", import.meta.url), "utf8")
)

export default staticPass(cliFirstPass, "cli")
