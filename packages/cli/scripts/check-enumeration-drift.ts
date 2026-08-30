/**
 * Every document that claims to enumerate a source symbol exhaustively still names what that
 * symbol actually holds — judged as MEMBERSHIP in both directions, not as a total.
 *
 * It exists because the same defect was filed five times in eighteen days and re-derived by hand
 * every one of them: 2026-08-01 (72 and 64 against 74), 08-08 (94 against 109), 08-16 (139 against
 * 149), 08-17 (a different document family — `reference/commands/index.md`'s constant objects,
 * `STATUS_MESSAGES` and the message builders), 08-18 (165 against 171, and two of the 165 named
 * symbols that had been deleted). A count is correct on the day it is written and wrong within a
 * fortnight, because adding a member is a one-line edit in a file no documentation pass is looking
 * at. Nothing connected the two, so each repair held until the next member landed.
 *
 * **Membership rather than the total, because the two failures are not the same size.** A list that
 * is short under-reports: a reader looks for a sentinel, does not find it, and writes a duplicate
 * constant. A list naming a symbol that no longer exists mis-reports: the reader greps, finds
 * nothing anywhere in the tree, and reasonably concludes the document describes a different
 * codebase — after which nothing else in it is trusted either. Two lists can agree on a total and
 * disagree on every name in it.
 *
 * **The registry is not `STEP_TEXT`-shaped.** The 08-17 filing was about a different family
 * entirely, and a `STEP_TEXT`-specific checker would have caught one of the five. A row names any
 * exported symbol — a const object, a const array, a union — a module's whole export list of one
 * kind, or a whole DIRECTORY's, against any delimited section of any document.
 *
 * **A claim is not always about a symbol, and a section is not always one table.** The directory
 * shape exists because two of the claims here are membership of a TREE: the three test-utility
 * tables in `reference/testing/factories.md` state what a directory exports, and the command roster
 * in `reference/commands/index.md` states what `src/cli/commands/**` holds — a barrel declares
 * nothing of its own and oclif's `pattern` strategy declares no id anywhere, so neither had a symbol
 * to bind and both went unbound while every constant object beside them was registered. The
 * `partitioned-tables` reader exists for the same reason one level down: `zod-schemas.md` splits its
 * 34 schemas across four tables, and a reader that stopped at the first could not express the claim
 * at all.
 *
 * **A member is not always the whole claim.** Two of the columns a document writes are bound here
 * as one string — `key = value` — because a table stating what each member HOLDS is wrong in a way
 * a key-only reading cannot see. `E2E_SKILL_TITLES` was registered, answered `agrees` over ten
 * members and reported the run clean while five of its document's title cells were wrong: the
 * source side read `property.name.text` and never reached an initializer, and the document side
 * read the first cell of a row and could not reach a second column. Pairs rather than values,
 * because a values-only set cannot see a SWAP — two rows exchanging their titles leave that set
 * identical and every count intact — and because a pair is still a `string`, so the verdict, the
 * comparison and everything downstream of them are untouched by this.
 *
 * **A row that judges nothing is a hard failure, not a skip.** Every check here that has failed us
 * failed by declining to judge, and a row that quietly reads an empty section reads exactly like a
 * row that passed. So a missing file, a missing symbol, a section opener that has moved or appears
 * twice, and an enumeration that parses to nothing all throw.
 *
 * Nothing runs at module scope — the suite beside it is the enforcement, as with
 * `check-findings-frontmatter.ts`, and the package root is a parameter so it can be driven against
 * a fixture.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";

/** Where the check reads from when no other root is given. */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const E2E_CONSTANTS = "e2e/pages/constants.ts";
const MESSAGES = "src/cli/utils/messages.ts";
const E2E_README = ".ai-docs/standards/e2e/README.md";
const E2E_INFRASTRUCTURE = ".ai-docs/reference/testing/e2e-infrastructure.md";
const COMMANDS_INDEX = ".ai-docs/reference/commands/index.md";
const UTILITIES = ".ai-docs/reference/utilities.md";
const CONSTS = "src/cli/consts.ts";
// The pure half of `consts.ts` moved into `@workspace/compile` so the editor's output preview can
// hold the same path vocabulary the CLI writes with; `consts.ts` re-exports every name, so no call
// site moved but the DECLARATIONS these rows enumerate did.
const COMPILE_PATHS = "../compile/src/paths.ts";
const EXIT_CODES_FILE = "src/cli/lib/exit-codes.ts";
const SOURCE_TYPES = "src/cli/types/generated/source-types.ts";
// The config-pair renderers moved into `@workspace/compile` so the editor draws the bytes an
// install writes; the CLI modules named in these claims re-export them.
const CONFIG_WRITER = "../compile/src/config-source.ts";
const CONFIG_TYPES_WRITER = "../compile/src/config-types-source.ts";
// Moved with the renderers — `configuration/config-generator.ts` re-exports.
const CONFIG_GENERATOR = "../compile/src/seed-to-config.ts";
// Moved with the emitters that read them — `configuration/scope-predicates.ts` re-exports.
const SCOPE_PREDICATES = "../compile/src/scope-predicates.ts";
const CONFIG_WRITER_DOC = ".ai-docs/reference/config/config-writer.md";
const SCOPE_SPLIT_DOC = ".ai-docs/reference/config/scope-split.md";
const CONFIGURATION_DOC = ".ai-docs/reference/features/configuration.md";
const SCOPE_SYSTEM_DOC = ".ai-docs/reference/concepts/scope-system.md";
const TYPE_SYSTEM = ".ai-docs/reference/type-system.md";
const MATRIX_TYPES = "src/cli/types/matrix.ts";
const MODEL_AND_EFFORT = ".ai-docs/reference/features/model-and-effort.md";
const CONTENT_GENERATORS = "src/cli/lib/__tests__/content-generators.ts";
const TEST_FS_UTILS = "src/cli/lib/__tests__/test-fs-utils.ts";
const TEST_FIXTURES = "src/cli/lib/__tests__/test-fixtures.ts";
const CREATE_E2E_SOURCE = "e2e/helpers/create-e2e-source.ts";
const TEST_UTILS = "e2e/helpers/test-utils.ts";
const TESTING_FACTORIES = ".ai-docs/reference/testing/factories.md";
const MOCK_DATA = ".ai-docs/reference/testing/mock-data.md";
const MOCK_DATA_MODULE_DIR = "src/cli/lib/__tests__/mock-data";
const MOCK_AGENTS = `${MOCK_DATA_MODULE_DIR}/mock-agents.ts`;
const MOCK_CATEGORIES = `${MOCK_DATA_MODULE_DIR}/mock-categories.ts`;
const MOCK_SOURCES = `${MOCK_DATA_MODULE_DIR}/mock-sources.ts`;
const MOCK_SOURCE_FILES = `${MOCK_DATA_MODULE_DIR}/mock-source-files.ts`;
const SCHEMAS = "src/cli/lib/schemas.ts";
const ZOD_SCHEMAS = ".ai-docs/reference/types/zod-schemas.md";
const TEST_FACTORIES_DIR = "src/cli/lib/__tests__/factories";
const TEST_HELPERS_DIR = "src/cli/lib/__tests__/helpers";
const TEST_ASSERTIONS_DIR = "src/cli/lib/__tests__/assertions";
const COMMANDS_DIR = "src/cli/commands";
const HOTKEYS = "src/cli/components/wizard/hotkeys.ts";
const WIZARD_STORE = "src/cli/stores/wizard-store.ts";
const SCOPE_DIFF = "src/cli/lib/wizard/scope-diff.ts";
const COMPONENT_PATTERNS = ".ai-docs/reference/component-patterns.md";
const STORE_MAP = ".ai-docs/reference/store-map.md";
const WIZARD_FLOW = ".ai-docs/reference/features/wizard-flow.md";
const STATE_TRANSITIONS = ".ai-docs/reference/wizard/state-transitions.md";

/** A backticked name shaped like a constant. Group labels (`update`, `init --from`) are not. */
const CONSTANT_SPAN = /`([A-Z][A-Z0-9_]*)`/g;

/** A markdown table's rule row, which is what separates its heading from the rows worth reading. */
const TABLE_RULE = /^\|[\s:|-]+\|\s*$/;

/** The `(count)` or `(...)` a document writes beside a function name it is naming as a member. */
const CALL_SIGNATURE = /\(.*\)$/;

/** A backticked span, which is how a document writes one name. Counting them counts the names. */
const CODE_SPAN = /`[^`]+`/g;

const TABLE_CELL_DELIMITER = "|";
const CODE_SPAN_DELIMITER = "`";

/**
 * What ends a cell: a `|` the author did not escape.
 *
 * Markdown gives a table cell one escape and no other way to hold a pipe — `\|`, which the renderer
 * resolves BEFORE it parses the cell's inline markup, so it works inside a code span where no other
 * backslash escape does. A reader splitting on a bare `|` therefore disagrees with every renderer of
 * the same page about where a correctly-written cell ends, and the row comes out one cell too wide.
 *
 * Spelt exactly as `src/cli/lib/__tests__/helpers/journey-page.ts` spells it, which reads the
 * journey tables through the same rule. Two escape-aware readers disagreeing about where a cell
 * ends would be worse than one naive one, so the two spellings are held against each other in
 * `scripts/check-enumeration-drift.test.ts` — nothing else makes a verbatim copy move with its
 * origin, and a comment naming the other file is findable rather than binding.
 */
const CELL_SEPARATOR = /(?<!\\)\|/;

/** The escape, undone once the cell it belongs to has been separated out. */
const ESCAPED_PIPE = "\\|";

/** What binds a member to its value in a pair. Written once, in {@link pairOf}, for both sides. */
const PAIR_SEPARATOR = " = ";

