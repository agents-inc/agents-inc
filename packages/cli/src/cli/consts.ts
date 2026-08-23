import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import type { Domain, InstallMode } from "./types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// After tsup build, dist/ is flat, so we go up one level from dist/ to get CLI root
// In development (src/cli/consts.ts), we go up two levels
const isInDist = __dirname.includes("/dist");
const CLI_ROOT = isInDist ? path.resolve(__dirname, "..") : path.resolve(__dirname, "../..");
export const PROJECT_ROOT = CLI_ROOT;

export const CLAUDE_DIR = ".claude";
export const CLAUDE_SRC_DIR = ".claude-src";
export const PLUGINS_SUBDIR = "plugins";
export const PLUGIN_MANIFEST_DIR = ".claude-plugin";
export const PLUGIN_MANIFEST_FILE = "plugin.json";
export const MARKETPLACE_JSON = "marketplace.json";

/**
 * The catalogue a marketplace publishes beside its manifest — its whole matrix
 * as JSON, in the shape `@workspace/matrix`'s `matrixSchema` describes.
 *
 * `marketplace.json` lists what a marketplace installs; this lists what it
 * OFFERS — every skill, category and stack, with the relationships resolved. The
 * editor fetches it directly and parses it with that schema, so nothing between
 * the two transforms it.
 */
export const CATALOG_JSON = "catalog.json";

/**
 * What `generatedAt` says on a matrix that was WRITTEN to disk rather than built
 * in memory — a fixed word where the live matrix carries an ISO timestamp.
 *
 * A moment recorded in a committed artefact makes every regeneration a diff even
 * when nothing about the matrix moved, which costs the vendored
 * `types/generated/matrix.ts` a pull request of pure noise and costs
 * {@link CATALOG_JSON} its cache: the editor fetches the catalogue directly, and
 * a file whose bytes always change can never answer a conditional request.
 * Nothing reads the field back, so there is nothing a real timestamp would buy.
 *
 * Both emitters — `scripts/generate-source-types.ts` and `build marketplace` —
 * stamp this, and they are the only two places a matrix becomes a file.
 */
export const GENERATED_AT_BUILD = "build";

/** Compiled plugin output directory, relative to a marketplace root */
export const PLUGINS_DIST_PATH = "dist/plugins";

/** Path to the marketplace manifest inside a marketplace/source root. */
export function marketplaceManifestPath(dir: string): string {
  return path.join(dir, PLUGIN_MANIFEST_DIR, MARKETPLACE_JSON);
}
export const DEFAULT_PLUGIN_NAME = "agents-inc";

/**
 * Home directory used as the root for global installations, read when it is asked for.
 *
 * A `const` here froze whichever home was in force when this module was first imported, and the
 * damage was invisible: `runCliCommand` drives oclif through `dist/`, a SECOND module graph first
 * imported by whichever spec runs a command first, so the value settled on that spec's fake home
 * and every later spec in the file wrote under a directory its own `afterEach` had removed — the
 * writes succeeding, into the wrong tree. In the `src` graph it was worse still: `consts.ts` is
 * imported while vitest collects, before any hook has redirected the home, so the constant held
 * the DEVELOPER'S own home in every unit test that read it.
 *
 * Every other home-dir reader in the codebase already calls `os.homedir()` at call time —
 * `installBaseDir`, `isHomeDirectory`, `globalPairPaths` — each with its own note saying why.
 * This is that rule arriving at the constants file, and `home-dir-read-at-call-time.test.ts`
 * refuses the frozen shape from coming back.
 */
export function globalInstallRoot(): string {
  return os.homedir();
}

/** Root of the CLI's own cache, read at call time for the reason {@link globalInstallRoot} carries. */
export function cacheRoot(): string {
  return path.join(os.homedir(), ".cache", DEFAULT_PLUGIN_NAME);
}

