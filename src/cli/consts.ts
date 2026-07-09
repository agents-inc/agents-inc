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

export const SKILL_CATEGORIES_PATH = "config/skill-categories.ts";
export const SKILL_RULES_PATH = "config/skill-rules.ts";
export const STACKS_FILE_PATH = "config/stacks.ts";
export const SKILLS_DIR_PATH = "src/skills";
export const LOCAL_SKILLS_PATH = ".claude/skills";

export const DIRS = {
  agents: "src/agents",
  skills: "src/skills",
  stacks: "src/stacks",
  templates: "src/agents/_templates",
  commands: "src/commands",
} as const;

export const STANDARD_FILES = {
  SKILL_MD: "SKILL.md",
  METADATA_YAML: "metadata.yaml",
  METADATA_JSON: "metadata.json",
  CONFIG_YAML: "config.yaml",
  SKILL_CATEGORIES_TS: "skill-categories.ts",
  SKILL_RULES_TS: "skill-rules.ts",
  AGENT_METADATA_YAML: "metadata.yaml",
  PLUGIN_JSON: "plugin.json",
  CONFIG_TS: "config.ts",
  CONFIG_TYPES_TS: "config-types.ts",
  CLAUDE_MD: "CLAUDE.md",
  REFERENCE_MD: "reference.md",
  IDENTITY_MD: "identity.md",
  PLAYBOOK_MD: "playbook.md",
  OUTPUT_MD: "output.md",
  CRITICAL_REQUIREMENTS_MD: "critical-requirements.md",
  CRITICAL_REMINDERS_MD: "critical-reminders.md",
} as const;

export const STANDARD_DIRS = {
  EXAMPLES: "examples",
  SCRIPTS: "scripts",
  SKILLS: "skills",
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
  marketplace: `${SCHEMA_PKG_PREFIX}/marketplace.schema.json`,
  projectConfig: `${SCHEMA_PKG_PREFIX}/project-config.schema.json`,
  projectSourceConfig: `${SCHEMA_PKG_PREFIX}/project-source-config.schema.json`,
  stacks: `${SCHEMA_PKG_PREFIX}/stacks.schema.json`,
} as const;

/** Generates a yaml-language-server schema comment for the top of YAML files. */
export function yamlSchemaComment(schemaPath: string): string {
  return `# yaml-language-server: $schema=${schemaPath}`;
}

export const YAML_FORMATTING = {
  INDENT: 2,
  LINE_WIDTH: 120,
  /** lineWidth: 0 disables wrapping — used for metadata files */
  LINE_WIDTH_NONE: 0,
} as const;

export const UI_SYMBOLS = {
  CHECKBOX_CHECKED: "[x]",
  CHECKBOX_UNCHECKED: "[ ]",
  CHEVRON: "\u276F",
  CHEVRON_SPACER: " ",
  SELECTED: "\u2713",
  UNSELECTED: "\u25CB",
  CURRENT: "\u25CF",
  SKIPPED: "\u2013",
  DISCOURAGED: "!",
  DISABLED: "\u2013",
  LOCK: "\uD83D\uDD12",
  EJECT: "\u23CF",
  BULLET: "\u2022",
  SCROLL_UP: "\u25B2",
  SCROLL_DOWN: "\u25BC",
  CHECK: "\u2713",
  CROSS: "\u2717",
} as const;

export const GITHUB_SOURCE = {
  HTTPS_PREFIX: "https://github.com/",
  GITHUB_PREFIX: "github:",
  GH_PREFIX: "gh:",
} as const;

export const DEFAULT_SKILLS_SUBDIR = "skills";

/** Strict kebab-case: starts with letter, segments separated by single hyphens, no trailing hyphens */
export const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

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

/** Fallback name for the default public marketplace when marketplace.json is unavailable */
export const DEFAULT_PUBLIC_SOURCE_NAME = "agents-inc";

/** Human-readable labels for skill source types shown in the wizard and edit command */
export const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  public: "Public",
  eject: "Eject",
  "agents-inc": "Agents Inc",
};

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

export const ASCII_LOGO = ` █████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗      ██╗███╗   ██╗ ██████╗
██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔════╝      ██║████╗  ██║██╔════╝
███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ███████╗      ██║██╔██╗ ██║██║
██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║      ██║██║╚██╗██║██║
██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ███████║      ██║██║ ╚████║╚██████╗
╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝      ╚═╝╚═╝  ╚═══╝ ╚═════╝`;