export const NO_SOURCE_FILE = "names a source file that does not exist";
export const NO_SOURCE_DIRECTORY = "names a source directory that does not exist";
export const NO_SYMBOL = "names a symbol its source file does not export";
export const SOURCE_ENUMERATES_NOTHING = "names a symbol that enumerates nothing";
export const UNREADABLE_MEMBER = "names a symbol holding a member no reader can name";
export const UNREADABLE_VALUE = "names a symbol holding a member whose value no reader can name";
export const UNNAMEABLE_REEXPORT = "names a directory whose module re-exports a whole module";
export const WHOLE_MODULE_REEXPORT = "names a file that re-exports a whole module";
export const REEXPORTS_A_DECLARATION = "names a file handing on its own declaration as a re-export";
export const NO_DOCUMENT = "names a document that does not exist";
export const NO_SECTION = "names a section its document no longer holds";
export const AMBIGUOUS_SECTION = "opens a section at text the document uses more than once";
export const DOCUMENT_ENUMERATES_NOTHING = "opens a section that enumerates nothing";
export const AMBIGUOUS_MEMBER_CELL = "opens a section whose table cell names more than one member";
export const NO_COLUMN = "opens a section whose table carries no column of that name";
export const AMBIGUOUS_COLUMN = "opens a section whose table carries that column twice";

/** Extensions a module of this package is written in. A `.gitkeep` is not one. */
const MODULE_EXTENSIONS = [".ts", ".tsx"];

/** A spec beside a module is not part of its directory's export surface, nor a command. */
const SPEC_SUFFIXES = [".test.ts", ".test.tsx"];

/**
 * What separates a topic from its command in an id, per `oclif.topicSeparator` in `package.json`.
 * The roster's own strategy is `pattern`, so a path under the tree IS the id and nothing declares
 * it — which is why the roster is a directory rather than a symbol.
 */
const COMMAND_TOPIC_SEPARATOR = " ";

/**
 * Which members of the source tree a row is about.
 *
 * Three shapes name a FILE: one exported symbol's members, the module's own export list of one
 * kind, or its RE-EXPORT surface — what a consumer imports from it that it did not write. The
 * fourth names a DIRECTORY, because two claims this registry has to hold are membership of a tree
 * and of no file in it — a barrel `index.ts` declares nothing of its own, and no expression
 * anywhere holds "the commands under `src/cli/commands/`". Both had gone unbound for exactly that
 * reason, and the second is what let a live command be documented as deleted.
 *
 * `entries` is the fifth, and it names the same subject as `symbol` read one level deeper: every
 * member bound to the value it holds. It is a shape of its own rather than an option on `symbol`
 * because the two answer different strings for the same literal, and a row states which of them its
 * document carries — a table with a value column is a different claim from a list of names, and the
 * one that went wrong is the one nothing was reading.
 *
 * `reexports` is a shape rather than a widening of either neighbour. `exports` reads DECLARATIONS
 * and skips every `export { … }`; the directory reader answers a whole tree, so a row naming one
 * file cannot ask it — and it drops type-only re-exports, which is right for its own subject
 * (exported VALUES) and wrong for this one: a module's re-export surface is what its consumers
 * import, and seven of the thirty-one this was written for are types. `"every-name"` says so, and
 * leaves room for a values-only reading to arrive with its own reason rather than by default.
 */
export type SourceEnumeration =
  | { file: string; symbol: string }
  | { file: string; entries: string }
  | { file: string; exports: "const" | "function" }
  | { file: string; reexports: "every-name" }
  | { directory: string; enumerates: "exported-values" | "command-ids" };

/**
 * Where a document states that membership. The section is the text strictly between the two
 * markers, so a marker may carry the symbol's own name without the reader counting it as a member.
 *
 * `code-spans` reads every constant-shaped backticked name in the section, which is how both
 * `STEP_TEXT` documents state their list. `table-rows` reads the first cell of every row under the
 * first table's rule, which is how `reference/commands/index.md` states its two.
 *
 * `table-pairs` reads two NAMED columns of the section's table and answers `key = value` for each
 * row. The columns are named rather than counted because a document is free to write a third
 * between them — `e2e-infrastructure.md` writes an id there — and because a positional reader goes
 * on answering confidently after a column is inserted, which is the failure this whole file exists
 * to refuse. A heading that has been renamed is refused by name rather than read as an empty
 * column, since silently reading nothing is how the binding was lost in the first place.
 *
 * `partitioned-tables` reads every table in the section whose first column carries `column`, for an
 * enumeration a document states as several tables rather than one — `zod-schemas.md` splits its
 * schemas across four. The heading is named rather than inferred from the first table, so a table
 * on another subject standing between them is not read and a renamed heading refuses rather than
 * dropping a whole partition.
 */
type DocumentSection = { document: string; from: string; to: string };

export type DocumentClaim =
  | (DocumentSection & { states: "code-spans" })
  | (DocumentSection & { states: "table-rows" })
  | (DocumentSection & { states: "table-pairs"; keyColumn: string; valueColumn: string })
  | (DocumentSection & { states: "partitioned-tables"; column: string });

export type RegistryEntry = {
  claim: string;
  source: SourceEnumeration;
  document: DocumentClaim;
};

/** One claim's answer: the document and the source name the same members, or these differ. */
export type EnumerationVerdict =
  | { claim: string; outcome: "agrees"; members: number }
  | {
      claim: string;
      outcome: "drifted";
      namedButAbsent: string[];
      presentButUnnamed: string[];
    };

export type CheckResult = { clean: boolean; verdicts: EnumerationVerdict[] };

/**
 * Every enumeration a document claims is exhaustive. One row per claim; a claim spanning two
 * documents is two rows, because each is separately wrong.
 */
