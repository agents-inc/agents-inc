import firstPass from "./stryker.api-mocks.config.mjs"
import { staticPass } from "./stryker.workspace.mjs"

export default staticPass(firstPass, "api-mocks")
