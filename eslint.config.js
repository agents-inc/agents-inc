import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const TYPESCRIPT_SOURCES = ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts", "scripts/**/*.ts"];
const CLI_SOURCES = ["src/**/*.ts", "src/**/*.tsx"];

/**
 * Specs and their fixtures. Exempt from every config-gate restriction below: a
 * test asserting on a writer has to import it, and a test is not a bypass — it
 * writes into a temp dir and ships nothing. The guards that matter for tests are
 * the runtime tripwire (which they run against) and the source scanner in
 * `src/cli/lib/__tests__/config-gate-enforcement.test.ts`.
 */
const TEST_FILES = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/e2e/**",
];

/**
 * L2(a) — `config-gate/` is a directory-as-module: `index.ts` is its entire
 * public surface. Importing any other file in it reaches past the classification
 * and the write token that make the gate a gate.
 */
const CONFIG_GATE_PRIVATE_MESSAGE =
  "config-gate/ is private except for index.ts — import from '<...>/config-gate/index.js'. See src/cli/lib/config-gate/index.ts.";

const CONFIG_GATE_PRIVATE_IMPORTS = {
  group: ["**/config-gate/*", "!**/config-gate/index*"],
  message: CONFIG_GATE_PRIVATE_MESSAGE,
};

/**
 * The same ban for `await import("<...>/config-gate/pair-writer.js")`.
 * `no-restricted-imports` does not look at import expressions, and the dynamic
 * form is not hypothetical: the gate's pair writers open the write token
 * themselves, so reaching one of them by any route hands over the privilege.
 */
const CONFIG_GATE_PRIVATE_DYNAMIC_IMPORT = {
  selector: "ImportExpression > Literal[value=/config-gate\\u002F(?!index)/]",
  message: CONFIG_GATE_PRIVATE_MESSAGE,
};

/**
 * L2(b) — every write in the CLI must funnel through `src/cli/utils/fs.ts`,
 * where the runtime tripwire lives. A raw filesystem write skips it.
 */
const FS_WRITE_NAMES = ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "outputFile"];
const FS_WRITE_MESSAGE =
  "Write through writeFile() from src/cli/utils/fs.ts — it holds the runtime guard on ~/.claude-src/config.ts and config-types.ts.";
const FS_WRITE_PATHS = ["fs", "node:fs", "fs/promises", "node:fs/promises", "fs-extra"].map(
  (name) => ({ name, importNames: FS_WRITE_NAMES, message: FS_WRITE_MESSAGE }),
);

/**
 * L2(c) — the two halves' renderers, and the writer that renders AND writes the
 * types half. They stay importable from their own modules so the gate can drive
 * them; everywhere else they are a way to produce pair content outside it.
 */
const CONFIG_WRITER_MESSAGE =
  "Config pair sources are rendered and written by src/cli/lib/config-gate/ — call its entry points instead.";
const CONFIG_WRITER_IMPORTS = [
  {
    group: ["**/config-writer", "**/config-writer.js"],
    importNames: ["generateConfigSource"],
    message: CONFIG_WRITER_MESSAGE,
  },
  {
    group: ["**/config-types-writer", "**/config-types-writer.js"],
    importNames: [
      "generateConfigTypesSource",
      "assembleConfigTypesSource",
      "regenerateConfigTypes",
    ],
    message: CONFIG_WRITER_MESSAGE,
  },
];

/**
 * `no-restricted-imports` takes ONE options object per file and the last config
 * block wins, so a zone that relaxes one restriction must restate the others.
 */
function restrictedImports({ paths = [], patterns = [] }) {
  return { "no-restricted-imports": ["error", { paths, patterns }] };
}

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
    // A triple-slash reference is the correct idiom in an ambient declaration file,
    // and for some dependencies it is the ONLY one. `@lydell/node-pty` ships
    // `"exports": "./index.js"` with no `types` condition, so its declarations are
    // unreachable through module resolution; the reference in e2e/helpers/node-pty.d.ts
    // is what pulls them in. `import` is not an equivalent rewrite — it would turn the
    // file into a module and stop it contributing globals at all. The only
    // rule-satisfying alternative is hand-copying the vendor's declarations into the
    // repo, where they rot on the next dependency bump.
    files: ["**/*.d.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": "off" },
  },

  {
    files: ["eslint.config.js"],
    extends: [js.configs.recommended],
  },

  // ── config-gate enforcement (L2) ────────────────────────────────────────────
  // Writing ~/.claude-src/config.ts and its config-types.ts sibling is
  // src/cli/lib/config-gate/'s exclusive privilege, because that write owes
  // consequences (propagate to registered projects, recompile their agents) that
  // no caller can be relied on to remember. These blocks are the static layer of
  // that guarantee: module privacy (L1) removes the writers from the barrels,
  // these rules remove the ways around them, and a runtime tripwire in
  // src/cli/utils/fs.ts catches whatever a static check cannot see.
  //
  // Ordered outermost-first: each block below narrows the previous one for a
  // zone that legitimately needs more reach, and restates everything it still owes.

  {
    // Everything the repo compiles: only the gate's own files may reach past its
    // index, statically or dynamically. `no-restricted-syntax` is set once here
    // and inherited by every block below — none of them relax it.
    files: TYPESCRIPT_SOURCES,
    ignores: [...TEST_FILES, "src/cli/lib/config-gate/**"],
    rules: {
      ...restrictedImports({ patterns: [CONFIG_GATE_PRIVATE_IMPORTS] }),
      "no-restricted-syntax": ["error", CONFIG_GATE_PRIVATE_DYNAMIC_IMPORT],
    },
  },

  {
    // The CLI proper: also no raw filesystem writes and no pair-source renderers.
    files: CLI_SOURCES,
    ignores: [...TEST_FILES, "src/cli/lib/config-gate/**"],
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [CONFIG_GATE_PRIVATE_IMPORTS, ...CONFIG_WRITER_IMPORTS],
    }),
  },

  {
    // The renderers live here and this directory composes them; the gate deep-imports
    // them from it. Still no raw writes and no reaching into the gate's privates.
    files: ["src/cli/lib/configuration/**/*.ts"],
    ignores: TEST_FILES,
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [CONFIG_GATE_PRIVATE_IMPORTS],
    }),
  },

  {
    // Enforcement guard #1: refuses a home-directory types write by name, and needs
    // the gate's error class to do it. gate-token.ts is a dependency-free leaf, so
    // the import cannot cycle back through the gate.
    files: ["src/cli/lib/configuration/config-types-writer.ts"],
    rules: restrictedImports({ paths: FS_WRITE_PATHS }),
  },

  {
    // The gate itself: composes its own private files and the renderers. It writes
    // through utils/fs like everything else, so the raw-write ban still applies.
    files: ["src/cli/lib/config-gate/**/*.ts"],
    ignores: TEST_FILES,
    rules: restrictedImports({ paths: FS_WRITE_PATHS }),
  },

  {
    // Enforcement guard #2: the single write choke point. It IS the raw-write
    // wrapper, and it holds the runtime tripwire, which needs the gate's token.
    files: ["src/cli/utils/fs.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  // Must stay last: turns off every rule that would fight prettier.config.mjs.
  eslintConfigPrettier,
);