export const REGISTRY: RegistryEntry[] = [
  {
    claim: "STEP_TEXT in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "STEP_TEXT" },
    document: {
      document: E2E_README,
      from: "the groups below partition all",
      to: "**Diff markers",
      states: "code-spans",
    },
  },
  {
    claim: "STEP_TEXT in reference/testing/e2e-infrastructure.md",
    source: { file: E2E_CONSTANTS, symbol: "STEP_TEXT" },
    document: {
      document: E2E_INFRASTRUCTURE,
      from: "| `STEP_TEXT`",
      to: "| `TIMEOUTS`",
      states: "code-spans",
    },
  },
  {
    claim: "the constant objects of utils/messages.ts in reference/commands/index.md",
    source: { file: MESSAGES, exports: "const" },
    document: {
      document: COMMANDS_INDEX,
      from: "constant objects and one bare string constant, enumerated exhaustively:",
      to: "The same module exports these",
      states: "table-rows",
    },
  },
  // The remaining rows of the same table. `STATUS_MESSAGES` was registered alone, and the row two
  // below it was the one that had drifted: `SHARED_CONFIG_APPLY` named five members against seven,
  // missing `GLOBAL_SKILLS_HEADING` and `GLOBAL_AGENTS_HEADING` — the project-scope removal plan's
  // own two headings, which `commands/edit.md` had been naming all along. One table introduced as
  // "enumerated exhaustively" with a single one of its objects bound to source is what let that sit.
  {
    claim: "ERROR_MESSAGES in reference/commands/index.md",
    source: { file: MESSAGES, symbol: "ERROR_MESSAGES" },
    document: {
      document: COMMANDS_INDEX,
      from: "| `ERROR_MESSAGES`",
      to: "| `SUCCESS_MESSAGES`",
      states: "code-spans",
    },
  },
  {
    claim: "SUCCESS_MESSAGES in reference/commands/index.md",
    source: { file: MESSAGES, symbol: "SUCCESS_MESSAGES" },
    document: {
      document: COMMANDS_INDEX,
      from: "| `SUCCESS_MESSAGES`",
      to: "| `STATUS_MESSAGES`",
      states: "code-spans",
    },
  },
  {
    claim: "STATUS_MESSAGES in reference/commands/index.md",
    source: { file: MESSAGES, symbol: "STATUS_MESSAGES" },
    document: {
      document: COMMANDS_INDEX,
      from: "| `STATUS_MESSAGES`",
      to: "| `INFO_MESSAGES`",
      states: "code-spans",
    },
  },
  {
    claim: "INFO_MESSAGES in reference/commands/index.md",
    source: { file: MESSAGES, symbol: "INFO_MESSAGES" },
    document: {
      document: COMMANDS_INDEX,
      from: "| `INFO_MESSAGES`",
      to: "| `UNINSTALL_PLAN`",
      states: "code-spans",
    },
  },
  {
    claim: "UNINSTALL_PLAN in reference/commands/index.md",
    source: { file: MESSAGES, symbol: "UNINSTALL_PLAN" },
    document: {
      document: COMMANDS_INDEX,
      from: "| `UNINSTALL_PLAN`",
      to: "| `SHARED_CONFIG_APPLY`",
      states: "code-spans",
    },
  },
  {
    claim: "SHARED_CONFIG_APPLY in reference/commands/index.md",
    source: { file: MESSAGES, symbol: "SHARED_CONFIG_APPLY" },
    document: {
      document: COMMANDS_INDEX,
      from: "| `SHARED_CONFIG_APPLY`",
      // Was `| \`SHARED_CONFIG_ONE_DIRECTION\`` until 2026-08-24, when that refusal was deleted —
      // `--ui` now opens whatever `--from` names rather than refusing the pair. A boundary anchored
      // on a NEIGHBOUR breaks when the neighbour goes, which is a second row reddening for a reason
      // that has nothing to do with its own subject.
      to: "| `INCOMPLETE_WORK_RECOVERY`",
      states: "code-spans",
    },
  },
  {
    claim: "INCOMPLETE_WORK_RECOVERY in reference/commands/index.md",
    source: { file: MESSAGES, symbol: "INCOMPLETE_WORK_RECOVERY" },
    document: {
      document: COMMANDS_INDEX,
      from: "| `INCOMPLETE_WORK_RECOVERY`",
      to: "The same module exports these",
      states: "code-spans",
    },
  },
  {
    // The roster itself — the membership of a TREE, which is why it went unbound while every
    // constant object in the same document was registered, and why `import skill`, `new skill` and
    // `new agent` could be documented as removed with `new marketplace` beside them in the same
    // sentence. The document states the binding it needs in its own words: "The roster is
    // `src/cli/commands/**` and nothing else: `oclif.commands.strategy` is `"pattern"` over
    // `./dist/commands`, so a file under that tree IS a command and a command is nothing else."
    // Nothing declares an id, so nothing but the tree can be read.
    //
    // A `--help` diff would answer a different question — what oclif discovered in a BUILT `dist/`,
    // aliases included, so `list` and `ls` are two rows for one class — and needs the binary. This
    // row reads source, crosses no tsconfig boundary and runs in the same pass as its neighbours.
    claim: "the command roster of src/cli/commands/ in reference/commands/index.md",
    source: { directory: COMMANDS_DIR, enumerates: "command-ids" },
    document: {
      document: COMMANDS_INDEX,
      from: "## Commands Index",
      to: "commands, in two topics",
      states: "table-rows",
    },
  },
  {
    claim: "the message builders of utils/messages.ts in reference/commands/index.md",
    source: { file: MESSAGES, exports: "function" },
    document: {
      document: COMMANDS_INDEX,
      from: "No other function is exported from it:",
      to: "## Operations Layer Usage by Command",
      states: "table-rows",
    },
  },
  {
    // The second writable copy of the row above, which is the condition documentation-bible.md's
    // "A Count Lives in Exactly One Document" forbids. Both were carrying `globallyInstalledKept`,
    // renamed to `globallyInstalledRemoved` when a project run started REMOVING global entries
    // rather than keeping them, and neither had ever named `unplaceableKept`. Registering both is
    // what stops one being repaired while the other is not.
    claim: "the message builders of utils/messages.ts in reference/utilities.md",
    source: { file: MESSAGES, exports: "function" },
    document: {
      document: UTILITIES,
      from: "Exported from the same file, exhaustive and in source order.",
      to: "`INFO_MESSAGES.CONFIG_TYPES_REFRESHED` is the success counterpart",
      states: "table-rows",
    },
  },

  // `reference/utilities.md`'s own copies of the message objects — second writable copies of rows
  // above it, registered for the same reason the builders were. `SHARED_CONFIG_APPLY` named five
  // members against seven in BOTH documents on 2026-08-18, and repairing one would have left the
  // other reading as authoritative. Which objects have a row HERE is that document's own decision,
  // stated above its table, so a shorter block than the one above is by design rather than drift.
  {
    claim: "ERROR_MESSAGES in reference/utilities.md",
    source: { file: MESSAGES, symbol: "ERROR_MESSAGES" },
    document: {
      document: UTILITIES,
      from: "| `ERROR_MESSAGES`",
      to: "| `SUCCESS_MESSAGES`",
      states: "code-spans",
    },
  },
  {
    claim: "SUCCESS_MESSAGES in reference/utilities.md",
    source: { file: MESSAGES, symbol: "SUCCESS_MESSAGES" },
    document: {
      document: UTILITIES,
      from: "| `SUCCESS_MESSAGES`",
      to: "| `STATUS_MESSAGES`",
      states: "code-spans",
    },
  },
  {
    claim: "STATUS_MESSAGES in reference/utilities.md",
    source: { file: MESSAGES, symbol: "STATUS_MESSAGES" },
    document: {
      document: UTILITIES,
      from: "| `STATUS_MESSAGES`",
      to: "| `INFO_MESSAGES`",
      states: "code-spans",
    },
  },
  {
    claim: "INFO_MESSAGES in reference/utilities.md",
    source: { file: MESSAGES, symbol: "INFO_MESSAGES" },
    document: {
      document: UTILITIES,
      from: "| `INFO_MESSAGES`",
      to: "| `SHARED_CONFIG_APPLY`",
      states: "code-spans",
    },
  },
  {
    claim: "SHARED_CONFIG_APPLY in reference/utilities.md",
    source: { file: MESSAGES, symbol: "SHARED_CONFIG_APPLY" },
    document: {
      document: UTILITIES,
      from: "| `SHARED_CONFIG_APPLY`",
      to: "| `UNINSTALL_PLAN`",
      states: "code-spans",
    },
  },
  {
    claim: "UNINSTALL_PLAN in reference/utilities.md",
    source: { file: MESSAGES, symbol: "UNINSTALL_PLAN" },
    document: {
      document: UTILITIES,
      from: "| `UNINSTALL_PLAN`",
      to: "**The two `GLOBAL_*` headings",
      states: "code-spans",
    },
  },

  // `consts.ts` and `exit-codes.ts` — the leaf constants every other layer reads. Each of these
  // objects is stated in exactly one document, so unlike the message objects above there is no
  // second copy to keep in step; the row exists because a key added to a constant object is the
  // same one-line edit in a file no documentation pass opens.
  {
    claim: "EXIT_CODES in reference/utilities.md",
    source: { file: EXIT_CODES_FILE, symbol: "EXIT_CODES" },
    document: {
      document: UTILITIES,
      from: "| `EXIT_CODES` key",
      to: "## Error Handling",
      states: "table-rows",
    },
  },
  {
    // Keyed without the `STANDARD_FILES.` prefix the table used to carry. `table-rows` reads the
    // whole first cell, and `code-spans` matches a backticked name to its closing backtick — so a
    // qualified cell is unreadable to both, and the prefix was what hid `PACKAGE_JSON`.
    claim: "STANDARD_FILES in reference/utilities.md",
    source: { file: COMPILE_PATHS, symbol: "STANDARD_FILES" },
    document: {
      document: UTILITIES,
      from: "readable as an enumeration — bound to source",
      to: "`METADATA_YAML` and `AGENT_METADATA_YAML` are deliberately",
      states: "table-rows",
    },
  },
  {
    // Read as PAIRS, and the cheapest of the tables the 2026-08-19 survey looked at: the
    // document's Value column already stated what every member holds, so the binding tightened
    // with no document edit at all. Its neighbours above and below are keys-only for reasons in
    // the SOURCE — `STANDARD_FILES` binds `METADATA_YAML`, `AGENT_METADATA_YAML` and `PLUGIN_JSON`
    // to `METADATA_YAML_FILE` / `PLUGIN_MANIFEST_FILE`, and `DIRS` binds `skills` to
    // `SKILLS_DIR_PATH` — an identifier is a value `valueOf` refuses to guess at rather than read.
    claim: "STANDARD_DIRS in reference/utilities.md",
    source: { file: COMPILE_PATHS, entries: "STANDARD_DIRS" },
    document: {
      document: UTILITIES,
      from: "`STANDARD_DIRS` constant, same convention:",
      to: "### Branding and Naming",
      states: "table-pairs",
      keyColumn: "Key",
      valueColumn: "Value",
    },
  },
  {
    claim: "DIRS in reference/utilities.md",
    source: { file: COMPILE_PATHS, symbol: "DIRS" },
    document: {
      document: UTILITIES,
      from: "`DIRS` object:",
      to: "### Standard Files and Dirs",
      states: "table-rows",
    },
  },
  {
    // Lower-case camelCase keys, so `code-spans` cannot see them and the table form is the only
    // one a row can be written against.
    claim: "SCHEMA_PATHS in reference/utilities.md",
    source: { file: CONSTS, symbol: "SCHEMA_PATHS" },
    document: {
      document: UTILITIES,
      from: "`SCHEMA_PATHS` object. Full",
      to: "Helper: `yamlSchemaComment(schemaPath: string)",
      states: "table-rows",
    },
  },
  {
    // The `to` stops before the glyph-sharing sentence: `CHECK_GLYPH` and `EN_DASH_GLYPH` are
    // module-private and are not members, so a section reaching them would report two names the
    // source does not hold.
    claim: "UI_SYMBOLS in reference/utilities.md",
    source: { file: CONSTS, symbol: "UI_SYMBOLS" },
    document: {
      document: UTILITIES,
      from: "The members of `UI_SYMBOLS`, exhaustive and in source order:",
      to: "Two key pairs share one glyph",
      states: "code-spans",
    },
  },
  {
    claim: "CLI_COLORS in reference/utilities.md",
    source: { file: CONSTS, symbol: "CLI_COLORS" },
    document: {
      document: UTILITIES,
      from: "The keys of `CLI_COLORS`, exhaustive and in source order:",
      to: "The keys of `SCROLL_VIEWPORT`",
      states: "code-spans",
    },
  },
  {
    claim: "SCROLL_VIEWPORT in reference/utilities.md",
    source: { file: CONSTS, symbol: "SCROLL_VIEWPORT" },
    document: {
      document: UTILITIES,
      from: "The keys of `SCROLL_VIEWPORT`, exhaustive and in source order",
      to: "#### Terminal-height constants",
      states: "code-spans",
    },
  },

  // The one generated union a document enumerates member by member. `SKILL_IDS`, `SKILL_SLUGS`,
  // `CATEGORIES` and `DOMAINS` are all readable now that `unwrap` reads through `satisfies`, and
  // none of the four is registerable for a second reason that the widening does not touch: no
  // document names their members. `type-system.md` owns the four SIZES and states them as a counts
  // table, which is a claim about quantity rather than the membership list a row judges, and a
  // table with a row per skill is not a thing to author so that one can be written.
  // The two tuning arrays. Stated member per row rather than as one comma list, because
  // `code-spans` only matches CONSTANT-shaped backticked names and every member of both is
  // lower-case — a one-cell list is unreadable to both readers, which is how `fable` sat missing
  // from five documents at once. `seedModelSchema` / `seedEffortSchema` are the wire-side twins and
  // are NOT registerable: they are `z.enum([...])` call expressions, and `membersOfSymbol` reads
  // object, array and union literals only, so a row naming either would throw rather than judge.
  {
    claim: "MODEL_NAMES in reference/features/model-and-effort.md",
    source: { file: MATRIX_TYPES, symbol: "MODEL_NAMES" },
    document: {
      document: MODEL_AND_EFFORT,
      from: "The members of `MODEL_NAMES` (`ModelName`), exhaustive and in source order:",
      to: "The members of `EFFORT_NAMES`",
      states: "table-rows",
    },
  },
  {
    claim: "EFFORT_NAMES in reference/features/model-and-effort.md",
    source: { file: MATRIX_TYPES, symbol: "EFFORT_NAMES" },
    document: {
      document: MODEL_AND_EFFORT,
      from: "The members of `EFFORT_NAMES` (`EffortLevel`), exhaustive and in source order:",
      to: "`ultra` is not a member",
      states: "table-rows",
    },
  },

  {
    // The one enumeration a document states as several tables. `zod-schemas.md` partitions the 34
    // exported schemas across four — Bridge, Loader, Structural, Strict — under a paragraph reading
    // "the four tables below partition them exactly", and maintains a total beside them. The total
    // is a claim about quantity and the partition is the membership, so the sub-lists were the half
    // nothing re-derived: the document's own instruction is to re-derive all five in one pass,
    // which is the instruction a checker exists to replace.
    //
    // Keyed on `Schema`, because the `#### Why slugs and categories are strict` table stands between
    // the first two and is keyed `Union`. Its four rows are type names, not schemas — read as
    // members they would report four names `schemas.ts` does not export.
    claim: "the exported schemas of lib/schemas.ts in reference/types/zod-schemas.md",
    source: { file: SCHEMAS, exports: "const" },
    document: {
      document: ZOD_SCHEMAS,
      from: "### Bridge Schemas (union type validation)",
      to: "### Module-Internal Schemas (not exported)",
      states: "partitioned-tables",
      column: "Schema",
    },
  },

  {
    claim: "AGENT_NAMES in reference/type-system.md",
    source: { file: SOURCE_TYPES, symbol: "AGENT_NAMES" },
    document: {
      document: TYPE_SYSTEM,
      from: "`AGENT_NAMES` in full — exhaustive, in source order:",
      to: "There is **one** `reviewer`",
      states: "table-rows",
    },
  },

  // The config area's module export lists. Four modules, seven rows, because three of the four
  // are enumerated in TWO documents apiece — the `config/` deep-dive and the `features/` overview each
  // carry the same table, which is the "two writable copies" condition, so both are bound. The
  // 2026-08-18 pass found `config-types-writer.ts`'s pair naming five of its eight exports (no
  // `assembleConfigTypesSource`, `deriveCategories` or `deriveDomains`) and `scope-predicates.ts`
  // naming seven of eight (no `activeAgentNames`, which the emitted `SelectedAgentName` union
  // reads). Both were introduced with the word "exhaustively".
  //
  // Four neighbouring lists in the same area are NOT registrable, and each fails at a guard this
  // checker means to fail at rather than skip:
  //   - `ProjectConfig` (`src/cli/types/config.ts`) is a type alias to an object TYPE LITERAL, and
  //     `membersOfSymbol` reads object literals, array literals and unions only — so its
  //     seventeen-field table in `features/configuration.md` stays hand-derived.
  //   - `CANONICAL_FIELD_ORDER` in `config-writer.ts` reads fine now that `unwrap` reads through
  //     `satisfies`, and no document names its eleven fields. The nearest is the seventeen-field
  //     `ProjectConfig` block above — a different symbol, a superset, and a fenced TypeScript block
  //     rather than spans or rows.
  //   - `EXTRACTED_FIELDS` is `new Set([...])` — a call expression, not a literal.
  //   - `SCHEMA_ENTRIES` (`scripts/generate-json-schemas.ts`) is an array of OBJECT literals, so
  //     `stringsOf` refuses it as a member no reader can name. `code-generation.md` owns that count
  //     by hand, and its `src/schemas/` file list is a directory listing rather than a symbol.
  {
    claim:
      "the exported functions of configuration/config-writer.ts in reference/config/config-writer.md",
    source: { file: CONFIG_WRITER, exports: "function" },
    document: {
      document: CONFIG_WRITER_DOC,
      from: "Every function below returns a TypeScript source string",
      to: "`generateConfigSource` is import-restricted",
      states: "table-rows",
    },
  },
  {
    claim:
      "the exported functions of configuration/config-writer.ts in reference/features/configuration.md",
    source: { file: CONFIG_WRITER, exports: "function" },
    document: {
      document: CONFIGURATION_DOC,
      from: "**Renders only — writes nothing** since the config-gate landed.",
      to: "The `generateConfigSource()` function accepts an optional",
      states: "table-rows",
    },
  },
  {
    claim:
      "the exported functions of configuration/config-types-writer.ts in reference/config/config-writer.md",
    source: { file: CONFIG_TYPES_WRITER, exports: "function" },
    document: {
      document: CONFIG_WRITER_DOC,
      from: "This document owns the list.",
      to: "`deriveCategories` / `deriveDomains` are exported for",
      states: "table-rows",
    },
  },
  {
    claim:
      "the exported functions of configuration/config-types-writer.ts in reference/features/configuration.md",
    source: { file: CONFIG_TYPES_WRITER, exports: "function" },
    document: {
      document: CONFIGURATION_DOC,
      from: "both are bound to the module by `scripts/check-enumeration-drift.ts`:",
      to: "When a global installation exists,",
      states: "table-rows",
    },
  },
  {
    claim:
      "the exported functions of configuration/config-generator.ts in reference/config/scope-split.md",
    source: { file: CONFIG_GENERATOR, exports: "function" },
    document: {
      document: SCOPE_SPLIT_DOC,
      from: "so a seventh export cannot land without this table naming it:",
      to: "Only `generateProjectConfigFromSkills` and `buildStackProperty`",
      states: "table-rows",
    },
  },
  {
    claim:
      "the exported functions of configuration/scope-predicates.ts in reference/features/configuration.md",
    source: { file: SCOPE_PREDICATES, exports: "function" },
    document: {
      document: CONFIGURATION_DOC,
      from: "Eight exported functions, exhaustively — bound to the module by",
      to: "`ScopedEntry` is the shared",
      states: "table-rows",
    },
  },
  {
    // The same export list, tabulated a second time in the document that explains the scope
    // system. Duplication across documents is allowed (owner ruling 2026-08-20) and the checker
    // watches both — which is what a row per document is for, the way `STEP_TEXT` is registered
    // twice above. Bound as its own row rather than as a field on the one above because each copy
    // is separately wrong: the ninth export would have reddened the owner's table alone and left
    // this one reading as authoritative and short by one, which is the mis-report failure this
    // whole file exists to refuse.
    claim:
      "the exported functions of configuration/scope-predicates.ts in reference/concepts/scope-system.md",
    source: { file: SCOPE_PREDICATES, exports: "function" },
    document: {
      document: SCOPE_SYSTEM_DOC,
      from: "**`ScopedEntry`** is the shared shape every predicate accepts",
      to: "The full export list is",
      states: "table-rows",
    },
  },
  // The test-support side. `reference/testing/factories.md` OWNS the factory, helper and assertion
  // counts, and on 2026-08-18 all three were wrong in both directions at once: it named
  // `createImportSource`, deleted from `disk-writers.ts`, and had never named the seven exports of
  // `helpers/journey-page.ts` or `renderUnparseableMetadataYaml`.
  //
  // Its three tables state what each DIRECTORY exports — "a symbol absent from it is not exported
  // from that directory" — which is why they were unbindable while a row named one file. The
  // barrels are not the claim and binding them would be wrong in both directions: `factories/`
  // re-exports 37 of the 45 the table names, so eight real members would read as drift. Reading the
  // directory is what the sentence says, and `helpers/` proves the difference — its table names
  // `extractNamedSection` and `extractScopeSections`, which no barrel re-exports.
  //
  // `helpers/` is the third of these and the last to be bound. Its precondition was the three
  // `cli-runner.ts` refusals — `parseRefusal`, `missingArgsRefusal` and `argOptionRefusal` — which
  // the table named none of while the row was being written for it; the table carries all three
  // now, so the directory is readable against it rather than guaranteed to report them.
  {
    claim: "the exported values of __tests__/factories/ in reference/testing/factories.md",
    source: { directory: TEST_FACTORIES_DIR, enumerates: "exported-values" },
    document: {
      document: TESTING_FACTORIES,
      from: 'Barrel import: `import { createMockSkill, buildProjectConfig } from "../__tests__/factories/index.js"`',
      to: "**`createTestSkill()` / `createMockSkill()` taxonomy contract:**",
      states: "table-rows",
    },
  },
  {
    claim: "the exported values of __tests__/helpers/ in reference/testing/factories.md",
    source: { directory: TEST_HELPERS_DIR, enumerates: "exported-values" },
    document: {
      document: TESTING_FACTORIES,
      from: 'Barrel import: `import { runCliCommand, writeTestSkill } from "../__tests__/helpers/index.js"`',
      to: "## Assertion Helpers (`src/cli/lib/__tests__/assertions/`)",
      states: "table-rows",
    },
  },
  {
    claim: "the exported values of __tests__/assertions/ in reference/testing/factories.md",
    source: { directory: TEST_ASSERTIONS_DIR, enumerates: "exported-values" },
    document: {
      document: TESTING_FACTORIES,
      from: "## Assertion Helpers (`src/cli/lib/__tests__/assertions/`)",
      to: "## FS Utilities",
      states: "table-rows",
    },
  },
  {
    claim:
      "the content generators of __tests__/content-generators.ts in reference/testing/factories.md",
    source: { file: CONTENT_GENERATORS, exports: "function" },
    document: {
      document: TESTING_FACTORIES,
      from: "no other function is exported from that module, and `scripts/check-enumeration-drift.ts` holds the row that keeps it so:",
      to: "**`renderMetadataYaml()` contract:**",
      states: "table-rows",
    },
  },
  {
    claim: "the fs utilities of __tests__/test-fs-utils.ts in reference/testing/factories.md",
    source: { file: TEST_FS_UTILS, exports: "function" },
    document: {
      document: TESTING_FACTORIES,
      from: "Exhaustive — nothing else is exported from that module, and",
      to: "## Expected Values",
      states: "table-rows",
    },
  },
  {
    // The registry every unit spec picks its skills from, keyed `Record<string, ResolvedSkill>` —
    // so nothing about the declaration is exhaustive and the table was the only statement of what
    // it holds. It named ten of eleven on 2026-08-18, missing `authSecurity`: a spec author reads
    // the table, does not find a shared-domain skill, and writes a `createMockSkill` call beside a
    // canonical entry that was already there. That is the short-list failure exactly.
    claim: "SKILLS in reference/testing/mock-data.md",
    source: { file: TEST_FIXTURES, symbol: "SKILLS" },
    document: {
      document: MOCK_DATA,
      from: "Every key, bound to `SKILLS` in `src/cli/lib/__tests__/test-fixtures.ts` by `scripts/check-enumeration-drift.ts`:",
      to: "### TEST_CATEGORIES",
      states: "table-rows",
    },
  },
  {
    // The `mock-data/` inventories the same document keeps, each re-derived member-for-member on
    // 2026-08-23 and none of them held by anything before this — which is the cheapest moment to
    // bind a list and the only one where the row costs nothing, since a row that arrives green is
    // evidence the list is right rather than a repair disguised as a gate. The sibling lists in the
    // same document rotted and were deleted; these are named rather than deleted because each line
    // states something the export name does not, and the document says so where it stands.
    //
    // `code-spans` rather than `table-rows`: the document writes these as bullet lists, and a
    // bullet naming two constants that share one sentence is a member each. Bound to the whole
    // `const` export list rather than to a symbol, so a constant ADDED to the module is a drift
    // report here — the short-list failure that sends a reader off to write a duplicate.
    claim: "the exported constants of mock-data/mock-agents.ts in reference/testing/mock-data.md",
    source: { file: MOCK_AGENTS, exports: "const" },
    document: {
      document: MOCK_DATA,
      from: "### mock-agents.ts",
      to: "### mock-categories.ts",
      states: "code-spans",
    },
  },
  {
    claim:
      "the exported constants of mock-data/mock-categories.ts in reference/testing/mock-data.md",
    source: { file: MOCK_CATEGORIES, exports: "const" },
    document: {
      document: MOCK_DATA,
      from: "### mock-categories.ts",
      to: "### mock-matrices.ts",
      states: "code-spans",
    },
  },
  {
    claim: "the exported constants of mock-data/mock-sources.ts in reference/testing/mock-data.md",
    source: { file: MOCK_SOURCES, exports: "const" },
    document: {
      document: MOCK_DATA,
      from: "### mock-sources.ts",
      to: "### mock-stacks.ts",
      states: "code-spans",
    },
  },
  {
    // The last section of its document, so the closing paragraph is the marker — written for this
    // row, because a section with nothing after it has no end and `sectionOf` would read to the end
    // of the file. It states the one thing these rows do not cover: they read `const` exports, so a
    // function or a type added to one of these modules is a member no row here can see.
    claim:
      "the exported constants of mock-data/mock-source-files.ts in reference/testing/mock-data.md",
    source: { file: MOCK_SOURCE_FILES, exports: "const" },
    document: {
      document: MOCK_DATA,
      from: "### mock-source-files.ts",
      to: "**Each bound row reads",
      states: "code-spans",
    },
  },
  {
    // The titles the fixture writes into each `metadata.yaml`, which ARE the strings the wizard
    // paints and every label assertion matches on. `satisfies Record<E2ESkillSlug, string>` is
    // total over the fixture's own slug set, so `tsc` holds the map to `E2E_SKILLS` — what nothing
    // held was the document, and an eleventh fixture skill would have left the table at ten while
    // the spec that needed its label re-typed the string.
    //
    // Read as PAIRS, and this is the row that proved why: bound as `table-rows` it answered
    // `agrees, members: 10` and reported the run clean on 2026-08-19 while five of the document's
    // Display-title cells were wrong, because the slugs — the only column either half of the check
    // could reach — were right. The titles are what the suite matches on and the slugs are not, so
    // a keys-only binding covered the half that cannot break. The document's middle column stays
    // unbound on purpose: it states bare ids, which are namespaced at runtime and are `E2E_SKILLS`'
    // business rather than this map's.
    claim: "E2E_SKILL_TITLES in reference/testing/e2e-infrastructure.md",
    source: { file: CREATE_E2E_SOURCE, entries: "E2E_SKILL_TITLES" },
    document: {
      document: E2E_INFRASTRUCTURE,
      from: "all 10 entries, bound to source by `scripts/check-enumeration-drift.ts`:",
      to: "**Keyed by slug for two reasons",
      states: "table-pairs",
      keyColumn: "Slug",
      valueColumn: "Display title",
    },
  },
  {
    // The E2E helper module's own export surface, in three rows rather than one, because the
    // document states it as three tables and each needs a reader of its own — a single table
    // mixing the kinds could bind to none of them. No marker names a count on purpose: a sixth
    // constant or a thirty-fifth function moves its own table and leaves this file untouched.
    //
    // The third of them, the 31 re-exports, is what `reexports: "every-name"` was added for, and
    // it is the one neither neighbouring reader can answer: `exports` reads DECLARATIONS and skips
    // every `export { … }`, while `reexportedNames` — reachable only through the directory reader
    // — returns nothing for a bare block with no `moduleSpecifier`, the form thirteen of the
    // thirty-one are written in, and drops the type-only re-exports that are seven more.
    // `reexportSurfaceOf` reads each export clause's own spelling and follows no specifier, so all
    // three forms are members and the bare block's names answer as written.
    //
    // The document's fourth table is deliberately unbound and says so where it stands: it names
    // the two type aliases this module DECLARES, and no reader enumerates those — `exportedNames`
    // answers consts and functions only, and a row naming one alias would reach an object type
    // literal that `membersOfSymbol` enumerates nothing from.
    claim:
      "the exported constants of e2e/helpers/test-utils.ts in reference/testing/e2e-infrastructure.md",
    source: { file: TEST_UTILS, exports: "const" },
    document: {
      document: E2E_INFRASTRUCTURE,
      from: "binds this table to the module's constant exports",
      to: "### Functions declared here",
      states: "table-rows",
    },
  },
  {
    claim:
      "the exported functions of e2e/helpers/test-utils.ts in reference/testing/e2e-infrastructure.md",
    source: { file: TEST_UTILS, exports: "function" },
    document: {
      document: E2E_INFRASTRUCTURE,
      from: "binds this table to the module's function exports",
      to: "### Types declared here",
      states: "table-rows",
    },
  },
  {
    claim: "the re-exports of e2e/helpers/test-utils.ts in reference/testing/e2e-infrastructure.md",
    source: { file: TEST_UTILS, reexports: "every-name" },
    document: {
      document: E2E_INFRASTRUCTURE,
      from: "binds this table to the module's re-exports",
      to: "## Scope & HOME model",
      states: "table-rows",
    },
  },
  // Five of the nine constant objects `e2e/pages/constants.ts` exports, against the quick-reference
  // that states each as a prose list. `STEP_TEXT` is registered above against both documents that
  // carry it; these are its neighbours, and a spec reaching for a sentinel the list omits writes a
  // literal instead — which is how `FILES.MARKETPLACE_JSON` acquired stragglers.
  {
    claim: "DIRS in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "DIRS" },
    document: {
      document: E2E_README,
      from: "**Directories (`DIRS`):**",
      to: "**Files (`FILES`)",
      states: "code-spans",
    },
  },
  {
    claim: "FILES in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "FILES" },
    document: {
      document: E2E_README,
      // Anchored WITHOUT a count. It carried "— all 12" until 2026-08-23, which made a prose
      // number load-bearing shell for this row: a 13th member reddens the members check
      // below, and whoever then corrected the prose to "all 13" broke this anchor and
      // reddened a SECOND row for an unrelated-looking reason. The members check is what
      // states exhaustiveness; the sentence does not need to say it twice.
      from: "**Files (`FILES`)**",
      to: "**Step text (`STEP_TEXT`)",
      states: "code-spans",
    },
  },
  {
    claim: "TIMEOUTS in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "TIMEOUTS" },
    document: {
      document: E2E_README,
      from: "**Timeouts (`TIMEOUTS`):**",
      to: "`WIZARD_LOAD` was raised",
      states: "code-spans",
    },
  },
  {
    claim: "EXIT_CODES in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "EXIT_CODES" },
    document: {
      document: E2E_README,
      from: "**Exit codes (`EXIT_CODES`):**",
      to: "**Terminal geometry (`TERMINAL_SIZE`):**",
      states: "code-spans",
    },
  },
  {
    claim: "SOURCE_PATHS in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "SOURCE_PATHS" },
    document: {
      document: E2E_README,
      from: "**Source paths (`SOURCE_PATHS`):**",
      to: "These are paths within",
      states: "code-spans",
    },
  },

  // The wizard and terminal-UI area. Every row below replaces a hand-checked list that had drifted
  // in the naming direction: `component-patterns.md` was tabulating `HOTKEY_SETTINGS` and
  // `HOTKEY_ADD_SOURCE`, neither of which exists anywhere in the tree, under a sentence reading "no
  // other `HOTKEY_*` constants exist"; `wizard/state-transitions.md` named a `DiffRowStatus` member
  // `source-changed` that the union has never held. Both are the mis-report failure — a reader greps,
  // finds nothing, and stops trusting the document.
  //
  // Three neighbouring wizard lists are NOT registrable, each at a guard this checker means to fail
  // at rather than skip. They stay hand-derived and say so where they appear:
  //   - `WizardState` is a type alias to an object TYPE LITERAL, so `membersOfSymbol` — object
  //     literals, array literals and unions only — enumerates nothing from it. The store-field
  //     tables in `store-map.md` therefore cannot be bound, the same limitation `ProjectConfig` hits.
  //   - The `hotkeys.ts` bindings are stated across several tables in two documents (registry list,
  //     global-hotkey mapping, per-step mapping); a row binds ONE delimited section, so the export
  //     list is registered once in the document that owns it and the mapping tables link to it.
  //   - The component, hook and step-file inventories in `component-patterns.md` are DIRECTORY
  //     listings, not symbols. A row names one source file; there is no source expression whose
  //     members are "the files under `src/cli/components/wizard/`".
  {
    // The module's whole const export list, which is what makes "is there a hotkey for X" answerable
    // by reading the table instead of grepping for a constant that may never have existed.
    claim:
      "the exported constants of components/wizard/hotkeys.ts in reference/component-patterns.md",
    source: { file: HOTKEYS, exports: "const" },
    document: {
      document: COMPONENT_PATTERNS,
      from: "it is bound to `hotkeys.ts` by `scripts/check-enumeration-drift.ts`, so a constant added or withdrawn cannot leave the table behind.",
      to: "Four character hotkeys, and each is bound",
      states: "table-rows",
    },
  },
  {
    claim:
      "the exported functions of components/wizard/hotkeys.ts in reference/component-patterns.md",
    source: { file: HOTKEYS, exports: "function" },
    document: {
      document: COMPONENT_PATTERNS,
      from: "**Helpers — the module exports exactly two functions, and this table is bound to that export list by `scripts/check-enumeration-drift.ts`:**",
      to: "**Why `isInfoPanelAvailable` excludes the confirm step.**",
      states: "table-rows",
    },
  },
  {
    // Second writable copies of two lists `reference/utilities.md` already owns and is bound to.
    // Registering both is what stops one being repaired while the other reads as authoritative —
    // the same reasoning as the `messages.ts` objects above.
    // Of the two, only this one carries a Value column, so only this one can be read as pairs —
    // `reference/utilities.md` states the same list as prose keys and stays `code-spans`. The hex
    // is the whole of what a colour constant IS, and it was the half nothing read: the document
    // wrote every one of them in double quotes (`"#99FFFF"`) where the source holds the bare hex,
    // so binding the values first required un-quoting the table.
    claim: "CLI_COLORS in reference/component-patterns.md",
    source: { file: CONSTS, entries: "CLI_COLORS" },
    document: {
      document: COMPONENT_PATTERNS,
      from: "## Color Constants (CLI_COLORS in `src/cli/consts.ts`)",
      to: "## UI Symbols (UI_SYMBOLS in",
      states: "table-pairs",
      keyColumn: "Constant",
      valueColumn: "Value",
    },
  },
  {
    claim: "UI_SYMBOLS in reference/component-patterns.md",
    source: { file: CONSTS, symbol: "UI_SYMBOLS" },
    document: {
      document: COMPONENT_PATTERNS,
      from: "## UI Symbols (UI_SYMBOLS in `src/cli/consts.ts`)",
      to: "## SelectList Component",
      states: "table-rows",
    },
  },
  {
    claim: "SCROLL_VIEWPORT in reference/component-patterns.md",
    source: { file: CONSTS, symbol: "SCROLL_VIEWPORT" },
    document: {
      document: COMPONENT_PATTERNS,
      from: "Shared constants live in `SCROLL_VIEWPORT` in `src/cli/consts.ts` — all four keys, bound to source by `scripts/check-enumeration-drift.ts`:",
      to: "The minimum terminal size is **not** in this block.",
      states: "table-rows",
    },
  },
  {
    // Module-private, which `declarationOf` reads anyway — it walks variable statements without
    // checking for an export modifier. The three strings are asserted verbatim by E2E specs, so a
    // fourth guard landing unnamed is a guard no spec knows to wait for.
    claim: "TOAST_MESSAGES in reference/store-map.md",
    source: { file: WIZARD_STORE, symbol: "TOAST_MESSAGES" },
    document: {
      document: STORE_MAP,
      from: "Bound to source by `scripts/check-enumeration-drift.ts`, so a fourth guard cannot land without a row here. E2E asserts the strings verbatim:",
      to: "## State Reset",
      states: "table-rows",
    },
  },
  {
    claim: "WizardStep in reference/wizard/state-transitions.md",
    source: { file: WIZARD_STORE, symbol: "WizardStep" },
    document: {
      document: STATE_TRANSITIONS,
      from: "A seventh step cannot land without a row here:",
      to: "The tab labels are `WIZARD_STEP_LABELS`",
      states: "table-rows",
    },
  },
  {
    // The same table, bound a second time to the CONSTANT the document names as its source of
    // truth. Not a duplicate row: `as const satisfies readonly WizardStep[]` constrains what the
    // array may hold and not that it holds everything, so a step added to the union and to this
    // table but never to `WIZARD_STEP_ORDER` compiles, renders no tab, and passes the row above.
    // `WIZARD_STEP_LABELS` in `wizard-tabs.tsx` is the third list of the same six and is NOT
    // registered: `satisfies Record<WizardStep, string>` is total over the union, so `tsc` already
    // refuses a step with no label and a row would repeat a check that cannot fail.
    claim: "WIZARD_STEP_ORDER in reference/wizard/state-transitions.md",
    source: { file: WIZARD_STORE, symbol: "WIZARD_STEP_ORDER" },
    document: {
      document: STATE_TRANSITIONS,
      from: "A seventh step cannot land without a row here:",
      to: "The tab labels are `WIZARD_STEP_LABELS`",
      states: "table-rows",
    },
  },
  {
    // Lower-case keys, so `code-spans` cannot see them and the table form is the only readable one.
    claim: "DOMAIN_AGENTS in reference/wizard/state-transitions.md",
    source: { file: WIZARD_STORE, symbol: "DOMAIN_AGENTS" },
    document: {
      document: STATE_TRANSITIONS,
      from: "Every key, bound to `DOMAIN_AGENTS` by `scripts/check-enumeration-drift.ts`:",
      to: "Every domain rosters the cross-domain",
      states: "table-rows",
    },
  },
  {
    claim:
      "the exported functions of lib/wizard/scope-diff.ts in reference/features/wizard-flow.md",
    source: { file: SCOPE_DIFF, exports: "function" },
    document: {
      document: WIZARD_FLOW,
      from: "Bound to `src/cli/lib/wizard/scope-diff.ts` by `scripts/check-enumeration-drift.ts`, so a sixth cannot land without a row here:",
      to: "**`DiffRowStatus` — all four members**",
      states: "table-rows",
    },
  },
  {
    claim: "DiffRowStatus in reference/features/wizard-flow.md",
    source: { file: SCOPE_DIFF, symbol: "DiffRowStatus" },
    document: {
      document: WIZARD_FLOW,
      from: "bound to the union in `scope-diff.ts` by `scripts/check-enumeration-drift.ts`. There is no `source-changed` member and there never was; the yellow `~` marker is `mode-changed`.",
      to: "`AgentDiffRow.status` is",
      states: "table-rows",
    },
  },
];

