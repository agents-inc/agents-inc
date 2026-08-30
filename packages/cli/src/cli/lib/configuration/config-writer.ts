import os from "os";
import path from "path";
import { CLAUDE_SRC_DIR } from "../../consts";

/**
 * The config-pair renderers live in `@workspace/compile` and are re-exported here, so the
 * config-gate and everything else that renders a pair reads them where it always did. What
 * stays in this module is the one thing the package cannot hold: a path derived from
 * `os.homedir()`.
 *
 * The package renders and writes nothing, and neither does this file. Putting either half of a
 * pair on disk is `config-gate/`'s exclusive privilege, because that write owes consequences no
 * caller can be relied on to remember.
 */
export {
  generateBlankGlobalConfigSource,
  generateConfigSource,
  type ConfigSourceOptions,
} from "@workspace/compile/config-source";

/**
 * Returns the absolute path to the global .claude-src directory.
 *
 * The import path for the config form that extends the global config by importing it rather
 * than inlining it — a form with no production caller: `writeProjectConfigPair` in
 * `config-gate/propagate.ts` is the only site passing `isProjectConfig`, and it always passes
 * `globalConfig` alongside, which routes to the inlining branch. It is a parameter of
 * `generateConfigSource` (`options.globalImportPath`) rather than a read inside it, because the
 * editor's output preview renders the same function in a browser.
 */
export function getGlobalConfigImportPath(): string {
  return path.join(os.homedir(), CLAUDE_SRC_DIR);
}