/**
 * Promoted invocation prefix shown in user-facing messages (e.g. "Run '<CLI_INVOKE_COMMAND> init'").
 *
 * `bin` in package.json registers BOTH names — `agents-inc` (primary, matching this constant and
 * the package name) and `agentsinc` (kept so existing global installs keep working). A global
 * install therefore answers to either spelling.
 *
 * `agents-inc` rather than `agentsinc` because it is the published package name, so `npx
 * agents-inc` resolves with nothing installed, and it is what agentsinc.sh hands people when they
 * copy an install command.
 *
 * CONVENTION: every user-facing instruction in this repo — messages, docs, code comments, agent
 * playbooks — writes commands in this `npx agents-inc <cmd>` form. Prose that merely names a
 * command ("the `agents-inc list` table") does not.
 */
export const CLI_INVOKE_COMMAND = "npx agents-inc";

/**
 * The editor — the web half of the product, where a configuration is built without the wizard
 * and handed to `init --from <id>`. `agentsinc.sh` is the editor Worker's custom domain
 * (`apps/editor/wrangler.jsonc`); the config store it posts to is the sibling
 * `api.agentsinc.sh`, spelled once in `lib/seed/fetch-seed.ts` because that one is
 * overridable for tests and this one is not.
 */
export const EDITOR_URL = "https://agentsinc.sh";

/**
 * Where a shared configuration opens in the editor — the form the editor's own Share button
 * copies, so a link the CLI prints and one the web app hands out are the same link.
 *
 * Exported before it had a second caller, and now it has two: `share` prints it, and
 * `edit --ui` hands it to a browser. Two surfaces each building their own query string is
 * exactly how one of them ends up pointing at a page the other never opens.
 */
export function editorConfigUrl(id: string): string {
  return `${EDITOR_URL}/?fromId=${encodeURIComponent(id)}`;
}

/**
 * Internal `edit` flag marking the invocation as the project-setup half of a `cc init`
 * that routed through the dashboard. Not part of the documented CLI surface (declared
 * `hidden`): `init` is the only caller, and it passes the flag so `edit` can tell
 * "set this project up" apart from a bare inspection.
 */
export const EDIT_PROJECT_SETUP_FLAG = "project-setup";

export const SKILL_CATEGORIES_PATH = "config/skill-categories.ts";
export const SKILL_RULES_PATH = "config/skill-rules.ts";
export const STACKS_FILE_PATH = "config/stacks.ts";
/** Source root directory inside a marketplace/source repo (holds skills/, agents/, etc.). */
export const SOURCE_SRC_DIR = "src";
export const SKILLS_DIR_PATH = `${SOURCE_SRC_DIR}/skills`;
export const LOCAL_SKILLS_PATH = ".claude/skills";

/** Synthetic source name for skills copied into the project (ejected) rather than installed as plugins. */
export const EJECT_SOURCE = "eject";

/** Pseudo-category assigned to local skills — not a `Category` union member; category traversals skip it. */
export const LOCAL_PSEUDO_CATEGORY = "local";

export const DIRS = {
  agents: "src/agents",
  skills: SKILLS_DIR_PATH,
  stacks: "src/stacks",
  templates: "src/agents/_templates",
} as const;

/** Single source for the metadata file name shared by skill and agent metadata. */
const METADATA_YAML_FILE = "metadata.yaml";

export const STANDARD_FILES = {
  SKILL_MD: "SKILL.md",
  METADATA_YAML: METADATA_YAML_FILE,
  METADATA_JSON: "metadata.json",
  CONFIG_YAML: "config.yaml",
  SKILL_CATEGORIES_TS: "skill-categories.ts",
  SKILL_RULES_TS: "skill-rules.ts",
  AGENT_METADATA_YAML: METADATA_YAML_FILE,
  PLUGIN_JSON: PLUGIN_MANIFEST_FILE,
  CONFIG_TS: "config.ts",
  CONFIG_TYPES_TS: "config-types.ts",
  CLAUDE_MD: "CLAUDE.md",
  README_MD: "README.md",
  REFERENCE_MD: "reference.md",
  IDENTITY_MD: "identity.md",
  PLAYBOOK_MD: "playbook.md",
  OUTPUT_MD: "output.md",
  CRITICAL_REQUIREMENTS_MD: "critical-requirements.md",
  CRITICAL_REMINDERS_MD: "critical-reminders.md",
  SETTINGS_JSON: "settings.json",
  SETTINGS_LOCAL_JSON: "settings.local.json",
  PACKAGE_JSON: "package.json",
} as const;

