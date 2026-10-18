import { fileURLToPath } from "node:url"

import { configDefaults, defineConfig, mergeConfig } from "vitest/config"

import baseConfig from "./vitest.config.ts"

// In Stryker's copy this reads instrumented source rather than the source it checks.
const READS_SOURCE_TEXT = [
  "src/features/configure/components/output-preview-dialog.test.ts",
]

// Stryker runs from the repo root, so the root is set back to this app.
export default mergeConfig(
  baseConfig,
  defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    test: { exclude: [...configDefaults.exclude, ...READS_SOURCE_TEXT] },
  })
)