export function check({
  packageRoot = PACKAGE_ROOT,
  registry = REGISTRY,
}: { packageRoot?: string | undefined; registry?: RegistryEntry[] | undefined } = {}): CheckResult {
  const verdicts = registry.map((entry) => judgeEntry(packageRoot, entry));

  return { clean: verdicts.every((verdict) => verdict.outcome !== "drifted"), verdicts };
}

function judgeEntry(packageRoot: string, entry: RegistryEntry): EnumerationVerdict {
  const held = readSource(packageRoot, entry);
  const named = readDocument(packageRoot, entry);

  const namedButAbsent = named.filter((member) => !held.includes(member));
  const presentButUnnamed = held.filter((member) => !named.includes(member));

  if (namedButAbsent.length === 0 && presentButUnnamed.length === 0) {
    return { claim: entry.claim, outcome: "agrees", members: held.length };
  }

  return { claim: entry.claim, outcome: "drifted", namedButAbsent, presentButUnnamed };
}

function readSource(packageRoot: string, { claim, source }: RegistryEntry): string[] {
  const members =
    "directory" in source
      ? membersOfDirectory(packageRoot, source, claim)
      : membersOfFile(packageRoot, source, claim);

  if (members.length === 0) throw refusal(claim, SOURCE_ENUMERATES_NOTHING, subjectOf(source));

  return members;
}

