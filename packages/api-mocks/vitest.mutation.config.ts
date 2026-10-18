import { fileURLToPath } from "node:url"

import { defineConfig, mergeConfig } from "vitest/config"

import baseConfig from "./vitest.config"

// Stryker runs from the repo root, so the root is set back to this package.
export default mergeConfig(
  baseConfig,
  defineConfig({ root: fileURLToPath(new URL(".", import.meta.url)) })
)
