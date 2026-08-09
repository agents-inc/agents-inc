import { typeCheckedConfig } from "@workspace/eslint-config/base"
import { reactLibraryConfig } from "@workspace/eslint-config/react-library"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...reactLibraryConfig,
  ...typeCheckedConfig(import.meta.dirname),
])
