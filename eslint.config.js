import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const TYPESCRIPT_SOURCES = ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts", "scripts/**/*.ts"];

export default defineConfig(
  globalIgnores([
    "dist/**",
    "node_modules/**",
    "coverage/**",
    ".cache/**",
    ".claude_backup/**",
    // Gitignored working material that happens to contain .js template assets.
    "todo/**",
    // Emitted by `npm run generate:types` — fix the generator, not the output.
    "src/cli/types/generated/**",
  ]),

  {
    files: TYPESCRIPT_SOURCES,
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: {
          // scripts/ is covered by tsconfig.scripts.json, which the project
          // service never finds because it only discovers tsconfig.json.
          allowDefaultProject: ["scripts/*.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // clean-code-standards 9.6: a leading `_` marks an intentionally unused binding.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  {
    files: ["eslint.config.js"],
    extends: [js.configs.recommended],
  },

  // Must stay last: turns off every rule that would fight prettier.config.mjs.
  eslintConfigPrettier,
);
