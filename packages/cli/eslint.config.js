import js from "@eslint/js";
import { baseConfig, typeCheckedConfig } from "@workspace/eslint-config/base";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

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

  // A disable comment whose rule no longer fires is a claim about the code
  // that has stopped being true. Two of those went stale on 2026-07-30 and sat
  // unread; this would have caught both by itself (CLI-355).
  { linterOptions: { reportUnusedDisableDirectives: "error" } },

  {
    // The shared set, scoped to what this package actually compiles. `baseConfig` and
    // `typeCheckedConfig` both match `**/*.{ts,tsx}`; the `files` here narrows them to the
    // three source trees, which is what keeps tsup.config.ts, vitest.config.ts and
    // vitest.setup.ts — the root-level tool configs, in no tsconfig of this package — out of a
    // type-aware run they would fail to parse under.
    //
    // Extending rather than restating is the point of this block: composing
    // `recommendedTypeChecked` here by hand is what left `no-unnecessary-condition` — a shared
    // addition beyond the recommended set — unconfigured in this one package for its whole life
    // (CLI-427). Anything the shared base adds next arrives here on its own.
    // scripts/ is typed by tsconfig.scripts.json, which the project service can never
    // discover — it only looks for files named tsconfig.json. The `allowDefaultProject:
    // ["scripts/*.ts"]` carve-out that stood here proved runtime-dependent: the same
    // invocation matched under bun and failed under node, so turbo-driven lints stayed green
    // while lint-staged's node-spawned eslint failed every scripts/ file with a parsing
    // error naming no rule. scripts/tsconfig.json (a two-line extends of
    // tsconfig.scripts.json) makes the directory a discovered project instead, which also
    // retires the default-project file cap the carve-out needed — the fuse that turned
    // `turbo lint` red on the ninth script with a message naming no rule.
    files: TYPESCRIPT_SOURCES,
    extends: [baseConfig, typeCheckedConfig(import.meta.dirname)],
    rules: {
      // The one option the shared base does not carry: clean-code-standards 9.6 reads a leading
      // `_` as an intentionally unused binding, and a caught error is a binding. The other three
      // options restate the shared ones rather than replacing them — `no-restricted-imports`
      // aside, a rule's options are not merged across config blocks, so the last block to name a
      // rule owns all of them, and dropping `ignoreRestSiblings` here would outlaw the
      // `const { [id]: _removed, ...rest }` idiom the shared base exists to allow.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // `consistent-type-assertions` and `no-unnecessary-condition` used to be stated here. They
      // are the shared base's two additions beyond the recommended set and now arrive with it —
      // which is what CLI-427 was for. Both were turned off in this package by CLI-393 and paid
      // back by CLI-422; `no-unnecessary-type-assertion`, the other half of that pair, is in the
      // recommended set itself. All three read this package's type graph, and it was honest about
      // `noUncheckedIndexedAccess` only from CLI-422 onwards — before that `arr[i]` was `T`, so
      // every `if (arr[i])` read as always-truthy and acting on the verdict would have deleted
      // the guards the flag needs. Re-measured against the honest graph the fallout was 50
      // reports rather than the 252 the dishonest one showed.
    },
  },

  {
    // DEBT, CLI-393. The unsafe-* family and `require-await`, off in specs only.
    // This is the volume half: 147 unsafe-* reports and 31 `require-await`
    // across 40-odd files, against 44 and 2 in production — the shape is a test
    // reading back a config or a manifest it just wrote, so `JSON.parse` hands
    // it `any` and every field read off it is another report. Each one wants a
    // typed read rather than a suppression, which is a task, not a footnote to
    // this one. Production carries the family in full, and so does every other
    // workspace in the repository.
    files: TEST_FILES,
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/require-await": "off",
    },
  },

  {
    // An Ink codebase is a React codebase, so the two hooks rules apply in
    // full: conditional hooks crash a wizard render exactly as they crash a
    // browser one, and a wrong dependency array is a stale screen. Scoped to
    // where React actually runs — components (including their hooks directory)
    // and the commands/stores that render or drive them (CLI-356).
    //
    // Deliberately these two rules and not the plugin's full v7 recommended
    // set: the additions beyond them exist for the React Compiler, and they
    // outlaw reading a ref during render — which is precisely how an Ink app
    // measures its own layout (measureElement on a Box ref, re-measured every
    // render, converging through a conditional setState). Adopting them would
    // mean rewriting the measurement hooks to satisfy a compiler this code
    // will never run under.
    files: ["src/cli/**/*.tsx", "src/cli/components/**/*.ts", "src/cli/stores/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  {
    // Task IDs rot: a name like "D-167 keeps X" reads as authoritative long
    // after D-167 is closed and its tracker row deleted. Names describe
    // behaviour; assertion messages state the invariant. File-level JSDoc is
    // the one sanctioned home for an ID, and comments are out of a linter's
    // reach — this guards the two surfaces it can see (CLI-357).
    files: TEST_FILES,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name=/^(describe|it|test)$/] > Literal[value=/\\b(D|R|P\\d*|CLI|REPO|WWW|ED|SRV)-\\d+\\b/]",
          message:
            "Task IDs do not belong in test names — describe the behaviour instead. IDs go in file-level JSDoc only.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(describe|it|test)$/] > TemplateLiteral TemplateElement[value.raw=/\\b(D|R|P\\d*|CLI|REPO|WWW|ED|SRV)-\\d+\\b/]",
          message:
            "Task IDs do not belong in test names — describe the behaviour instead. IDs go in file-level JSDoc only.",
        },
        {
          selector:
            "CallExpression[callee.name='expect'] > Literal[value=/\\b(D|R|P\\d*|CLI|REPO|WWW|ED|SRV)-\\d+\\b/]",
          message: "Task IDs do not belong in assertion messages — state the invariant instead.",
        },
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
