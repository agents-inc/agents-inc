import { typeCheckedConfig } from "@workspace/eslint-config/base"
import { reactAppConfig } from "@workspace/eslint-config/react-app"
import { defineConfig } from "eslint/config"

/**
 * The source folder's name, banned outside specs. The boundaries keep
 * `agents-inc` (package, URLs, storage keys) out of the match.
 */
const SOURCE_FOLDER_NAME = "/(^|[^\\w.-])[.](agents-inc)([^\\w-]|$)/"

const SOURCE_FOLDER_MESSAGE =
  "The source folder's name is declared in @workspace/compile — import SOURCE_ROOT_DIR or sourceDirName rather than writing the name."

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
  ...reactAppConfig,
  ...typeCheckedConfig(import.meta.dirname),
  {
    files: ["**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...SOURCE_FOLDER_LITERALS] },
  },
  {
    // Tests mirror rendered strings as literals.
    files: ["**/*.test.ts", "**/*.test.tsx", "e2e/**/*.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // A Playwright fixture's `use()` is not React's hook.
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-refresh/only-export-components": "off",
    },
  },
])
