import js from "@eslint/js";
import { baseConfig, typeCheckedConfig } from "@workspace/eslint-config/base";
import { defineConfig, globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * The tool configs at the package root, named one by one rather than by a `*.ts` glob: a bare
 * root glob would also pull in whatever a throwaway harness leaves there, which is the trap the
 * long note in the block below is about.
 *
 * They are in `tsconfig.json`'s `include` as of 2026-08-22 and so are type-checked and reachable
 * by the type-aware rules — see that file's note for why the exemption they used to hold stopped
 * earning itself, and why a separately-named tsconfig could not have replaced it.
 */
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
// The renderers now live in `@workspace/compile`, and this rule matches on the
// import SPECIFIER — so the move would have stopped it firing with nothing to
// signal that: no directive is involved, and `reportUnusedDisableDirectives`
// cannot see a pattern that matches nothing. Both specifiers are named, the
// package's and the CLI's own re-exports, because a re-export from
// `config-writer.ts` would otherwise be the bypass. Naming the subpaths rather
// than the package is deliberate: a rule refusing `@workspace/compile` outright
// would ban the extraction it exists to permit.
const CONFIG_WRITER_IMPORTS = [
  {
    group: ["**/config-writer", "**/config-writer.js", "@workspace/compile/config-source"],
    importNames: ["generateConfigSource"],
    message: CONFIG_WRITER_MESSAGE,
  },
  {
    // `config-types-io` is where `regenerateConfigTypes` is DECLARED; the other two
    // specifiers re-export it. Naming all three is the same rule as above one level
    // on: the extraction moved the declaration to a new module and left the old
    // specifiers matching only a re-export, which is precisely the bypass this list
    // is written to close.
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
 * A comparison the code under it cannot falsify, which is a check in the shape of
 * a check. A count is never negative, so `>= 0` holds for every input and `< 0`
 * for none, in either operand order.
 *
 * Live on 2026-08-18: a hand-run verdict on two directory listings read
 * `after.length >= 0 && before.length >= 0` and reported success against every
 * input it was ever given. `@typescript-eslint/no-unnecessary-condition` is
 * enabled and cannot see it — that rule asks whether a value's TYPE settles the
 * condition, and `number >= 0` is a `boolean` the type `number` leaves open.
 * There is no non-negative number type to narrow a count to, so the shape is
 * only ever reachable syntactically.
 *
 * `x === x` is the same class and is `no-self-compare`'s. That one is core
 * ESLint, takes no options, and so merges across config blocks — it moved to
 * `packages/eslint-config/base.js` under CLI-532 and reaches every workspace.
 * These cannot follow it: `no-restricted-syntax` takes options, the last block
 * naming it for a file owns all of them, and so they are restated per zone.
 *
 * A `||` of two loose conditions is the same class again and is NOT lintable —
 * whether either side can be false is a question about the subject, not about
 * the syntax.
 */
const NEVER_NEGATIVE_COUNT = "/^(length|size|byteLength)$/";

const VACUOUS_COUNT_MESSAGE =
  "A length, a size and a byteLength are never negative, so this comparison holds for every input. Assert the count the change should produce. See .ai-docs/standards/e2e/README.md.";

/**
 * `size` and `byteLength` joined `length` on 2026-08-18, measured before they did
 * rather than assumed — the standard the two rejected sentinel checks set. The
 * selector reaches a property by NAME, so a domain object's own `size` field is
 * reached alongside `Map.prototype.size`, and that is where a false positive
 * would come from. Across every workspace there are twelve comparisons of a
 * `.size`, `.byteLength` or `.count` against a literal and every one is
 * discriminating (`> 0`, `=== 0`); none sits in the vacuous direction. The
 * widening condemns nothing that exists, which is what it had to show.
 *
 * `count` was measured and left out: it names no builtin, so a `count` field is
 * whatever its owner made it and a signed one is not a contradiction.
 */
/**
 * A task ID written where it will outlive the tracker row it names. Two surfaces a linter can see:
 * a test's own name, and an assertion message. Declared once and spread into both blocks that set
 * `no-restricted-syntax` for a spec, for the same reason `VACUOUS_COMPARISONS` is — the rule's
 * options do not merge, so a zone keeps only what it restates.
 */
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
 * The source folder's name, written anywhere but the funnel that resolves it.
 *
 * `.claude-src/` is becoming `.agents-inc/<provider>/`, and for as long as both names are live
 * every path under one is resolved by `lib/installation/install-layout.ts` — fourteen sites join a
 * directory from a root and seven print one at a user, and a single one of them left on a literal
 * gives a project that writes into a folder the CLI is no longer reading, with every test green.
 * A census grep finds today's sites; only a rule stops tomorrow's from being written.
 *
 * The regex demands a boundary on both sides, because the names this repository is full of are one
 * character away from the banned ones: `github:agents-inc/skills` is the default marketplace,
 * `agents-inc` is the package, `.claude-plugin/plugin.json` is a plugin manifest and `.claude/skills`
 * is where ejected skills land. A rule condemning any of those would be turned off within the hour,
 * so `src/cli/lib/__tests__/source-folder-literals-are-funnelled.test.ts` feeds each of them to this
 * config and requires silence, alongside the four banned spellings it requires a report for.
 *
 * Both halves are needed: a bare string literal and a template's static text are two node types,
 * and a selector for one says nothing about the other. Neither needs a `/`, which is fortunate —
 * esquery ends a regex at the first raw slash, and `\u002F` is the escape the config-gate selector
 * above already spells it with.
 */
const SOURCE_FOLDER_NAME = "/(^|[^\\w.-])[.](claude-src|agents-inc)([^\\w-]|$)/";

const SOURCE_FOLDER_MESSAGE =
  "The source folder's name is resolved, not written: call sourceFolderInUse/sourceDir from src/cli/lib/installation/install-layout.ts, or relativeConfigPath for a message. Both names are live and only that module knows which one a scope is on.";

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
 * The source folder's ROOT NAMES, imported by symbol anywhere but the four modules that own one.
 *
 * The literal ban above cannot see this half, and that is not a gap in its regex: the sites that
 * matter write no banned spelling at all. `path.join(root, SOURCE_ROOT_DIR, provider)` writes
 * nothing, and `sourceDirName("claude")` writes a bare provider name that no boundary-anchored
 * regex could condemn without condemning the word "claude". So the two selectors are the same ban
 * reaching the two ways a folder name arrives, and `todo/plans/CLI-source-folder-rename-plan.md`
 * :145 asks for exactly this pairing.
 *
 * `no-restricted-imports` rather than another `no-restricted-syntax` selector, deliberately: that
 * rule's options do not merge, so a file exempt from one of its selectors is exempt from ALL of
 * them — and three of the four modules below must keep the literal ban while losing this one.
 *
 * Specs need no exemption and are given none: no block sets `no-restricted-imports` for a file in
 * `TEST_FILES`, so the rule has never reached one.
 */
const SOURCE_FOLDER_SYMBOLS = ["SOURCE_ROOT_DIR", "LEGACY_SOURCE_DIR", "CLAUDE_SRC_DIR"];

const SOURCE_FOLDER_SYMBOL_MESSAGE =
  "The source folder's name is resolved, not composed: call sourceDir/sourceFolderInUse from src/cli/lib/installation/install-layout.ts, or relativeConfigPath for a message. Both names are live and only that module knows which one a scope is on.";

/**
 * Both specifiers the names are reachable through: the CLI's own barrel, and the package the
 * barrel re-exports them from. Naming only the barrel would leave a direct `@workspace/compile`
 * import as the bypass — which is the shape that already cost `CONFIG_WRITER_IMPORTS` a rule.
 */
const SOURCE_FOLDER_SYMBOL_IMPORTS = {
  group: ["**/consts", "**/consts.js", "@workspace/compile", "@workspace/compile/paths"],
  importNames: SOURCE_FOLDER_SYMBOLS,
  message: SOURCE_FOLDER_SYMBOL_MESSAGE,
};

/**
 * One host's plugin COMMANDS reached from anywhere but the seam they now live behind.
 *
 * The sibling of the two bans above and the class neither of them can see: those guard a folder
 * NAME and a host DIRECTORY, both of which are written as a path, while a caller of
 * `claudePluginInstall` writes no path at all. What it does instead is decide which host this CLI
 * is talking to, one call site at a time, which is the thing C3 exists to stop — a Codex
 * installation cannot be served by a caller that has already named Claude's binary.
 *
 * The availability probe is in the list for the same reason the census in
 * `lib/hosts/__tests__/the-claude-vocabulary-stays-behind-the-seam.test.ts` gives: a caller
 * holding `isClaudeCLIAvailable` has decided which host it is talking to just as firmly as one
 * installing a plugin. A bare `claude` prefix is NOT the rule, because the provider's own name is
 * a legitimate value everywhere.
 *
 * `no-restricted-imports` rather than a `no-restricted-syntax` selector, for the reason the
 * source-folder symbol ban already gives: that rule's options do not merge across flat-config
 * blocks, so a file exempt from one selector is exempt from ALL of them — and `lib/hosts/` must
 * keep every other restriction while losing this one.
 *
 * Both specifiers because both spellings are live in this package, and the group reads
 * `export … from` exactly as it reads `import`, so a re-export cannot be the way around it.
 */
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
 * A HOST path written anywhere but the module that answers where an installation puts things.
 *
 * The same shape as the source-folder ban above, one layer out: that one guards the folder this
 * product OWNS, this one guards the directories the HOSTS own. `install-layout.ts` answers them per
 * provider — `.claude/agents` on Claude against `<repo>/.codex/agents` or `$CODEX_HOME/agents` on
 * Codex; `.claude/skills` on Claude, `.agents/skills` in a Codex repo and `$CODEX_HOME/skills`
 * globally — so a path composed from a literal is a path that is right on one host and silently
 * wrong on the other. The Codex step's own risk register calls that a half-routed path: it writes a
 * directory the host never reads, exits 0, and every test stays green. The Codex project agents
 * directory carries a CONDITION as well as a place — the user's global config has to trust that
 * exact path — which is one more reason the answer is a role's and not a call site's.
 *
 * The regex demands a boundary on both sides for the reason the source-folder one does: the names
 * here are a character away from names this repository is full of. `.claude-plugin/plugin.json` is
 * a plugin manifest and `.claude-src` is the legacy source folder — both end the match on a `-`,
 * which `[^\w-]` excludes — and the bare word `claude` is a provider name rather than a directory.
 * `src/cli/lib/__tests__/host-path-literals-are-funnelled.test.ts` feeds each of those to this
 * config and requires silence beside the spellings it requires a report for.
 *
 * **`.claude.json` and its lock are BANNED, ruled 2026-09-21, and the message below is what that
 * ruling changed.** The trailing `[^\w-]` is satisfied by the `.`, so the selector already reported
 * them — while every role the message named answered something else, leaving an author condemned
 * with nowhere to go. Kept banned rather than carved out, on two counts: `~/.claude.json` is
 * Claude Code's own state file and Codex keeps its equivalent in `$CODEX_HOME/config.toml`, which
 * is this ban's class exactly; and excluding it needs a `/` after the name, which would license
 * `.claude.<anything>` for good. What the ruling owes it is a FUNNEL, so the message now says what
 * to do when no role answers the path — add one here.
 *
 * Both halves again: a bare string literal and a template's static text are two node types, and
 * neither needs a raw `/` — esquery ends a regex at the first one, so the separator is `/`.
 */
const HOST_DIRECTORY_NAME =
  "/(^|[^\\w.-])[.](claude|codex)([^\\w-]|$)|(^|[^\\w.-])[.]agents\\u002Fskills([^\\w-]|$)/";

const HOST_DIRECTORY_MESSAGE =
  "A host path is resolved, not written: call userConfigRoot/agentsDir/skillsDir/pluginsDir/permissionFiles/ownedRoots from src/cli/lib/installation/install-layout.ts. Claude and Codex keep these in different places, and only that module knows which host a scope is on. Where no role above answers the path you need, add the role there rather than composing it here.";

/**
 * The compiled agent's EXTENSION, which is the same class reached through a filename rather than a
 * directory: Claude reads `.md` and Codex reads `.toml`, so a literal extension decides which host
 * a file is legible on. `agentCodec(provider)` in the same module answers it, with the `listGlob`
 * beside it.
 *
 * Anchored to the WHOLE literal rather than boundary-matched, because an extension is a suffix of
 * every filename that carries it: an unanchored `.toml` condemns `config.toml`, and an unanchored
 * `.md` condemns every `SKILL.md` in a message. So the two spellings a codec answers with —
 * `.toml` and `*.toml` — are what this refuses, and nothing that merely ends in one.
 *
 * **`.md` and `*.md` are deliberately NOT here, and the omission is measured rather than an
 * oversight.** The census below answers six files; one is the layout module's own `agentCodec` and
 * is exempt, so FIVE product modules outside it still name the extension themselves, and a ban
 * landing before they move through `agentCodec` turns `npm run lint` red on files this step does
 * not own:
 *
 *     grep -rn '"\(\*\)\?\.md"' src --include='*.ts' --include='*.tsx' \
 *       | grep -v '\.test\.' | grep -v __tests__
 *
 * The Codex half can lead because nothing outside the layout module writes it yet, and a rule that
 * guards the new host from the day it exists is the half worth having first.
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

/**
 * A host's directory reached through the CONSTANT that spells it, which is the half the literal
 * ban above cannot see and never could.
 *
 * **This is the source-folder ban's two-halves discipline arriving at the host paths, and it
 * arrived late.** `SOURCE_FOLDER_SYMBOL_IMPORTS` says it in full for the folder this product owns:
 * "the sites that matter write no banned spelling at all". The same is true one layer out, and it
 * was measured rather than argued — two of the four Claude leaks found by driving the Codex lane
 * on 2026-09-22 were invisible to every selector above, for exactly this reason:
 *
 *   - `doctor`'s Skills Installed row: `path.join(baseDir, LOCAL_SKILLS_PATH, id, "SKILL.md")`,
 *     which reported every skill of a healthy Codex installation missing and named a directory
 *     that installation does not have.
 *   - the permission notice: `path.join(projectRoot, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON)`,
 *     which ended a Codex install by telling the user to go and edit a Claude settings file.
 *
 * Neither writes a banned spelling. `CLAUDE_DIR` is an identifier and `path.join` composes the
 * path at run time, so no regex over literals or template text can reach either — and both passed
 * `npm run lint` on the day they were written.
 *
 * `no-restricted-imports` rather than another selector, for the reason the two symbol bans before
 * it give: that rule's options do not merge, so a file exempt from one of its groups is exempt
 * from ALL of them — and `install-layout.ts` must keep every other restriction while losing this
 * one, because it is the module that declares the roles these constants feed.
 *
 * Both specifiers, because both spellings are live: the CLI's own barrel re-exports the names from
 * `@workspace/compile`, and naming only the barrel would leave the direct import as the bypass.
 * The rule reads `export … from` the same way, so the barrel itself needs its own exemption.
 */
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
 * `no-restricted-imports` takes ONE options object per file and the last config
 * block wins, so a zone that relaxes one restriction must restate the others.
 * `no-restricted-syntax` behaves identically, which is why `VACUOUS_COMPARISONS`
 * is spread into every block that names it rather than stated once — and why the
 * zones a block excludes need it restated. `spec-gates.test.ts` lints one real
 * file per zone against this config and fails if any of them accepts the shape.
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
    // The reserved prefix for scratch material — a verification harness or a
    // throwaway probe written into the package during a run. Without this entry a
    // scratch file whose name ends `.test.ts` or `.test.tsx` is linted wherever it
    // lands and reported as a syntax error; the `files:` note below is why. Reserved
    // in the repository-root .gitignore, with a matching .prettierignore entry.
    ".scratch*",
    ".scratch*/**",
    // Emitted by `npm run generate:types` — fix the generator, not the output.
    "src/cli/types/generated/**",
    // Emitted by `scripts/handrun.mjs`, which bundles the hand-run and its whole
    // dependency tree with esbuild. Same rule as above and a stronger case for it:
    // the bundle is mostly vendored third-party source, so linting it reports
    // against code no one here can edit — including its `eslint-disable` comments,
    // which `reportUnusedDisableDirectives` judges against THIS config rather than
    // the one they were written for. Gitignored at the repository root.
    "e2e/helpers/*.gen.mjs",
  ]),

  // A disable comment whose rule no longer fires is a claim about the code
  // that has stopped being true. Two of those went stale on 2026-07-30 and sat
  // unread; this would have caught both by itself (CLI-355).
  { linterOptions: { reportUnusedDisableDirectives: "error" } },

  {
    // The shared set, scoped to what this package actually compiles. `baseConfig` and
    // `typeCheckedConfig` both match `**/*.{ts,tsx}`; the `files` here narrows them to the three
    // source trees plus the four root tool configs named above — everything this package has a
    // tsconfig for, and so everything the type-aware rules can be run against at all.
    //
    // What the narrowing does NOT do is exclude everything else, and the difference is
    // worth knowing before it costs someone a session. Two of the TEST_FILES patterns
    // below — `**/*.test.ts` and `**/*.test.tsx` — name an extension and carry no
    // anchor, so they reach any depth of this package, a scratch directory nobody
    // meant to lint included. The blocks holding them set rules and no parser, so such
    // a file is read by espree as JavaScript: an annotation reports `Unexpected token
    // :`, an interface reports `Unexpected token interface`, and lint fails for the
    // whole package having named a syntax error in a file whose syntax is fine. The
    // report points nowhere, because the defect is the file's LOCATION. Anything else
    // out here is skipped instead ("File ignored because no matching configuration was
    // supplied"), and TEST_FILES' three directory-shaped patterns name no extension so
    // they pull nothing into a directory scan — which makes the trap specific to the
    // test-file NAMES, exactly what a throwaway verification harness writes. Measured
    // under ESLint 10.8.0; `.scratch*` in globalIgnores above is the reserved home
    // that keeps such a harness out of the run.
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

      // `no-self-compare` used to be stated here. It is the other half of the
      // vacuous-comparison shape `VACUOUS_COMPARISONS` describes, and it now
      // arrives with the shared base — `x === x` is not a mistake this package
      // has a special claim on, and stating it here left every other workspace
      // accepting the shape (CLI-532). Its selector half cannot follow: those
      // take options, so they do not merge across blocks.

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
    //
    // `HOST_PATH_LITERALS` is deliberately NOT here, and the asymmetry with the line above it is
    // the whole of the reason. The SOURCE folder's name is changing under everyone, so a fixture
    // that spells it has to be found; a HOST's directory name is fixed by Claude Code and by Codex,
    // and a fixture that spells `.claude/agents` is recording what the host does rather than
    // deciding where this CLI writes. Every hit measured in this zone is that shape — the
    // golden-tree fixtures, `mock-stacks.ts`'s recorded `path:` field, and the hand-run harness
    // reading back what an install left on disk. The risk the ban exists for is a PRODUCT path that
    // is right on one host and silently wrong on the other, and no fixture ships.
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
    // The product files that still spell a host directory themselves, rostered rather than
    // tolerated: the ban above reaches every other file in the zone from the day it lands, and
    // this list may only shrink. Each site is USER-FACING PROSE — a command description, a log
    // line, a `verbose` line — rather than a path composition, which is why none of them is a
    // half-routed write today and why all of them are wrong the moment a Codex installation prints
    // one: `skillsPathPrefix(provider, scope, projectDir)` is the role that answers `.claude/skills`
    // on Claude, `.codex/skills` on a Codex global and `.agents/skills` in a Codex repo, and it
    // exists precisely to be the spelling a message shows.
    //
    // **It shrank from three files to one on 2026-09-22**, which is the only direction it moves.
    // `installation.ts` was the entry this list said needed more than a call — its
    // `INSTALL_MODE_DESCRIPTIONS` is a module-level const — and the answer turned out to be that a
    // const cannot name the directory truthfully at all: the eject destination is the host's AND
    // the scope's, and one selection routinely spans two of them, so the parenthetical went rather
    // than being routed. `discover-skills.ts` came off with the read path it documents.
    // `init.tsx` stays for its command DESCRIPTION, which oclif reads at module load and prints in
    // `--help` with no installation in hand, so there is no scope to resolve a path against.
    //
    // Re-derive the roster rather than trusting this list — the rule prints it, with this block
    // removed:
    //
    //     npx eslint src --ext .ts,.tsx | grep 'A host path is resolved, not written'
    //
    // Everything the zone above still owes is restated, because `no-restricted-syntax` does not
    // merge and the last block naming the rule for a file owns all of its options.
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
    // The product files that still COMPOSE a host path out of `CLAUDE_DIR` or `LOCAL_SKILLS_PATH`,
    // rostered rather than tolerated: `HOST_PATH_SYMBOL_IMPORTS` reaches every other file in the
    // zone from the day it lands, and this list may only shrink. It is the symbol ban's twin of
    // the literal roster above, and it is longer for the reason the ban exists — a composition
    // hides, so these sites accumulated while `npm run lint` stayed green over every one of them.
    //
    // Each is a real answer owed, not prose: `installation.ts` and `layout-findings.ts` compose an
    // agents or skills directory that is Claude's on a Codex installation; `plugin-finder.ts` and
    // `plugin-settings.ts` compose Claude's plugin tree, which `pluginsDir`/`pluginRegistry` now
    // answer per host; `local-skill-loader.ts`, `local-skill-mover.ts`, `external-skills.ts` and
    // `eject.ts` read and write ejected skills where only Claude keeps them; `messages.ts` and
    // `uninstall.tsx` put one host's directory into a sentence every host's user reads; and
    // `compiler.ts` names a legacy templates directory. None is a one-line repoint — several need
    // a scope before they can ask for a path at all, which is why they are a backlog and not this
    // step's diff.
    //
    // Re-derive the roster rather than trusting this list — the rule prints it, with this block
    // removed:
    //
    //     npx eslint src --ext .ts,.tsx | grep 'A host path is resolved, not composed'
    //
    // Everything the CLI zone still owes is restated, because `no-restricted-imports` takes one
    // options object per file and the last block naming the rule owns all of it.
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
    // The renderers live here and this directory composes them; the gate deep-imports
    // them from it. Still no raw writes and no reaching into the gate's privates.
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
    // Enforcement guard #1: refuses a home-directory types write by name, and needs
    // the gate's error class to do it. gate-token.ts is a dependency-free leaf, so
    // the import cannot cycle back through the gate.
    //
    // It was `config-types-writer.ts` until the renderers moved into
    // `@workspace/compile`; that module is now a re-export facade and the half that
    // probes disk and writes is this one.
    files: ["src/cli/lib/configuration/config-types-io.ts"],
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [SOURCE_FOLDER_SYMBOL_IMPORTS, HOST_PATH_SYMBOL_IMPORTS, CLAUDE_HOST_IMPORTS],
    }),
  },

  {
    // The gate itself: composes its own private files and the renderers. It writes
    // through utils/fs like everything else, so the raw-write ban still applies.
    //
    // Every block above excludes this directory, so it inherits no
    // `no-restricted-syntax` at all and the vacuous-comparison selectors have to be
    // restated. Deliberately WITHOUT `CONFIG_GATE_PRIVATE_DYNAMIC_IMPORT`: reaching
    // the gate's privates is this directory's own privilege.
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
    // Enforcement guard #2: the single write choke point. It IS the raw-write
    // wrapper, and it holds the runtime tripwire, which needs the gate's token.
    files: ["src/cli/utils/fs.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  {
    // The seam, and the one directory a host's plugin functions may be named in. It IS the module
    // the ban's own message points every other caller at, so the ban cannot condemn it — the
    // Claude host is built out of exactly the names the group refuses everywhere else.
    //
    // A narrower exemption than turning the rule off, on the same terms as the two blocks below:
    // `no-restricted-imports` takes one options object per file and the last block naming the rule
    // wins all of it, so everything the CLI zone still owes is restated with only this group
    // dropped. The LITERAL bans are untouched — this block does not name `no-restricted-syntax`,
    // so the host-path and source-folder selectors go on reaching these files from the product
    // zone above, which is what stops a host module composing `.claude/plugins` by hand.
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
    // A SPEC may write the folder names, and its shared infrastructure may not.
    //
    // This is the repository's existing ruling about rendering assertions arriving at the rename:
    // `.claude-src` is text already written into directories on people's disks, so an assertion
    // that imported the constant the product writes would move with it and could never fail. Every
    // spec in the rename's own suite pins both names as literals for exactly that reason.
    //
    // What stays banned in the spec zone is everything that is not a spec — page objects,
    // assertion modules, fixtures and helpers. Those are shared vocabulary rather than a single
    // test's subject, and `e2e/pages/constants.ts` is where the e2e tree keeps one copy of it.
    // That is the line the ban draws here: one mirror, not one literal per helper.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...TASK_ID_SHAPES, ...VACUOUS_COMPARISONS],
    },
  },

  {
    // The funnel itself, and the mirror the e2e tree keeps of the product's path vocabulary.
    // These are the three files the source folder's name is ALLOWED to be written in: two declare
    // it and one deliberately copies it, because `e2e/pages/constants.ts` exists to MIRROR the
    // product's strings rather than import them — an assertion that imported the constant the
    // product writes would move with it and could never fail.
    //
    // A narrower exemption than turning the rule off: every other selector each of these files
    // owes is restated, because `no-restricted-syntax` does not merge and the last block naming
    // the rule for a file owns all of its options. `install-layout.ts` is in the product zone and
    // `constants.ts` is in the spec zone, so each gets its own zone's set back minus this one.
    //
    // `install-layout.ts` is also the module BOTH symbol bans point every other caller AT —
    // `SOURCE_FOLDER_SYMBOL_IMPORTS` and `HOST_PATH_SYMBOL_IMPORTS` — so it is the one place
    // either set of symbols is imported, and its import rules are its zone's minus those two
    // groups, restated for the same reason and on the same terms. It is `CLAUDE_DIR`'s single
    // reader: the whole point of the host-path symbol ban is that this module turns it into a
    // role and nobody else joins a path out of it.
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
    // The barrel that re-exports the path vocabulary from `@workspace/compile`. It is the reason
    // those names are reachable in this package at all, so neither symbol ban can condemn it — and
    // `no-restricted-imports` reads `export … from` exactly as it reads `import`, so a re-export
    // is reported unless it is named here. That applies to `CLAUDE_DIR` and `LOCAL_SKILLS_PATH`
    // exactly as it does to the source-folder names.
    //
    // The LITERAL ban is deliberately NOT lifted: this file re-exports the names, it does not
    // write them, and its `no-restricted-syntax` goes on coming from the product zone above.
    files: ["src/cli/consts.ts"],
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [CONFIG_GATE_PRIVATE_IMPORTS, ...CONFIG_WRITER_IMPORTS, CLAUDE_HOST_IMPORTS],
    }),
  },

  {
    // The SOURCE-REPO door, which is a different question from the installation funnel and is why
    // `loadSourceRepoConfig` exists: a marketplace repo declares its layout in either folder and
    // always will, while an installation is on exactly one and `install-layout.ts` says which.
    // `SOURCE_REPO_CONFIG_FOLDERS` is that "either" written down, so it holds both names by
    // design. The other side of the pair is `utils/fs.ts`, whose global-pair tripwire must know
    // every folder a write could land in rather than the one in use — its rule is already off.
    //
    // Its zone is the configuration block above, so that block's set comes back minus this group —
    // the SOURCE-folder one alone. `HOST_PATH_SYMBOL_IMPORTS` is a different subject and is
    // restated: this file's business is which folder a marketplace REPO declares its layout in,
    // which says nothing about where a host keeps a user's state.
    files: ["src/cli/lib/configuration/config.ts"],
    rules: restrictedImports({
      paths: FS_WRITE_PATHS,
      patterns: [CONFIG_GATE_PRIVATE_IMPORTS, HOST_PATH_SYMBOL_IMPORTS, CLAUDE_HOST_IMPORTS],
    }),
  },

  {
    // The e2e half of the exemption above, and the block the sentence "each gets its own zone's
    // set back minus this one" is about. `constants.ts` is in the SPEC zone, so what it owes back
    // is that zone's pair — the task-ID shapes and the vacuous comparisons — with only the
    // source-folder selectors dropped. Stating `VACUOUS_COMPARISONS` alone dropped `TASK_ID_SHAPES`
    // with it, and no gate could see it: the roster in `spec-gates.test.ts` measures this zone
    // against the vacuous shapes and nothing measures it against a task ID.
    files: ["e2e/pages/constants.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...TASK_ID_SHAPES, ...VACUOUS_COMPARISONS],
    },
  },

  // Must stay last: turns off every rule that would fight prettier.config.mjs.
  eslintConfigPrettier,
);