function membersOfFile(
  packageRoot: string,
  source: Extract<SourceEnumeration, { file: string }>,
  claim: string,
): string[] {
  const filePath = path.join(packageRoot, source.file);
  if (!existsSync(filePath)) throw refusal(claim, NO_SOURCE_FILE, source.file);

  const file = parseModule(filePath);

  if ("symbol" in source) return membersOfSymbol(file, source.symbol, claim);
  if ("entries" in source) return entriesOfSymbol(file, source.entries, claim);
  if ("reexports" in source) return reexportSurfaceOf(file, claim, source.file);

  return exportedNames(file, source.exports);
}

/**
 * Every name a module RE-EXPORTS — the identity a consumer imports from it and did not write there.
 *
 * **The design question this shape turns on is what a locally-imported-then-re-exported name
 * resolves to, and the answer is: the export clause's own spelling, with nothing followed to reach
 * it.** A document stating this surface is a list of what a spec writes in its import statement,
 * and the origin module is prose in the row beside it — so `export { a as b }` answers `b`, and a
 * bare block's names answer exactly as they are written whether their origin is one hop away or
 * five. No `moduleSpecifier` is resolved, which is why a form the existing reader returns nothing
 * for is readable here at all.
 *
 * The module's IMPORTS are read for one purpose, and it is the refusal: a bare block can hand on a
 * name the module DECLARED, and such a declaration carries no export modifier, so `exports:
 * "function"` cannot see it either. That name would fall through both readers and be reported by
 * neither — the silent under-report this file refuses everywhere else, and the reason a bare block
 * is not simply read as a list of names.
 */
