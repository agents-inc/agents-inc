import firstPass from "./stryker.api.config.mjs"
import { staticPass } from "./stryker.workspace.mjs"

export default staticPass(firstPass, "api")
