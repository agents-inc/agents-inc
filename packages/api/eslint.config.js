import globals from "globals"
import { defineConfig } from "eslint/config"
import { baseConfig, typeCheckedConfig } from "@workspace/eslint-config/base"

export default defineConfig([
  ...baseConfig,
  ...typeCheckedConfig(import.meta.dirname),
  {
    files: ["**/*.{ts,mjs}"],
    languageOptions: { globals: globals.node },
  },
])
