import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import { defineConfig } from "eslint/config"

import { baseConfig } from "./base.js"

/**
 * For React code that ships as a library rather than as a Vite app.
 *
 * Note what is absent: `eslint-plugin-react-refresh`. Fast refresh is an app-dev concern, and its
 * `only-export-components` rule forbids exactly what shadcn components do — export a component
 * beside its cva variants (`button`/`buttonVariants`). Apps get it via ./react-app.js.
 */
export const reactLibraryConfig = defineConfig([
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
])
