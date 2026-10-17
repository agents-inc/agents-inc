import js from "@eslint/js";
import { baseConfig, typeCheckedConfig } from "@workspace/eslint-config/base";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

/** Named one by one so a stray harness at the package root is not linted. */
const ROOT_TOOL_CONFIGS = [
  "tsup.config.ts",
  "vitest.config.ts",
  "vitest.global-setup.ts",
  "vitest.setup.ts",
];

const TYPESCRIPT_SOURCES = [
  "src/**/*.ts",
  "src/**/*.tsx",
  "e2e/**/*.ts",
  "scripts/**/*.ts",
  ...ROOT_TOOL_CONFIGS,
];
const CLI_SOURCES = ["src/**/*.ts", "src/**/*.tsx"];

/** Specs and fixtures: exempt from the config-gate bans, since they write only to temp dirs. */
const TEST_FILES = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/__tests__/**",
  "**/__mocks__/**",
  "**/e2e/**",
];

/** config-gate/ is a directory-as-module: only index.ts is public. */
const CONFIG_GATE_PRIVATE_MESSAGE =
  "config-gate/ is private except for index.ts — import from '<...>/config-gate/index.js'. See src/cli/lib/config-gate/index.ts.";

const CONFIG_GATE_PRIVATE_IMPORTS = {
  group: ["**/config-gate/*", "!**/config-gate/index*"],
  message: CONFIG_GATE_PRIVATE_MESSAGE,
};

/** `no-restricted-imports` does not see import expressions. */
const CONFIG_GATE_PRIVATE_DYNAMIC_IMPORT = {
  selector: "ImportExpression > Literal[value=/config-gate\\u002F(?!index)/]",
  message: CONFIG_GATE_PRIVATE_MESSAGE,
};

/** Every CLI write goes through src/cli/utils/fs.ts, which holds the runtime tripwire. */
const FS_WRITE_NAMES = ["writeFile", "writeFileSync", "appendFile", "appendFileSync", "outputFile"];
const FS_WRITE_MESSAGE =
  "Write through writeFile() from src/cli/utils/fs.ts — it holds the runtime guard on the global config pair, config.ts and config-types.ts.";
const FS_WRITE_PATHS = ["fs", "node:fs", "fs/promises", "node:fs/promises", "fs-extra"].map(
  (name) => ({ name, importNames: FS_WRITE_NAMES, message: FS_WRITE_MESSAGE }),
);

/** The pair renderers and the types writer, importable only by the gate. */
const CONFIG_WRITER_MESSAGE =
  "Config pair sources are rendered and written by src/cli/lib/config-gate/ — call its entry points instead.";
// Both the package subpaths and the CLI re-exports, so a re-export is not a bypass.
const CONFIG_WRITER_IMPORTS = [
  {
    group: ["**/config-writer", "**/config-writer.js", "@workspace/compile/config-source"],
    importNames: ["generateConfigSource"],
    message: CONFIG_WRITER_MESSAGE,
  },
  {
    group: [
      "**/config-types-writer",
      "**/config-types-writer.js",
      "**/config-types-io",
      "**/config-types-io.js",
      "@workspace/compile/config-types-source",
    ],
    importNames: [
      "generateConfigTypesSource",
      "assembleConfigTypesSource",
      "regenerateConfigTypes",
    ],
    message: CONFIG_WRITER_MESSAGE,
  },
];

/**
 * A count is never negative, so `>= 0` or `< 0` against one holds for every input.
 * `no-unnecessary-condition` cannot see it: the type `number` leaves the comparison open.
 */
const NEVER_NEGATIVE_COUNT = "/^(length|size|byteLength)$/";

const VACUOUS_COUNT_MESSAGE =
  "A length, a size and a byteLength are never negative, so this comparison holds for every input. Assert the count the change should produce. See .ai-docs/standards/e2e/README.md.";

/** Task IDs in test names and assertion messages. */
const TASK_ID_SHAPES = [
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
];

/**
 * The source folder's name, written anywhere but install-layout.ts. Bounded on both sides so
 * near-misses like `agents-inc` and `.claude-plugin` stay legal.
 */
const SOURCE_FOLDER_NAME = "/(^|[^\\w.-])[.](agents-inc)([^\\w-]|$)/";

const SOURCE_FOLDER_MESSAGE =
  "The source folder's name is resolved, not written: call sourceFolderInUse/sourceDir from src/cli/lib/installation/install-layout.ts, or relativeConfigPath for a message. Only that module knows which folder a scope is on.";

const SOURCE_FOLDER_LITERALS = [
  {
    selector: `Literal[value=${SOURCE_FOLDER_NAME}]`,
    message: SOURCE_FOLDER_MESSAGE,
  },
  {
    selector: `TemplateElement[value.raw=${SOURCE_FOLDER_NAME}]`,
    message: SOURCE_FOLDER_MESSAGE,
  },
];