function reexportSurfaceOf(file: ts.SourceFile, claim: string, module: string): string[] {
  const bound = importedNamesIn(file);

  return file.statements.flatMap((statement) => reexportsIn(statement, bound, claim, module));
}

function reexportsIn(
  statement: ts.Statement,
  bound: Set<string>,
  claim: string,
  module: string,
): string[] {
  if (!ts.isExportDeclaration(statement)) return [];

  const { exportClause, moduleSpecifier } = statement;
  if (exportClause === undefined || !ts.isNamedExports(exportClause)) {
    throw refusal(claim, WHOLE_MODULE_REEXPORT, module);
  }
  if (moduleSpecifier !== undefined)
    return exportClause.elements.map((element) => element.name.text);

  const declared = exportClause.elements
    .map((element) => (element.propertyName ?? element.name).text)
    .filter((local) => !bound.has(local));
  if (declared.length > 0) {
    throw refusal(claim, REEXPORTS_A_DECLARATION, `${declared.join(", ")} in ${module}`);
  }

  return exportClause.elements.map((element) => element.name.text);
}

/** Every local name an import statement binds — default, namespace and named alike, types included. */
function importedNamesIn(file: ts.SourceFile): Set<string> {
  return new Set(file.statements.flatMap(importedNamesOf));
}

