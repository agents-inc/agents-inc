import globals from "globals"
import { defineConfig, globalIgnores } from "eslint/config"
import { baseConfig, typeCheckedConfig } from "@workspace/eslint-config/base"

/**
 * The source folder's name, written anywhere but the two modules that declare it.
 *
 * The same ban `packages/cli/eslint.config.js` carries, for the same reason and with the same
 * regex: the source folder is `.agents-inc/<provider>/`, and every path under it is resolved by
 * one funnel. This package holds only the NAMES — `paths.ts`
 * declares them and `source-layout.ts` composes them — so those two are the exemption and
 * everything else reaches for them by symbol.
 *
 * The boundary on either side is what keeps `github:agents-inc/skills`, `agents-inc` and
 * `.claude-plugin/plugin.json` out of it. A spec may still write the names: they are text on
 * people's disks, so an assertion importing the constant the product writes would move with it and
 * could never fail.
 */
const SOURCE_FOLDER_NAME = "/(^|[^\\w.-])[.](agents-inc)([^\\w-]|$)/"

const SOURCE_FOLDER_MESSAGE =
  "The source folder's name is declared in src/paths.ts and composed in src/source-layout.ts — import SOURCE_ROOT_DIR or sourceDirName rather than writing the name."

const SOURCE_FOLDER_LITERALS = [
  {
    selector: `Literal[value=${SOURCE_FOLDER_NAME}]`,
    message: SOURCE_FOLDER_MESSAGE,
  },
  {
    selector: `TemplateElement[value.raw=${SOURCE_FOLDER_NAME}]`,
    message: SOURCE_FOLDER_MESSAGE,
  },
]

export default defineConfig([
  ...baseConfig,
  ...typeCheckedConfig(import.meta.dirname),
  // Emitted by packages/cli's scripts/generate-compile-package.ts — lint the
  // source there, not the copy here.
  globalIgnores(["src/generated"]),
  {
    files: ["**/*.{ts,mjs}"],
    languageOptions: { globals: globals.node },
    rules: { "no-restricted-syntax": ["error", ...SOURCE_FOLDER_LITERALS] },
  },
  {
    // The two modules that declare the names, and the specs that pin them as the text they are.
    files: ["src/paths.ts", "src/source-layout.ts", "**/*.test.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
])
