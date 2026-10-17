import os from "os";
import type { Provider } from "../../consts";
import { sourceFolderInUse } from "../installation/install-layout";

export {
  generateBlankGlobalConfigSource,
  generateConfigSource,
  type ConfigSourceOptions,
} from "@workspace/compile/config-source";

/** The specifier a project config imports the global one by, for the project's provider. */
export function getGlobalConfigImportPath(provider: Provider): string {
  return sourceFolderInUse(os.homedir(), provider).dir;
}