function importedNamesOf(statement: ts.Statement): string[] {
  if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) return [];

  const { name, namedBindings } = statement.importClause;
  const defaultName = name === undefined ? [] : [name.text];
  if (namedBindings === undefined) return defaultName;

  return ts.isNamespaceImport(namedBindings)
    ? [...defaultName, namedBindings.name.text]
    : [...defaultName, ...namedBindings.elements.map((element) => element.name.text)];
}

/**
 * What a directory holds: every value its modules export, or the command id each module defines.
 *
 * A spec beside a module is neither — it exports test scaffolding and oclif's pattern strategy runs
 * over compiled command modules alone — so both readers walk the same filtered tree.
 */
function membersOfDirectory(
  packageRoot: string,
  source: { directory: string; enumerates: "exported-values" | "command-ids" },
  claim: string,
): string[] {
  const directoryPath = path.join(packageRoot, source.directory);
  if (!existsSync(directoryPath)) throw refusal(claim, NO_SOURCE_DIRECTORY, source.directory);

  const modules = modulesUnder(directoryPath);

  if (source.enumerates === "command-ids") return modules.map(commandIdOf);

  return [...new Set(modules.flatMap((module) => exportedValuesOf(directoryPath, module, claim)))];
}

/** Every module under a directory, deepest last, as paths relative to it. */
function modulesUnder(directoryPath: string, prefix = ""): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      return modulesUnder(path.join(directoryPath, entry.name), relativePath);
    }

    return isModule(entry.name) ? [relativePath] : [];
  });
}

function isModule(name: string): boolean {
  return (
    MODULE_EXTENSIONS.some((extension) => name.endsWith(extension)) &&
    !SPEC_SUFFIXES.some((suffix) => name.endsWith(suffix))
  );
}

/** The id oclif's pattern strategy gives a command module: its path under the tree, extension off. */
function commandIdOf(module: string): string {
  const withoutExtension = module.replace(/\.[^.]+$/, "");

  return withoutExtension.split(path.sep).join(COMMAND_TOPIC_SEPARATOR);
}

/**
 * The values one module contributes to its directory's export surface: what it declares, plus every
 * name it re-exports. A name re-exported from a sibling is the sibling's declaration read twice and
 * the caller dedupes it; one re-exported from outside the directory is a member only this reader
 * sees. A whole-module `export *` names nothing at all, and is refused rather than skipped.
 */
function exportedValuesOf(directoryPath: string, module: string, claim: string): string[] {
  const file = parseModule(path.join(directoryPath, module));

  return [
    ...exportedNames(file, "const"),
    ...exportedNames(file, "function"),
    ...file.statements.flatMap((statement) => reexportedNames(statement, claim, module)),
  ];
}

function reexportedNames(statement: ts.Statement, claim: string, module: string): string[] {
  if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier === undefined) return [];
  if (statement.isTypeOnly) return [];

  const { exportClause } = statement;
  if (exportClause === undefined || !ts.isNamedExports(exportClause)) {
    throw refusal(claim, UNNAMEABLE_REEXPORT, module);
  }

  return exportClause.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => element.name.text);
}

function parseModule(filePath: string): ts.SourceFile {
  return ts.createSourceFile(filePath, readFileSync(filePath, "utf-8"), ts.ScriptTarget.Latest);
}

/** What a refusal about the source half is about, so the failure names a symbol and not a file. */
function subjectOf(source: SourceEnumeration): string {
  if ("directory" in source) return `the ${source.enumerates} of ${source.directory}`;
  if ("symbol" in source) return `${source.symbol} in ${source.file}`;
  if ("entries" in source) return `the entries of ${source.entries} in ${source.file}`;
  if ("reexports" in source) return `the re-exports of ${source.file}`;

  return `the exported ${source.exports}s of ${source.file}`;
}

/**
 * The members of one exported symbol: an object's keys, an array's strings, a union's literals.
 *
 * A symbol of any other shape enumerates nothing, and falls to the caller's zero-member refusal
 * along with the empty object — one message, because to a reader they are the same defect.
 */
function membersOfSymbol(file: ts.SourceFile, symbol: string, claim: string): string[] {
  const declared = declarationOf(file, symbol);
  if (declared === undefined) throw refusal(claim, NO_SYMBOL, symbol);

  if (ts.isObjectLiteralExpression(declared)) return keysOf(declared, claim, symbol);
  if (ts.isArrayLiteralExpression(declared)) return stringsOf(declared.elements, claim, symbol);
  if (ts.isUnionTypeNode(declared)) return stringsOf(declared.types, claim, symbol);

  return [];
}

/**
 * The same symbol's members bound to the values they hold, one `key = value` per property.
 *
 * A symbol of any other shape enumerates nothing and falls to the caller's refusal, as above — an
 * array and a union have members but no values, so a row asking either of them for pairs has named
 * the wrong shape rather than found an empty one.
 */
function entriesOfSymbol(file: ts.SourceFile, symbol: string, claim: string): string[] {
  const declared = declarationOf(file, symbol);
  if (declared === undefined) throw refusal(claim, NO_SYMBOL, symbol);
  if (!ts.isObjectLiteralExpression(declared)) return [];

  return declared.properties.map((property) => entryOf(property, claim, symbol));
}

function entryOf(property: ts.ObjectLiteralElementLike, claim: string, symbol: string): string {
  const key = keyOf(property, claim, symbol);

  return pairOf(key, valueOf(property, claim, `${key} in ${symbol}`));
}

/**
 * What one member holds, in the single spelling this file reads a value in anywhere: a string
 * literal, exactly as {@link stringsOf} reads an array's elements and a union's members.
 *
 * Every other spelling is refused rather than read, and the reason is that each would have to be
 * GUESSED at rather than looked up. A template with a substitution has no text until its references
 * are resolved — `SCHEMA_PATHS` writes all seven of its values that way, and the literal text under
 * the substitution is a suffix rather than the value. An identifier names a declaration elsewhere
 * in the module, or in another module — `STANDARD_FILES.METADATA_YAML` is written that way. A
 * shorthand, a method and a getter have no initializer to read at all. Skipping any of them would
 * under-report the source by one member while reporting the rest as agreed, which is the exact
 * shape of the defect this reader was added to close.
 *
 * The member is named in the refusal rather than the symbol, so the repair is one row of one table.
 */
function valueOf(property: ts.ObjectLiteralElementLike, claim: string, member: string): string {
  if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
    throw refusal(claim, UNREADABLE_VALUE, member);
  }

  return property.initializer.text;
}

/** What the symbol is defined as, with any `as const`, `satisfies` and parentheses read through. */
function declarationOf(file: ts.SourceFile, symbol: string): ts.Node | undefined {
  for (const statement of file.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === symbol) {
      return statement.type;
    }

    if (!ts.isVariableStatement(statement)) continue;

    const declaration = statement.declarationList.declarations.find(
      (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === symbol,
    );
    if (declaration?.initializer !== undefined) return unwrap(declaration.initializer);
  }

  return undefined;
}

/**
 * An annotation constrains what a declaration may hold; it is not itself the membership list. So
 * every one of them is read through to the literal underneath, `satisfies` included — `as const
 * satisfies readonly T[]` is this codebase's house style for a vocabulary array, which made the
 * shapes most worth binding the ones the reader could not see.
 */
function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return unwrap(expression.expression);
  }

  return expression;
}

/**
 * An object's property names. A spread or a computed key is a member this reader cannot name, and
 * dropping it silently would under-report the source — the exact shape every one of the five
 * filings took — so it refuses instead.
 */
