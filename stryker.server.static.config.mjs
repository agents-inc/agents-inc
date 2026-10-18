import firstPass from "./stryker.server.config.mjs"
import { staticPass } from "./stryker.workspace.mjs"

export default staticPass(firstPass, "server")
