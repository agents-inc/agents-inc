import globals from "globals"
import { defineConfig, globalIgnores } from "eslint/config"
import { baseConfig, typeCheckedConfig } from "@workspace/eslint-config/base"

export default defineConfig([
  ...baseConfig,
  ...typeCheckedConfig(import.meta.dirname),
  // Emitted by packages/cli's scripts/generate-compile-package.ts — lint the
  // source there, not the copy here.
  globalIgnores(["src/generated"]),
  {
    files: ["**/*.{ts,mjs}"],
    languageOptions: { globals: globals.node },
  },
])
