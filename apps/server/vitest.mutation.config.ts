import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig, mergeConfig } from "vitest/config"

import baseConfig from "./vitest.config"

// Stryker runs from the repo root, so the root is set back to this app.
export default mergeConfig(
  baseConfig,
  defineConfig({ root: dirname(fileURLToPath(import.meta.url)) })
)
