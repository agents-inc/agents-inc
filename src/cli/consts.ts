import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import type { Domain } from "./types/index.js";

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

/** Compiled plugin output directory, relative to a marketplace root */
export const PLUGINS_DIST_PATH = "dist/plugins";

/** Path to the marketplace manifest inside a marketplace/source root. */
export function marketplaceManifestPath(dir: string): string {
  return path.join(dir, PLUGIN_MANIFEST_DIR, MARKETPLACE_JSON);
}
export const DEFAULT_PLUGIN_NAME = "agents-inc";

/** Home directory used as the root for global installations */
export const GLOBAL_INSTALL_ROOT = os.homedir();

export const CACHE_DIR = path.join(os.homedir(), ".cache", DEFAULT_PLUGIN_NAME);

/**
 * Promoted invocation prefix shown in user-facing messages (e.g. "Run '<CLI_INVOKE_COMMAND> init'").
 * This is the documented `npx` entry point from the README, not the registered global bin name
 * (see `bin`/`oclif.bin` in package.json, which is still `agentsinc` for global installs).
 */
export const CLI_INVOKE_COMMAND = "npx @agents-inc/cli";

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
  commands: "src/commands",
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
} as const;

export const STANDARD_DIRS = {
  EXAMPLES: "examples",
  SCRIPTS: "scripts",
  SKILLS: "skills",
  AGENTS: "agents",
  COMMANDS: "commands",
  /** Legacy per-project template override directory (`.claude/templates`). */
  TEMPLATES: "templates",
} as const;

export const DEFAULT_VERSION = "1.0.0";

// "0.0.0" indicates no version was explicitly set
export const DEFAULT_DISPLAY_VERSION = "0.0.0";

// JSON Schema URLs for yaml-language-server $schema comments.
// Uses raw.githubusercontent.com so schemas resolve without requiring the CLI as a dependency.
const SCHEMA_PKG_PREFIX = "https://raw.githubusercontent.com/agents-inc/cli/main/src/schemas";

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
} as const;

export const GITHUB_SOURCE = {
  HTTPS_PREFIX: "https://github.com/",
  GITHUB_PREFIX: "github:",
  GH_PREFIX: "gh:",
} as const;

/** Conventional skills subdirectory name (same value as `STANDARD_DIRS.SKILLS`). */
export const DEFAULT_SKILLS_SUBDIR = STANDARD_DIRS.SKILLS;

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
  /** Minimum terminal height to show the wizard at all */
  MIN_TERMINAL_HEIGHT: 15,
} as const;

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

/** Canonical name of the built-in public source. */
export const PUBLIC_SOURCE_NAME = "public";

/** Human-readable labels for skill source types shown in the wizard and edit command */
export const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  public: "Public",
  eject: "Eject",
  "agents-inc": "Agents Inc",
};

/**
 * Column-header labels for source types in the source grid. Distinct from
 * `SOURCE_DISPLAY_NAMES` (inline labels): headers read "Local"/"Plugin" where
 * the inline labels read "Eject"/"Agents Inc".
 */
export const SOURCE_HEADER_NAMES: Record<string, string> = {
  eject: "Local",
  "agents-inc": "Plugin",
  public: "Public",
};

/** Resolves a source name to its human-readable display label. */
export function formatSourceDisplayName(source: string): string {
  return SOURCE_DISPLAY_NAMES[source] ?? source;
}

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

/** Canonical display order for built-in domains. Custom domains appear before these, alphabetically. */
export const BUILT_IN_DOMAIN_ORDER: readonly Domain[] = [
  "web",
  "api",
  "ai",
  "mobile",
  "desktop",
  "cli",
  "infra",
  "meta",
  "shared",
];

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
