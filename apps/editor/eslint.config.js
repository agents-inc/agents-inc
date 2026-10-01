import { typeCheckedConfig } from "@workspace/eslint-config/base"
import { reactAppConfig } from "@workspace/eslint-config/react-app"
import { defineConfig } from "eslint/config"

/**
 * The source folder's name, written anywhere but a spec.
 *
 * The third copy of the ban `packages/cli/eslint.config.js` and `packages/compile/eslint.config.js`
 * carry, with the same regex, for the same reason: `.claude-src/` is becoming
 * `.agents-inc/<provider>/`, both names are live at once, and the editor renders paths under one of
 * them. It DECLARES neither — `output-preview.ts` imports the names from `@workspace/compile`,
 * which is where that package's own ban points — so there is no funnel to exempt here, only specs.
 *
 * ONE PRODUCT FILE CANNOT IMPORT THEM, and carries a `no-restricted-syntax` disable with the
 * measurement instead: `install-dialog.tsx` is on the static graph, where a single import of
 * `@workspace/compile` puts its 124.7 KB chunk on the first-paint path and
 * `scripts/first-paint-budget.ts` fails the build at 490.0 KB against a 344.0 KB budget
 * (measured 2026-09-20). `output-preview.ts` imports freely because it is reached only through
 * `import()`. Before writing a fourth zone here, check which graph the file is on.
 *
 * The boundary on either side is what keeps `agents-inc` the package, `npx agents-inc init`,
 * `github.com/agents-inc`, `agents-inc:config:v1` and `.claude-plugin/plugin.json` out of it: the
 * regex demands a `.` immediately before the name and a non-word, non-hyphen character after it.
 *
 * A spec may still write the names. They are text the preview renders and text on people's disks,
 * so an assertion that imported the constant the product writes would move with it and could never
 * fail — `e2e/specs/output-preview.spec.ts` pins the folder as a literal for exactly that reason
 * (`.agents-inc/claude/` since R2 flipped the preview onto it), and `packages/cli`'s
 * `e2e/pages/constants.ts` exemption is the same ruling.
 */
const SOURCE_FOLDER_NAME = "/(^|[^\\w.-])[.](claude-src|agents-inc)([^\\w-]|$)/"

const SOURCE_FOLDER_MESSAGE =
  "The source folder's name is declared in @workspace/compile — import SOURCE_ROOT_DIR, LEGACY_SOURCE_DIR or sourceDirName rather than writing either name. Both are live and only that package knows which one a scope is on."

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
    // Specs, and the Playwright tree whole — its page objects and fixtures mirror the product's
    // rendered strings the same way its specs do.
    files: ["**/*.test.ts", "**/*.test.tsx", "e2e/**/*.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Playwright specs are not React. A fixture's `use()` is the fixture
    // callback rather than React's `use` hook, and there is nothing here for
    // fast refresh to reason about.
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-refresh/only-export-components": "off",
    },
  },
])
