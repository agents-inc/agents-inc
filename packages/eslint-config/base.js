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

      // A condition nothing it measures can falsify — a check in the shape of a check. `x === x`
      // holds for every input, so the code under it is never being asked anything.
      //
      // Here rather than in one workspace because it is core ESLint, sits outside
      // `js.configs.recommended`, and is not a mistake any package has a special claim on. It lived
      // in `packages/cli` alone from the day a hand-run verdict was caught reading
      // `after.length >= 0 && before.length >= 0`, which left every other workspace accepting the
      // same class. `@typescript-eslint/no-unnecessary-condition` cannot stand in for it: that rule
      // asks whether a value's TYPE settles a condition, and `x === x` is a `boolean` the type of
      // `x` leaves open. The shape is syntactic, so the rule that closes it is too.
      //
      // The related shape — a count compared against zero in the direction that always holds — is
      // `no-restricted-syntax` selectors, which take options and so cannot merge across config
      // blocks. Those stay in `packages/cli/eslint.config.js`, restated per zone, and
      // `spec-gates.test.ts` is the mutation proof for both halves.
      "no-self-compare": "error",
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
