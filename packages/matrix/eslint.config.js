import globals from "globals"
import { defineConfig, globalIgnores } from "eslint/config"
import { baseConfig, typeCheckedConfig } from "@workspace/eslint-config/base"

export default defineConfig([
  ...baseConfig,
  ...typeCheckedConfig(import.meta.dirname),
  // Copied verbatim from packages/cli in this repo — lint the source there, not the copy here.
  globalIgnores(["src/vendor", "src/generated"]),
  {
    files: ["**/*.{ts,mjs}"],
    languageOptions: { globals: globals.node },
  },
])
