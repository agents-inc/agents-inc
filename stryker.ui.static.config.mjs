import firstPass from "./stryker.ui.config.mjs"
import { staticPass } from "./stryker.workspace.mjs"

export default staticPass(firstPass, "ui")
