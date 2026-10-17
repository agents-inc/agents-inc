import { typeCheckedConfig } from "@workspace/eslint-config/base"
import { reactLibraryConfig } from "@workspace/eslint-config/react-library"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  // `storybook build` output: gitignored but present after a Chromatic publish.
  globalIgnores(["storybook-static/**"]),
  ...reactLibraryConfig,
  ...typeCheckedConfig(import.meta.dirname),
])