/**
 * The same ban reached by symbol, which writes no banned literal. `no-restricted-imports` rather
 * than a selector, since `no-restricted-syntax` options do not merge across blocks.
 */
const SOURCE_FOLDER_SYMBOLS = ["SOURCE_ROOT_DIR"];

const SOURCE_FOLDER_SYMBOL_MESSAGE =
  "The source folder's name is resolved, not composed: call sourceDir/sourceFolderInUse from src/cli/lib/installation/install-layout.ts, or relativeConfigPath for a message. Only that module knows which folder a scope is on.";

/** Barrel and package specifiers both, so a direct import is not a bypass. */
const SOURCE_FOLDER_SYMBOL_IMPORTS = {
  group: ["**/consts", "**/consts.js", "@workspace/compile", "@workspace/compile/paths"],
  importNames: SOURCE_FOLDER_SYMBOLS,
  message: SOURCE_FOLDER_SYMBOL_MESSAGE,
};

/** One host's plugin commands, reachable only through lib/hosts/. */
const CLAUDE_HOST_FUNCTIONS = [
  "claudePluginInstall",
  "claudePluginUninstall",
  "claudePluginUninstallBestEffort",
  "claudePluginMarketplaceAdd",
  "claudePluginMarketplaceExists",
  "claudePluginMarketplaceList",
  "claudePluginMarketplaceRemove",
  "claudePluginMarketplaceUpdate",
  "isClaudeCLIAvailable",
];

const CLAUDE_HOST_MESSAGE =
  "The host's plugin commands are reached through a host, not by name: call hostFor(provider) or hostAt(root) from src/cli/lib/hosts/host-for.js and use the PluginHost it answers. Claude and Codex spell every one of these verbs differently, so a call site naming one of them is a call site that works on one host only.";

const CLAUDE_HOST_IMPORTS = {
  group: ["**/utils/exec", "**/utils/exec.js", "**/hosts/claude-host", "**/hosts/claude-host.js"],
  importNames: CLAUDE_HOST_FUNCTIONS,
  message: CLAUDE_HOST_MESSAGE,
};

/**
 * A host directory literal, right on one host and wrong on the other; install-layout.ts resolves
 * them per provider. `\u002F` stands in for `/`, which would end the esquery regex.
 */
const HOST_DIRECTORY_NAME =
  "/(^|[^\\w.-])[.](claude|codex)([^\\w-]|$)|(^|[^\\w.-])[.]agents\\u002Fskills([^\\w-]|$)/";

const HOST_DIRECTORY_MESSAGE =
  "A host path is resolved, not written: call userConfigRoot/agentsDir/skillsDir/pluginsDir/permissionFiles/ownedRoots from src/cli/lib/installation/install-layout.ts. Claude and Codex keep these in different places, and only that module knows which host a scope is on. Where no role above answers the path you need, add the role there rather than composing it here.";

/**
 * A literal agent extension; `agentCodec(provider)` answers it. Anchored to the whole literal so
 * `config.toml` stays legal. `.md` is not banned while product modules still spell it.
 */
const HOST_AGENT_EXTENSION = "/^[*]?[.]toml$/";

const HOST_AGENT_EXTENSION_MESSAGE =
  "A compiled agent's extension is the host's, not a constant: call agentCodec(provider) from src/cli/lib/installation/install-layout.ts for the extension and the glob that lists them. Claude compiles to .md and Codex to .toml.";

const HOST_PATH_LITERALS = [
  {
    selector: `Literal[value=${HOST_DIRECTORY_NAME}]`,
    message: HOST_DIRECTORY_MESSAGE,
  },
  {
    selector: `TemplateElement[value.raw=${HOST_DIRECTORY_NAME}]`,
    message: HOST_DIRECTORY_MESSAGE,
  },
  {
    selector: `Literal[value=${HOST_AGENT_EXTENSION}]`,
    message: HOST_AGENT_EXTENSION_MESSAGE,
  },
];

/** Host directory constants compose paths that no literal ban can see. */
const HOST_PATH_SYMBOLS = ["CLAUDE_DIR", "LOCAL_SKILLS_PATH"];

const HOST_PATH_SYMBOL_MESSAGE =
  "A host path is resolved, not composed: call userConfigRoot/agentsDir/skillsDir/pluginsDir/pluginRegistry/permissionFiles/skillsPathPrefix/ownedRoots from src/cli/lib/installation/install-layout.ts. These constants spell ONE host's directories, so a path joined out of them is right on Claude and silently wrong on Codex -- which no literal ban can see, because the composition writes no banned spelling at all. Where no role above answers the path you need, add the role there rather than composing it here.";

