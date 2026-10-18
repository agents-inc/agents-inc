import firstPass from "./stryker.cli-lib.config.mjs"
import { staticPass } from "./stryker.workspace.mjs"

export default staticPass(firstPass, "cli-lib")