export const STANDARD_DIRS = {
  EXAMPLES: "examples",
  SCRIPTS: "scripts",
  SKILLS: "skills",
  AGENTS: "agents",
  /** Legacy per-project template override directory (`.claude/templates`). */
  TEMPLATES: "templates",
} as const;

export const DEFAULT_VERSION = "1.0.0";

// "0.0.0" indicates no version was explicitly set
export const DEFAULT_DISPLAY_VERSION = "0.0.0";

// JSON Schema URLs for yaml-language-server $schema comments.
// Uses raw.githubusercontent.com so schemas resolve without requiring the CLI as a dependency.
// The prefix encodes two things that have each moved once: the repository name (renamed to
// agents-inc/agents-inc on 2026-08-04, when it stopped being only the CLI) and this package's
// location inside it (packages/cli, since the monorepo merge). If either moves again this must
// move with it, or every generated $schema comment 404s. GitHub redirects the old forms — files
// written before each move still resolve, verified two renames deep — but a redirect is a
// courtesy, so what we emit should be the current address rather than rely on one.
const SCHEMA_PKG_PREFIX =
  "https://raw.githubusercontent.com/agents-inc/agents-inc/main/packages/cli/src/schemas";

export const SCHEMA_PATHS = {
  agent: `${SCHEMA_PKG_PREFIX}/agent.schema.json`,
  metadata: `${SCHEMA_PKG_PREFIX}/metadata.schema.json`,
  customMetadata: `${SCHEMA_PKG_PREFIX}/custom-metadata.schema.json`,
  marketplace: `${SCHEMA_PKG_PREFIX}/marketplace.schema.json`,
  projectConfig: `${SCHEMA_PKG_PREFIX}/project-config.schema.json`,
  projectSourceConfig: `${SCHEMA_PKG_PREFIX}/project-source-config.schema.json`,
  stacks: `${SCHEMA_PKG_PREFIX}/stacks.schema.json`,
} as const;

export const YAML_FORMATTING = {
  INDENT: 2,
  LINE_WIDTH: 120,
  /** lineWidth: 0 disables wrapping — used for metadata files */
  LINE_WIDTH_NONE: 0,
} as const;

// Shared glyphs: SELECTED/CHECK render the same checkmark; SKIPPED/DISABLED the
// same en-dash. Both keys are kept so call sites express intent, but the value
// has a single source.
const CHECK_GLYPH = "\u2713";
const EN_DASH_GLYPH = "\u2013";

export const UI_SYMBOLS = {
  CHECKBOX_CHECKED: "[x]",
  CHECKBOX_UNCHECKED: "[ ]",
  CHEVRON: "\u276F",
  CHEVRON_SPACER: " ",
  SELECTED: CHECK_GLYPH,
  UNSELECTED: "\u25CB",
  CURRENT: "\u25CF",
  SKIPPED: EN_DASH_GLYPH,
  DISCOURAGED: "!",
  DISABLED: EN_DASH_GLYPH,
  LOCK: "\uD83D\uDD12",
  EJECT: "\u23CF",
  BULLET: "\u2022",
  SCROLL_UP: "\u25B2",
  SCROLL_DOWN: "\u25BC",
  CHECK: CHECK_GLYPH,
  CROSS: "\u2717",
  /** Removed/pending-removal diff marker (ASCII hyphen). Info panel + Sources tab share it. */
  REMOVED: "-",
  /** Added/newly-selected diff marker (ASCII plus). Info panel + Sources tab share it. */
  ADDED: "+",
} as const;

export const GITHUB_SOURCE = {
  HTTPS_PREFIX: "https://github.com/",
  GITHUB_PREFIX: "github:",
  GH_PREFIX: "gh:",
} as const;

/** Name written into a global-scope config's `name` field (`~/.claude-src/config.ts`). */
export const GLOBAL_CONFIG_NAME = "global";

/** Strict kebab-case: starts with letter, segments separated by single hyphens, no trailing hyphens */
export const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Author handle format: `@` followed by a lowercase-led alphanumeric-hyphen slug. */
export const AUTHOR_HANDLE_PATTERN = /^@[a-z][a-z0-9-]*$/;

