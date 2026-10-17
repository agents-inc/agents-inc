import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import { defineConfig } from "eslint/config"

import { baseConfig } from "./base.js"

/** No react-refresh: its `only-export-components` forbids a component beside its cva variants. */
export const reactLibraryConfig = defineConfig([
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
])
