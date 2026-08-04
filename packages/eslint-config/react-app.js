import reactRefresh from "eslint-plugin-react-refresh"
import { defineConfig } from "eslint/config"

import { reactLibraryConfig } from "./react-library.js"

/** React library rules plus fast-refresh checks, which only mean something in a Vite app. */
export const reactAppConfig = defineConfig([
  ...reactLibraryConfig,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [reactRefresh.configs.vite],
  },
])
