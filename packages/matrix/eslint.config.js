import globals from "globals"
import { defineConfig, globalIgnores } from "eslint/config"
import { baseConfig, typeCheckedConfig } from "@workspace/eslint-config/base"

export default defineConfig([
  ...baseConfig,
  ...typeCheckedConfig(import.meta.dirname),
  // Generated from packages/cli; lint the source there.
  globalIgnores(["src/vendor", "src/generated"]),
  {
    files: ["**/*.{ts,mjs}"],
    languageOptions: { globals: globals.node },
  },
])
