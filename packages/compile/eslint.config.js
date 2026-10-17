import globals from "globals"
import { defineConfig, globalIgnores } from "eslint/config"
import { baseConfig, typeCheckedConfig } from "@workspace/eslint-config/base"

/**
 * Bans source-folder names outside `paths.ts` and `source-layout.ts`, as packages/cli does. Specs
 * may write them: they pin the text on users' disks.
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
  // Emitted by packages/cli's generate-compile-package.ts; lint the source there.
  globalIgnores(["src/generated"]),
  {
    files: ["**/*.{ts,mjs}"],
    languageOptions: { globals: globals.node },
    rules: { "no-restricted-syntax": ["error", ...SOURCE_FOLDER_LITERALS] },
  },
  {
    files: ["src/paths.ts", "src/source-layout.ts", "**/*.test.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
])
