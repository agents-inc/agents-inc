import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

import { noMatcherCast } from "./no-matcher-cast.js"
import { noTaskIdInTestText } from "./no-task-id-in-test-text.js"

const workspacePlugin = {
  rules: {
    "no-matcher-cast": noMatcherCast,
    "no-task-id-in-test-text": noTaskIdInTestText,
  },
}

/** Formatting is Prettier's job, so eslintConfigPrettier goes last. */
export const baseConfig = defineConfig([
  globalIgnores(["dist", "node_modules"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    plugins: { workspace: workspacePlugin },
    rules: {
      "workspace/no-matcher-cast": "error",
      "workspace/no-task-id-in-test-text": "error",

      // `const { [id]: _removed, ...rest } = obj` is the idiomatic way to drop a key.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // Catches conditions no input can falsify (`x === x`), which no-unnecessary-condition cannot:
      // the shape is syntactic, not a type question.
      "no-self-compare": "error",
    },
  },
])

/** A function because `tsconfigRootDir` must be the consuming workspace's directory. */
export const typeCheckedConfig = (tsconfigRootDir) =>
  defineConfig([
    {
      files: ["**/*.{ts,tsx}"],
      extends: [tseslint.configs.recommendedTypeChecked, eslintConfigPrettier],
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        // `objectLiteralTypeAssertions: "never"` stops asserting a literal into a shape it lacks.
        "@typescript-eslint/no-unnecessary-condition": "error",
        "@typescript-eslint/consistent-type-assertions": [
          "error",
          { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
        ],
      },
    },
  ])