const HOST_PATH_SYMBOL_IMPORTS = {
  group: ["**/consts", "**/consts.js", "@workspace/compile", "@workspace/compile/paths"],
  importNames: HOST_PATH_SYMBOLS,
  message: HOST_PATH_SYMBOL_MESSAGE,
};

const VACUOUS_COMPARISONS = [
  {
    selector: `BinaryExpression[operator=/^(>=|<)$/][left.property.name=${NEVER_NEGATIVE_COUNT}][right.value=0]`,
    message: VACUOUS_COUNT_MESSAGE,
  },
  {
    selector: `BinaryExpression[operator=/^(<=|>)$/][left.value=0][right.property.name=${NEVER_NEGATIVE_COUNT}]`,
    message: VACUOUS_COUNT_MESSAGE,
  },
];

/**
 * `no-restricted-imports` and `no-restricted-syntax` take one options object per file and the last
 * block wins, so a zone relaxing one restriction restates the rest.
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
    // Gitignored working material with .js assets.
    "todo/**",
    // Scratch material; see the `files` note below.
    ".scratch*",
    ".scratch*/**",
    // Generated by `npm run generate:types`.
    "src/cli/types/generated/**",
    // Bundled vendored source from scripts/handrun.mjs.
    "e2e/helpers/*.gen.mjs",
  ]),

  { linterOptions: { reportUnusedDisableDirectives: "error" } },

  {
    // TEST_FILES' extension patterns reach any depth but set no parser, so a test-named file
    // outside these trees is parsed as JavaScript; `.scratch*` keeps harnesses out.
    files: TYPESCRIPT_SOURCES,
    extends: [baseConfig, typeCheckedConfig(import.meta.dirname)],
    rules: {
      // Adds `caughtErrorsIgnorePattern`; the rest restate the shared options, which do not merge.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  {
    // Debt: the unsafe-* family and require-await are off in specs only.
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
    // Only these two: the React Compiler additions outlaw reading a ref during render, which is how
    // Ink measures layout.
    files: ["src/cli/**/*.tsx", "src/cli/components/**/*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },

  {
    // `HOST_PATH_LITERALS` is not applied: fixtures record the hosts' fixed directory names.
    files: TEST_FILES,
    rules: {
      "no-restricted-syntax": [
        "error",
        ...TASK_ID_SHAPES,
        ...VACUOUS_COMPARISONS,
        ...SOURCE_FOLDER_LITERALS,
      ],
    },
  },

  {
    // Ambient declarations need triple-slash refs; @lydell/node-pty has no `types` condition.
    files: ["**/*.d.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": "off" },
  },

  {
    files: ["eslint.config.js"],
    extends: [js.configs.recommended],
  },

  // Config-gate enforcement: only src/cli/lib/config-gate/ writes the global config pair.
  // Blocks run outermost-first; each narrower zone restates what it still owes.

  {
    files: TYPESCRIPT_SOURCES,
    ignores: [...TEST_FILES, "src/cli/lib/config-gate/**"],
    rules: {
      ...restrictedImports({
        patterns: [
          CONFIG_GATE_PRIVATE_IMPORTS,
          SOURCE_FOLDER_SYMBOL_IMPORTS,
          HOST_PATH_SYMBOL_IMPORTS,
          CLAUDE_HOST_IMPORTS,
        ],
      }),
      "no-restricted-syntax": [
        "error",
        CONFIG_GATE_PRIVATE_DYNAMIC_IMPORT,
        ...VACUOUS_COMPARISONS,
        ...SOURCE_FOLDER_LITERALS,
        ...HOST_PATH_LITERALS,
      ],
    },
  },

  {
    // Roster that may only shrink: init.tsx's description is read at module load, with no scope to
    // resolve a host path against. Re-derive with this block removed:
    //     npx eslint src --ext .ts,.tsx | grep 'A host path is resolved, not written'
    files: ["src/cli/commands/init.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        CONFIG_GATE_PRIVATE_DYNAMIC_IMPORT,
        ...VACUOUS_COMPARISONS,
        ...SOURCE_FOLDER_LITERALS,
      ],
    },
  },

  {
    // The CLI proper: also no raw filesystem writes and no pair-source renderers.
    files: CLI_SOURCES,
    ignores: [...TEST_FILES, "src/cli/lib/config-gate/**"],
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [
        CONFIG_GATE_PRIVATE_IMPORTS,
        ...CONFIG_WRITER_IMPORTS,
        SOURCE_FOLDER_SYMBOL_IMPORTS,
        HOST_PATH_SYMBOL_IMPORTS,
        CLAUDE_HOST_IMPORTS,
      ],
    }),
  },

  {
    // Roster that may only shrink: files still composing a host path from `CLAUDE_DIR` or
    // `LOCAL_SKILLS_PATH`. Re-derive with this block removed:
    //     npx eslint src --ext .ts,.tsx | grep 'A host path is resolved, not composed'
    files: [
      "src/cli/commands/eject.ts",
      "src/cli/commands/uninstall.tsx",
      "src/cli/lib/compiler.ts",
      "src/cli/lib/installation/installation.ts",
      "src/cli/lib/installation/layout-findings.ts",
      "src/cli/lib/plugins/plugin-finder.ts",
      "src/cli/lib/plugins/plugin-settings.ts",
      "src/cli/lib/seed/external-skills.ts",
      "src/cli/lib/skills/local-skill-loader.ts",
      "src/cli/lib/skills/local-skill-mover.ts",
      "src/cli/utils/messages.ts",
    ],
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [
        CONFIG_GATE_PRIVATE_IMPORTS,
        ...CONFIG_WRITER_IMPORTS,
        SOURCE_FOLDER_SYMBOL_IMPORTS,
        CLAUDE_HOST_IMPORTS,
      ],
    }),
  },

  {
    // Holds the renderers the gate deep-imports.
    files: ["src/cli/lib/configuration/**/*.ts"],
    ignores: TEST_FILES,
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [
        CONFIG_GATE_PRIVATE_IMPORTS,
        SOURCE_FOLDER_SYMBOL_IMPORTS,
        HOST_PATH_SYMBOL_IMPORTS,
        CLAUDE_HOST_IMPORTS,
      ],
    }),
  },

  {
    // Uses the gate's error class; gate-token.ts is a dependency-free leaf, so no cycle.
    files: ["src/cli/lib/configuration/config-types-io.ts"],
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [SOURCE_FOLDER_SYMBOL_IMPORTS, HOST_PATH_SYMBOL_IMPORTS, CLAUDE_HOST_IMPORTS],
    }),
  },

  {
    // Excluded above, so its syntax rules are restated, minus the dynamic-import ban.
    files: ["src/cli/lib/config-gate/**/*.ts"],
    ignores: TEST_FILES,
    rules: {
      ...restrictedImports({
        paths: FS_WRITE_PATHS,
        patterns: [SOURCE_FOLDER_SYMBOL_IMPORTS, HOST_PATH_SYMBOL_IMPORTS, CLAUDE_HOST_IMPORTS],
      }),
      "no-restricted-syntax": [
        "error",
        ...VACUOUS_COMPARISONS,
        ...SOURCE_FOLDER_LITERALS,
        ...HOST_PATH_LITERALS,
      ],
    },
  },

  {
    // The single write choke point; its tripwire needs the gate's token.
    files: ["src/cli/utils/fs.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    // The host seam may name the plugin functions; the literal bans still reach it.
    files: ["src/cli/lib/hosts/**/*.ts"],
    ignores: TEST_FILES,
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [
        CONFIG_GATE_PRIVATE_IMPORTS,
        ...CONFIG_WRITER_IMPORTS,
        SOURCE_FOLDER_SYMBOL_IMPORTS,
        HOST_PATH_SYMBOL_IMPORTS,
      ],
    }),
  },

  {
    // Specs may write folder names, since an imported constant would move with the product.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...TASK_ID_SHAPES, ...VACUOUS_COMPARISONS],
    },
  },

  {
    // The funnel: may write the folder name and import both symbol sets.
    files: ["src/cli/lib/installation/install-layout.ts"],
    rules: {
      ...restrictedImports({
        paths: FS_WRITE_PATHS,
        patterns: [CONFIG_GATE_PRIVATE_IMPORTS, ...CONFIG_WRITER_IMPORTS, CLAUDE_HOST_IMPORTS],
      }),
      "no-restricted-syntax": ["error", CONFIG_GATE_PRIVATE_DYNAMIC_IMPORT, ...VACUOUS_COMPARISONS],
    },
  },

  {
    // Re-exports the path symbols; the literal ban still applies.
    files: ["src/cli/consts.ts"],
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [CONFIG_GATE_PRIVATE_IMPORTS, ...CONFIG_WRITER_IMPORTS, CLAUDE_HOST_IMPORTS],
    }),
  },

  {
    // Reads a marketplace repo's provider-neutral `.agents-inc/` layout.
    files: ["src/cli/lib/configuration/config.ts"],
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [CONFIG_GATE_PRIVATE_IMPORTS, HOST_PATH_SYMBOL_IMPORTS, CLAUDE_HOST_IMPORTS],
    }),
  },

  {
    // The e2e mirror of product path strings: the spec zone's set minus the folder-name selectors.
    files: ["e2e/pages/constants.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...TASK_ID_SHAPES, ...VACUOUS_COMPARISONS],
    },
  },

  // Must stay last: turns off every rule that would fight prettier.config.mjs.
  eslintConfigPrettier,
);