export const HASH_PREFIX_LENGTH = 7;

/** Hex chars from SHA-256 hash used in cache directory names (64 bits of collision resistance) */
export const CACHE_HASH_LENGTH = 16;

/** Max chars of human-readable prefix in cache directory names (for debugging) */
export const CACHE_READABLE_PREFIX_LENGTH = 32;

// File size limits for parsing boundaries (DoS prevention)
const ONE_MB = 1024 * 1024;
export const MAX_MARKETPLACE_FILE_SIZE = 10 * ONE_MB;
export const MAX_PLUGIN_FILE_SIZE = ONE_MB;
export const MAX_CONFIG_FILE_SIZE = ONE_MB;

export const MAX_JSON_NESTING_DEPTH = 10;
export const MAX_MARKETPLACE_PLUGINS = 10_000;

export const SCROLL_VIEWPORT = {
  /** Height of the "N more above" scroll indicator */
  SCROLL_INDICATOR_HEIGHT: 1,
  /** Estimated lines per category name row (including top margin) */
  CATEGORY_NAME_LINES: 2,
  /** Margin between category sections (marginTop on CategorySection) */
  CATEGORY_MARGIN_LINES: 1,
  /** Minimum rows to show at least 1 category before enabling scroll */
  MIN_VIEWPORT_ROWS: 5,
} as const;

/**
 * The terminal geometry every command refuses to run below. This is the only
 * minimum-size gate there is: `BaseCommand.ensureTerminalSize` reads it and
 * blocks until the terminal is at least this big, so raising `ROWS` raises the
 * bar for the whole CLI, tests included.
 *
 * `ROWS: 20` is measured, not guessed. Driving the real binary to the build
 * step — the binding constraint, since it is the tallest step — gives:
 * 15/16/17 corrupt (overlapping card borders, unreadable); 18 the first clean
 * render (one complete category card, correctly clipped); 20 clean with one
 * full card plus the next category heading; 24 comfortable. 18 is the hard
 * correctness floor because it is where {@link SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS}
 * starts being satisfied — below it the shared scroll gate stops clipping and
 * the grid bleeds over its borders. 20 buys two rows of margin above that floor
 * while staying under the 24-row default of common terminals.
 */
export const MIN_TERMINAL_SIZE = {
  COLS: 80,
  ROWS: 20,
} as const;

/**
 * The terminal height at or above which the stack step paints the six-row ASCII
 * logo. Below it the logo is dropped — it is decoration, and the stack list is
 * the content.
 *
 * This is NOT a second size gate. {@link MIN_TERMINAL_SIZE} decides whether a
 * command runs at all; this decides only whether one decorative element renders
 * inside a terminal that already cleared that gate. Conflating them would be a
 * regression in both directions: raising `MIN_TERMINAL_SIZE.ROWS` to 26 would
 * refuse to run in the 24-row terminal that is still a common default, and
 * lowering this to 20 brings back the bleed below.
 *
 * 26 is measured against the real binary at 100 columns, on the stack step:
 *
 * | rows | stack step with the logo rendered                                 |
 * | ---- | ----------------------------------------------------------------- |
 * | 20   | bleeds — stack rows paint over the "Start from scratch" row        |
 * | 24   | bleeds — stack rows paint through the hotkey row and the footer    |
 * | 26   | clean                                                              |
 * | 27   | clean                                                              |
 * | 28   | clean                                                              |
 *
 * The mechanism: the logo eats six rows of the stack step's list viewport,
 * starving it below {@link SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS}, at which point
 * the shared scroll hooks stop clipping and the rows bleed. Hiding the logo
 * returns those rows to the viewport; the bail-instead-of-clip behaviour itself
 * is untouched and remains the open underlying defect.
 */
export const LOGO_MIN_TERMINAL_ROWS = 26;

export const DEFAULT_BRANDING = {
  NAME: "Agents Inc.",
  TAGLINE: "AI-powered development tools",
} as const;

/**
 * Fallback name for the default public marketplace when marketplace.json is
 * unavailable. Same value as `DEFAULT_PLUGIN_NAME` but a distinct concept: this
 * is the resolved source/marketplace name, that is the plugin bundle name.
 */
