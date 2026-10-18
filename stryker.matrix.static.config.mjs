import firstPass from "./stryker.matrix.config.mjs"
import { staticPass } from "./stryker.workspace.mjs"

export default staticPass(firstPass, "matrix")
