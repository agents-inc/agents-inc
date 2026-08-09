import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

/** Rules every workspace shares. Formatting is Prettier's job — eslintConfigPrettier last. */
export const baseConfig = defineConfig([
  globalIgnores(["dist", "node_modules"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      eslintConfigPrettier,
    ],
    rules: {
      // `const { [id]: _removed, ...rest } = obj` is the idiomatic way to drop a key.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
])

/**
 * The rules that need a TypeScript program: the `no-unsafe-*` family, `no-floating-promises`,
 * `no-misused-promises` and the rest of typescript-eslint's type-checked set.
 *
 * Separate from `baseConfig`, and a function, for one reason: `tsconfigRootDir` has to be the
 * *consuming* workspace's directory. Passing `import.meta.dirname` from here would point every
 * workspace at packages/eslint-config, which holds no tsconfig at all. Each call site passes its
 * own — matching what packages/cli already does inline.
 */
export const typeCheckedConfig = (tsconfigRootDir) =>
  defineConfig([
    {
      files: ["**/*.{ts,tsx}"],
      extends: [tseslint.configs.recommendedTypeChecked, eslintConfigPrettier],
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        // Beyond the recommended set, deliberately. `no-unnecessary-condition` is the rule that
        // catches a guard the types already rule out — the shape CLI-392 and CLI-395 left behind
        // once the sparse maps and the id unions became honest. `consistent-type-assertions` bans
        // the angle-bracket form outright and confines `as` on an object literal to `satisfies`,
        // which is what stops a literal being asserted into a shape it does not have.
        "@typescript-eslint/no-unnecessary-condition": "error",
        "@typescript-eslint/consistent-type-assertions": [
          "error",
          { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
        ],
      },
    },
  ])