function keysOf(literal: ts.ObjectLiteralExpression, claim: string, symbol: string): string[] {
  return literal.properties.map((property) => keyOf(property, claim, symbol));
}

function keyOf(property: ts.ObjectLiteralElementLike, claim: string, symbol: string): string {
  const { name } = property;
  if (name === undefined || (!ts.isIdentifier(name) && !ts.isStringLiteral(name))) {
    throw refusal(claim, UNREADABLE_MEMBER, symbol);
  }

  return name.text;
}

function stringsOf(
  nodes: ts.NodeArray<ts.Expression | ts.TypeNode>,
  claim: string,
  symbol: string,
): string[] {
  return nodes.map((node) => {
    const literal = ts.isLiteralTypeNode(node) ? node.literal : node;
    if (!ts.isStringLiteral(literal)) throw refusal(claim, UNREADABLE_MEMBER, symbol);

    return literal.text;
  });
}

/** Every name a module exports of one kind, which is what a "no other X is exported" claim is about. */
function exportedNames(file: ts.SourceFile, kind: "const" | "function"): string[] {
  const exported = file.statements.filter(isExported);

  return kind === "function" ? exported.flatMap(functionNameOf) : exported.flatMap(constantNamesOf);
}

function functionNameOf(statement: ts.Statement): string[] {
  if (!ts.isFunctionDeclaration(statement) || statement.name === undefined) return [];

  return [statement.name.text];
}

function constantNamesOf(statement: ts.Statement): string[] {
  if (!ts.isVariableStatement(statement)) return [];

  return statement.declarationList.declarations
    .map((declaration) => declaration.name)
    .filter((name) => ts.isIdentifier(name))
    .map((name) => name.text);
}

function isExported(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

function readDocument(packageRoot: string, { claim, document }: RegistryEntry): string[] {
  const documentPath = path.join(packageRoot, document.document);
  if (!existsSync(documentPath)) throw refusal(claim, NO_DOCUMENT, document.document);

  const section = sectionOf(readFileSync(documentPath, "utf-8"), document, claim);
  const named = namesIn(section, document, claim);

  if (named.length === 0) throw refusal(claim, DOCUMENT_ENUMERATES_NOTHING, document.from);

  return [...new Set(named)];
}

function namesIn(section: string, document: DocumentClaim, claim: string): string[] {
  switch (document.states) {
    case "code-spans":
      return constantSpansIn(section);
    case "table-rows":
      return tableRowKeysIn(section, claim);
    case "table-pairs":
      return tablePairsIn(section, document, claim);
    case "partitioned-tables":
      return partitionedTableKeysIn(section, document.column, claim);
    default: {
      const exhaustive: never = document;

      return exhaustive;
    }
  }
}

/** The text strictly between the markers, so neither marker's own words are read as members. */
function sectionOf(source: string, { from, to }: DocumentClaim, claim: string): string {
  const opens = source.indexOf(from);
  if (opens === -1) throw refusal(claim, NO_SECTION, from);

  const start = opens + from.length;
  if (source.includes(from, start)) throw refusal(claim, AMBIGUOUS_SECTION, from);

  const closes = source.indexOf(to, start);
  if (closes === -1) throw refusal(claim, NO_SECTION, to);

  return source.slice(start, closes);
}

function constantSpansIn(section: string): string[] {
  return [...section.matchAll(CONSTANT_SPAN)].flatMap((match) => match[1] ?? []);
}

/** The first cell of every row under the table's rule — the heading and the rule itself are not rows. */
function tableRowKeysIn(section: string, claim: string): string[] {
  const lines = section.split("\n");
  const rule = lines.findIndex((line) => TABLE_RULE.test(line));
  if (rule === -1) return [];

  return rowKeysUnder(lines, rule, claim);
}

/** Which cells of a row hold the two halves of a pair, resolved from the headings once per table. */
type PairColumns = { key: number; value: number };

/**
 * Every row of the section's table as `key = value`, read from the two columns the claim NAMES.
 *
 * The key half goes through {@link memberNameIn}, so one member per row is the same contract here
 * as it is for the reader above and is stated in one place. The value half is read verbatim —
 * markup off and trimmed, with no call signature stripped — because a value is text the document
 * quotes rather than a name it writes, and `plans(3)` is a value that means what it says.
 */
function tablePairsIn(
  section: string,
  document: Extract<DocumentClaim, { states: "table-pairs" }>,
  claim: string,
): string[] {
  const lines = section.split("\n");
  const rule = lines.findIndex((line) => TABLE_RULE.test(line));
  if (rule === -1) return [];

  const headings = cellsOf(lines[rule - 1] ?? "").map(cellTextOf);
  const columns = {
    key: columnIndexOf(headings, document.keyColumn, claim),
    value: columnIndexOf(headings, document.valueColumn, claim),
  };

  return rowsUnder(lines, rule).map((row) => pairIn(row, columns, claim));
}

/**
 * Which column a heading names — refused when the document no longer carries it, and refused again
 * when it carries it twice.
 *
 * Neither is a case to guess at. A renamed heading read as an empty column would answer `key = `
 * for every row and report the whole table as drifted, which invites the repair of editing a
 * correct document; read as a MISSING column it would answer nothing, which is the silent pass this
 * file refuses everywhere. And two columns under one heading is a table whose author meant one of
 * them; taking whichever comes first binds the row to a column by accident.
 */
function columnIndexOf(headings: string[], column: string, claim: string): number {
  if (!headings.includes(column)) throw refusal(claim, NO_COLUMN, column);
  if (occursTwice(headings, column)) throw refusal(claim, AMBIGUOUS_COLUMN, column);

  return headings.indexOf(column);
}

function occursTwice(headings: string[], column: string): boolean {
  return headings.indexOf(column) !== headings.lastIndexOf(column);
}

function pairIn(row: string, columns: PairColumns, claim: string): string {
  const cells = cellsOf(row);

  return pairOf(
    memberNameIn(cells[columns.key] ?? "", claim),
    cellTextOf(cells[columns.value] ?? ""),
  );
}

/** The same, for every table in the section whose first column carries the heading `column`. */
function partitionedTableKeysIn(section: string, column: string, claim: string): string[] {
  const lines = section.split("\n");

  return lines.flatMap((line, index) =>
    TABLE_RULE.test(line) && headingAbove(lines, index) === column
      ? rowKeysUnder(lines, index, claim)
      : [],
  );
}

/** A heading names a column rather than a member, so it is read as written and never refused. */
function headingAbove(lines: string[], rule: number): string {
  return cellTextOf(firstCellOf(lines[rule - 1] ?? ""));
}

function rowKeysUnder(lines: string[], rule: number, claim: string): string[] {
  return rowsUnder(lines, rule).map((row) => memberNameIn(firstCellOf(row), claim));
}

/** A table's rows, which end at the first line under its rule that is not one. */
function rowsUnder(lines: string[], rule: number): string[] {
  const body = lines.slice(rule + 1);
  const ends = body.findIndex((line) => !isTableRow(line));

  return ends === -1 ? body : body.slice(0, ends);
}

function isTableRow(line: string): boolean {
  return line.trimStart().startsWith(TABLE_CELL_DELIMITER);
}

/**
 * The one member a row states, or a refusal to guess which of several it meant.
 *
 * A row maps to exactly one member here and always has, so a cell naming two is outside what this
 * reader can answer. It is refused rather than read because the failure mode of reading it is a
 * confident wrong answer: {@link CALL_SIGNATURE} is greedy and anchored at the end, so
 * `` `agentsPath(dir)` / `skillsPath(dir)` `` loses everything from the first `(` to the last `)`
 * and survives as the single valid name `agentsPath` — whereupon the checker reports `skillsPath`,
 * which the document plainly carries, as unnamed. A checker that manufactures a drift report is
 * worse than one that refuses, because the repair it invites is to edit a correct document.
 *
 * Splitting the cell on a separator was the alternative and is rejected: no separator convention is
 * stated anywhere, `/` is also an ordinary character in the path-valued tables this same reader
 * serves, and inferring one would make the answer depend on punctuation. One name per cell is the
 * contract, and this is where it is enforced.
 */
function memberNameIn(cell: string, claim: string): string {
  if ([...cell.matchAll(CODE_SPAN)].length > 1) {
    throw refusal(claim, AMBIGUOUS_MEMBER_CELL, cell.trim());
  }

  return cellTextOf(cell).replace(CALL_SIGNATURE, "");
}

/**
 * The cells of a row as written, code spans intact, which is what counting their names needs. A row
 * opens with the delimiter, so the first part of the split is the empty string before it.
 *
 * The escape is undone here rather than left to the readers, so a cell answers what the page
 * renders — every column of a row is separated and read by one rule, whichever reader asks.
 */
function cellsOf(row: string): string[] {
  return row
    .split(CELL_SEPARATOR)
    .slice(1)
    .map((cell) => cell.replaceAll(ESCAPED_PIPE, TABLE_CELL_DELIMITER));
}

function firstCellOf(row: string): string {
  return cellsOf(row)[0] ?? "";
}

/** What a cell says with its markup off. A heading and a value are both read exactly this far. */
function cellTextOf(cell: string): string {
  return cell.replaceAll(CODE_SPAN_DELIMITER, "").trim();
}

/**
 * One member bound to its value. Both sides of the check pass through here, so the encoding is
 * written once and a source pair and a document pair cannot be spelt differently.
 */
function pairOf(key: string, value: string): string {
  return `${key}${PAIR_SEPARATOR}${value}`;
}

/** Named so the row to repair is the one the failure prints, rather than a fault with no address. */
function refusal(claim: string, problem: string, subject: string): Error {
  return new Error(`${claim}: ${problem} — ${subject}`);
}
