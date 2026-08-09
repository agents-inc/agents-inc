import { baseConfig, typeCheckedConfig } from "@workspace/eslint-config/base"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...baseConfig,
  ...typeCheckedConfig(import.meta.dirname),
])