export const DEFAULT_PUBLIC_SOURCE_NAME = DEFAULT_PLUGIN_NAME;

/**
 * The npm package the public catalogue publishes from, and the one thing that
 * tells the catalogue apart from a marketplace merely calling itself
 * {@link DEFAULT_PUBLIC_SOURCE_NAME}.
 *
 * Nothing a marketplace ships is unforgeable — every signal is a string in a file
 * its author controls, this one included. What it does is make the reserved
 * namespace unreachable by ACCIDENT: taking it requires renaming your own package
 * to the catalogue's published, npm-scope-governed name, which is impersonation
 * rather than drift.
 *
 * Two guards read it and must agree, which is why it lives here rather than in
 * either: `validateMarketplaceName` (`lib/marketplace-generator.ts`) exempts the
 * catalogue from the reserved-name refusal at BUILD time, and the collision guard
 * in `lib/loading/source-loader.ts` exempts it from the catalogue-id refusal at
 * LOAD time. Two definitions of who the catalogue is would let a source be the
 * catalogue to one guard and not to the other.
 */
export const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

/** Human-readable labels for skill source types shown in the wizard and edit command */
export const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  public: "Public",
  eject: "Eject",
  "agents-inc": "Agents Inc",
};

/** The two install modes a Sources row offers, in the order the grid renders them. */
export const INSTALL_MODES = ["eject", "plugin"] as const satisfies readonly Exclude<
  InstallMode,
  "mixed"
>[];

/**
 * How the Sources grid captions each of its two cells.
 *
 * Deliberately not `INSTALL_MODE_LABELS` (`Eject`/`Plugin`), which names a mode by what it does
 * to the files, nor `SOURCE_DISPLAY_NAMES`, which labels a `SkillConfig.origin` VALUE on the
 * summary surfaces. The grid asks where the skill should LIVE, and the two answers are the
 * project's own copy or the marketplace plugin — so the cells read `Local` and `Plugin`, which
 * is also the two-state badge the editor settled on (`.claude-design/DECISIONS.md`).
 */
export const INSTALL_MODE_CELL_LABELS = {
  eject: "Local",
  plugin: "Plugin",
} as const satisfies Record<Exclude<InstallMode, "mixed">, string>;

/** Resolves a source name to its human-readable display label. */
export function formatSourceDisplayName(source: string): string {
  return SOURCE_DISPLAY_NAMES[source] ?? source;
}

/**
 * Marketplace-row value when skills are selected but every one of them is `EJECT_SOURCE`. "eject"
 * names no marketplace, so there is nothing to list — but the selection is not empty either, and
 * naming the default public marketplace would claim an origin none of those skills has.
 */
export const ALL_SKILLS_EJECTED_LABEL = "All skills ejected";

// TODO: update naming convention to GRAY_1,2, etc
export const CLI_COLORS = {
  PRIMARY: "#99FFFF",
  SUCCESS: "#90EE90",
  ERROR: "#DC343B",
  WARNING: "#E6A817",
  INFO: "#3B82F6",
  NEUTRAL: "#888888",
  FOCUS: "#87CEFA",
  UNFOCUSED: "#FFFFFF",
  WHITE: "#FFFFFF",
  BLACK: "#000000",
  DIM: "#666666",
  GRAY_1: "#ddd",
  LABEL_BG: "#383838",
  TOAST_BG: "#EEEEEE",
  TOAST_FG: "#000000",
  HOVER_BG: "#333333",
} as const;

/** Default domains pre-selected when "Start from scratch" is chosen (all except CLI) */
export const DEFAULT_SCRATCH_DOMAINS: readonly Domain[] = ["web", "api", "mobile"];

/** Domain used when no active domain can be resolved from wizard state. */
export const FALLBACK_DOMAIN: Domain = "web";

export const ASCII_LOGO = ` █████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗      ██╗███╗   ██╗ ██████╗
██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔════╝      ██║████╗  ██║██╔════╝
███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ███████╗      ██║██╔██╗ ██║██║
██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║      ██║██║╚██╗██║██║
██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ███████║      ██║██║ ╚████║╚██████╗
╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝      ╚═╝╚═╝  ╚═══╝ ╚═════╝`;
