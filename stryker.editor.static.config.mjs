import firstPass from "./stryker.editor.config.mjs"
import { staticPass } from "./stryker.workspace.mjs"

export default staticPass(firstPass, "editor")
