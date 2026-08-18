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
 * exported symbol — a const object, a const array, a union — or a module's whole export list of one
 * kind, against any delimited section of any document.
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
import { existsSync, readFileSync } from "fs";
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
const EXIT_CODES_FILE = "src/cli/lib/exit-codes.ts";
const SOURCE_TYPES = "src/cli/types/generated/source-types.ts";
const CONFIG_WRITER = "src/cli/lib/configuration/config-writer.ts";
const CONFIG_TYPES_WRITER = "src/cli/lib/configuration/config-types-writer.ts";
const CONFIG_GENERATOR = "src/cli/lib/configuration/config-generator.ts";
const SCOPE_PREDICATES = "src/cli/lib/configuration/scope-predicates.ts";
const CONFIG_WRITER_DOC = ".ai-docs/reference/config/config-writer.md";
const SCOPE_SPLIT_DOC = ".ai-docs/reference/config/scope-split.md";
const CONFIGURATION_DOC = ".ai-docs/reference/features/configuration.md";
const TYPE_SYSTEM = ".ai-docs/reference/type-system.md";
const MATRIX_TYPES = "src/cli/types/matrix.ts";
const MODEL_AND_EFFORT = ".ai-docs/reference/features/model-and-effort.md";
const CONTENT_GENERATORS = "src/cli/lib/__tests__/content-generators.ts";
const TEST_FS_UTILS = "src/cli/lib/__tests__/test-fs-utils.ts";
const TESTING_FACTORIES = ".ai-docs/reference/testing/factories.md";
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

const TABLE_CELL_DELIMITER = "|";
const CODE_SPAN_DELIMITER = "`";

export const NO_SOURCE_FILE = "names a source file that does not exist";
export const NO_SYMBOL = "names a symbol its source file does not export";
export const SOURCE_ENUMERATES_NOTHING = "names a symbol that enumerates nothing";
export const UNREADABLE_MEMBER = "names a symbol holding a member no reader can name";
export const NO_DOCUMENT = "names a document that does not exist";
export const NO_SECTION = "names a section its document no longer holds";
export const AMBIGUOUS_SECTION = "opens a section at text the document uses more than once";
export const DOCUMENT_ENUMERATES_NOTHING = "opens a section that enumerates nothing";

/** Which members of a source file a row is about: one symbol's, or the module's own export list. */
export type SourceEnumeration =
  { file: string; symbol: string } | { file: string; exports: "const" | "function" };

/**
 * Where a document states that membership. The section is the text strictly between the two
 * markers, so a marker may carry the symbol's own name without the reader counting it as a member.
 *
 * `code-spans` reads every constant-shaped backticked name in the section, which is how both
 * `STEP_TEXT` documents state their list. `table-rows` reads the first cell of every row under the
 * table's rule, which is how `reference/commands/index.md` states its two.
 */
