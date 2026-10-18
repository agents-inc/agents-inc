import firstPass from "./stryker.compile.config.mjs"
import { staticPass } from "./stryker.workspace.mjs"

export default staticPass(firstPass, "compile")
