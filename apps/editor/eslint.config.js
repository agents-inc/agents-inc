import { reactAppConfig } from "@workspace/eslint-config/react-app"
import { defineConfig } from "eslint/config"

export default defineConfig([
  ...reactAppConfig,
  {
    // Playwright specs are not React. A fixture's `use()` is the fixture
    // callback rather than React's `use` hook, and there is nothing here for
    // fast refresh to reason about.
    files: ["e2e/**/*.ts", "playwright.config.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-refresh/only-export-components": "off",
    },
  },
])