export type DocumentClaim = {
  document: string;
  from: string;
  to: string;
  states: "code-spans" | "table-rows";
};

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
  // The other five rows of the same table. `STATUS_MESSAGES` was registered alone, and the row two
  // below it was the one that had drifted: `SHARED_CONFIG_APPLY` named five members against seven,
  // missing `GLOBAL_SKILLS_HEADING` and `GLOBAL_AGENTS_HEADING` — the project-scope removal plan's
  // own two headings, which `commands/edit.md` had been naming all along. One table introduced as
  // "enumerated exhaustively" with one of its six objects bound to source is what let that sit.
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
      to: "| `SHARED_CONFIG_ONE_DIRECTION`",
      states: "code-spans",
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

  // `reference/utilities.md`'s own copy of the six message objects — the second writable copy of
  // the six rows above it, registered for the same reason the builders were. `SHARED_CONFIG_APPLY`
  // named five members against seven in BOTH documents on 2026-08-18, and repairing one would have
  // left the other reading as authoritative.
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
  // objects is stated in exactly one document, so unlike the six above there is no second copy to
  // keep in step; the row exists because a key added to a constant object is the same one-line edit
  // in a file no documentation pass opens.
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
    source: { file: CONSTS, symbol: "STANDARD_FILES" },
    document: {
      document: UTILITIES,
      from: "readable as an enumeration — bound to source",
      to: "`METADATA_YAML` and `AGENT_METADATA_YAML` are deliberately",
      states: "table-rows",
    },
  },
  {
    claim: "STANDARD_DIRS in reference/utilities.md",
    source: { file: CONSTS, symbol: "STANDARD_DIRS" },
    document: {
      document: UTILITIES,
      from: "`STANDARD_DIRS` constant, same convention:",
      to: "### Branding and Naming",
      states: "table-rows",
    },
  },
  {
    claim: "DIRS in reference/utilities.md",
    source: { file: CONSTS, symbol: "DIRS" },
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

  // The one generated union a document enumerates member by member. `SKILL_IDS` and `SKILL_SLUGS`
  // are declared `as const satisfies readonly SkillSlug[]`, and `unwrap` reads through `as` and
  // parentheses but not `satisfies` — so a row naming either would be a hard failure rather than a
  // judgement, and `type-system.md` says so in place of carrying one. `CATEGORIES` and `DOMAINS`
  // are readable, but no document under `reference/` states their membership as spans or rows.
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
    claim: "AGENT_NAMES in reference/type-system.md",
    source: { file: SOURCE_TYPES, symbol: "AGENT_NAMES" },
    document: {
      document: TYPE_SYSTEM,
      from: "`AGENT_NAMES` in full — exhaustive, in source order:",
      to: "There is **one** `reviewer`",
      states: "table-rows",
    },
  },

  // The config area's module export lists. Four modules, six rows, because two of the four are
  // enumerated in TWO documents apiece — the `config/` deep-dive and the `features/` overview each
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
  //   - `CANONICAL_FIELD_ORDER` in `config-writer.ts` is `[...] as const satisfies readonly
  //     (keyof ProjectConfig)[]`; `unwrap` reads through `as` and parentheses but not `satisfies`,
  //     the same limitation `SKILL_IDS` and `SKILL_SLUGS` hit above.
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
      from: "**Seven exported functions, exhaustively.** This document owns the list.",
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
      from: "so a sixth export cannot land without this table naming it:",
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
  // The test-support side. `reference/testing/factories.md` OWNS the factory, helper and assertion
  // counts, and on 2026-08-18 all three were wrong in both directions at once: it named
  // `createImportSource`, deleted from `disk-writers.ts`, and had never named the seven exports of
  // `helpers/journey-page.ts` or `renderUnparseableMetadataYaml`. Its three directory tables cannot
  // be bound — a row names ONE source file, and a barrel re-exporting from eight siblings
  // enumerates nothing of its own — so the single-file inventories are registered instead and the
  // directory tables say in the document that they are hand-checked.
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
      from: "**Files (`FILES`)** — all 12:",
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
  // Four neighbouring wizard lists are NOT registrable, each at a guard this checker means to fail
  // at rather than skip. They stay hand-derived and say so where they appear:
  //   - `WIZARD_STEP_ORDER` is `[...] as const satisfies readonly WizardStep[]`; `unwrap` reads
  //     through `as` and parentheses but not `satisfies`. The `WizardStep` UNION is registered
  //     instead, which is the same six names from the declaration the constant is checked against.
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
    // the same reasoning as the six `messages.ts` objects above.
    claim: "CLI_COLORS in reference/component-patterns.md",
    source: { file: CONSTS, symbol: "CLI_COLORS" },
    document: {
      document: COMPONENT_PATTERNS,
      from: "## Color Constants (CLI_COLORS in `src/cli/consts.ts`)",
      to: "## UI Symbols (UI_SYMBOLS in",
      states: "table-rows",
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
    // checking for an export modifier. The four strings are asserted verbatim by E2E specs, so a
    // fifth guard landing unnamed is a guard no spec knows to wait for.
    claim: "TOAST_MESSAGES in reference/store-map.md",
    source: { file: WIZARD_STORE, symbol: "TOAST_MESSAGES" },
    document: {
      document: STORE_MAP,
      from: "Bound to source by `scripts/check-enumeration-drift.ts`, so a fifth guard cannot land without a row here. E2E asserts the strings verbatim:",
      to: "## State Reset",
      states: "table-rows",
    },
  },
  {
    claim: "WizardStep in reference/wizard/state-transitions.md",
    source: { file: WIZARD_STORE, symbol: "WizardStep" },
    document: {
      document: STATE_TRANSITIONS,
      from: "bound to it by `scripts/check-enumeration-drift.ts` so a seventh step cannot land without a row here:",
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
  const filePath = path.join(packageRoot, source.file);
  if (!existsSync(filePath)) throw refusal(claim, NO_SOURCE_FILE, source.file);

  const file = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf-8"),
    ts.ScriptTarget.Latest,
  );

  const members = membersOf(file, source, claim);
  if (members.length === 0) throw refusal(claim, SOURCE_ENUMERATES_NOTHING, subjectOf(source));

  return members;
}

function membersOf(file: ts.SourceFile, source: SourceEnumeration, claim: string): string[] {
  return "symbol" in source
    ? membersOfSymbol(file, source.symbol, claim)
    : exportedNames(file, source.exports);
}

/** What a refusal about the source half is about, so the failure names a symbol and not a file. */
function subjectOf(source: SourceEnumeration): string {
  return "symbol" in source
    ? `${source.symbol} in ${source.file}`
    : `the exported ${source.exports}s of ${source.file}`;
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

/** What the symbol is defined as, with any `as const` and any parentheses read through. */
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

function unwrap(expression: ts.Expression): ts.Expression {
  if (ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) {
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
  return literal.properties.map((property) => {
    const { name } = property;
    if (name === undefined || (!ts.isIdentifier(name) && !ts.isStringLiteral(name))) {
      throw refusal(claim, UNREADABLE_MEMBER, symbol);
    }

    return name.text;
  });
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
  const named =
    document.states === "code-spans" ? constantSpansIn(section) : tableRowKeysIn(section);

  if (named.length === 0) throw refusal(claim, DOCUMENT_ENUMERATES_NOTHING, document.from);

  return [...new Set(named)];
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
function tableRowKeysIn(section: string): string[] {
  const lines = section.split("\n");
  const rule = lines.findIndex((line) => TABLE_RULE.test(line));
  if (rule === -1) return [];

  const body = lines.slice(rule + 1);
  const ends = body.findIndex((line) => !isTableRow(line));

  return (ends === -1 ? body : body.slice(0, ends)).map(firstCellOf);
}

function isTableRow(line: string): boolean {
  return line.trimStart().startsWith(TABLE_CELL_DELIMITER);
}

function firstCellOf(row: string): string {
  const cell = row.split(TABLE_CELL_DELIMITER)[1] ?? "";

  return cell.replaceAll(CODE_SPAN_DELIMITER, "").trim().replace(CALL_SIGNATURE, "");
}

/** Named so the row to repair is the one the failure prints, rather than a fault with no address. */
function refusal(claim: string, problem: string, subject: string): Error {
  return new Error(`${claim}: ${problem} — ${subject}`);
}
