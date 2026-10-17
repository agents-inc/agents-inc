import reactRefresh from "eslint-plugin-react-refresh"
import { defineConfig } from "eslint/config"

import { reactLibraryConfig } from "./react-library.js"

export const reactAppConfig = defineConfig([
  ...reactLibraryConfig,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [reactRefresh.configs.vite],
  },
])
