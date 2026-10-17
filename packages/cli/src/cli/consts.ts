import os from "os";
import path from "path";
import { fileURLToPath } from "url";

import { DEFAULT_PLUGIN_NAME } from "@workspace/compile";

export {
  CLAUDE_DIR,
  CLI_INVOKE_COMMAND,
  DEFAULT_PLUGIN_NAME,
  DEFAULT_PUBLIC_SOURCE_NAME,
  DIRS,
  EJECT_SOURCE,
  GLOBAL_CONFIG_NAME,
  LOCAL_PSEUDO_CATEGORY,
  LOCAL_SKILLS_PATH,
  PLUGIN_MANIFEST_FILE,
  PROVIDERS,
  SKILLS_DIR_PATH,
  SOURCE_ROOT_DIR,
  SOURCE_SRC_DIR,
  sourceDirName,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "@workspace/compile";

export type { Provider } from "@workspace/compile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Built dist/ is flat (one level up); src/cli/ is two.
const isInDist = __dirname.includes("/dist");
const CLI_ROOT = isInDist ? path.resolve(__dirname, "..") : path.resolve(__dirname, "../..");
export const PROJECT_ROOT = CLI_ROOT;

export const PLUGINS_SUBDIR = "plugins";
export const PLUGIN_MANIFEST_DIR = ".claude-plugin";
export const MARKETPLACE_JSON = "marketplace.json";

/** A marketplace's whole matrix as JSON (`matrixSchema` shape), fetched directly by the editor. */
export const CATALOG_JSON = "catalog.json";

/** `generatedAt` on a matrix written to disk: fixed so regeneration without change yields no diff. */
export const GENERATED_AT_BUILD = "build";

export const PLUGINS_DIST_PATH = "dist/plugins";

export function marketplaceManifestPath(dir: string): string {
  return path.join(dir, PLUGIN_MANIFEST_DIR, MARKETPLACE_JSON);
}

/** A function, not a const: the home must be read at call time so tests can redirect it. */
export function globalInstallRoot(): string {
  return os.homedir();
}

export function cacheRoot(): string {
  return path.join(os.homedir(), ".cache", DEFAULT_PLUGIN_NAME);
}

// The `/editor` segment is required: the apex serves the landing page, which ignores `?fromId=`.
export const EDITOR_URL = "https://agentsinc.sh/editor";

/** Same form as the editor's own Share button copies. */
export function editorConfigUrl(id: string): string {
  return `${EDITOR_URL}/?fromId=${encodeURIComponent(id)}`;
}

export const SKILL_CATEGORIES_PATH = "config/skill-categories.ts";
export const SKILL_RULES_PATH = "config/skill-rules.ts";
export const STACKS_FILE_PATH = "config/stacks.ts";
export const DEFAULT_VERSION = "1.0.0";

export const DEFAULT_DISPLAY_VERSION = "0.0.0";

// Raw GitHub URLs so `$schema` comments resolve without the CLI installed; must track the
// repository name and this package's path in it.
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
  /** 0 disables wrapping. */
  LINE_WIDTH_NONE: 0,
} as const;

const CHECK_GLYPH = "\u2713";
const EN_DASH_GLYPH = "\u2013";

export const UI_SYMBOLS = {
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
  REMOVED: "-",
  ADDED: "+",
} as const;

export const GITHUB_SOURCE = {
  HTTPS_PREFIX: "https://github.com/",
  GITHUB_PREFIX: "github:",
  GH_PREFIX: "gh:",
} as const;

export const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export const AUTHOR_HANDLE_PATTERN = /^@[a-z][a-z0-9-]*$/;

export const HASH_PREFIX_LENGTH = 7;

export const CACHE_HASH_LENGTH = 16;

export const CACHE_READABLE_PREFIX_LENGTH = 32;

// Parse-boundary size limits (DoS prevention).
const ONE_MB = 1024 * 1024;
export const MAX_MARKETPLACE_FILE_SIZE = 10 * ONE_MB;
export const MAX_PLUGIN_FILE_SIZE = ONE_MB;
export const MAX_CONFIG_FILE_SIZE = ONE_MB;

export const MAX_JSON_NESTING_DEPTH = 10;
export const MAX_MARKETPLACE_PLUGINS = 10_000;

export const SCROLL_VIEWPORT = {
  SCROLL_INDICATOR_HEIGHT: 1,
} as const;

export const MIN_TERMINAL_SIZE = {
  COLS: 80,
  ROWS: 20,
} as const;

export const DEFAULT_BRANDING = {
  NAME: "Agents Inc.",
} as const;

/**
 * Tells the public catalogue apart from a marketplace merely named `DEFAULT_PUBLIC_SOURCE_NAME`.
 * Shared by the build-time and load-time reserved-name guards so they agree.
 */
export const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

export const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  public: "Public",
  eject: "Eject",
  "agents-inc": "Agents Inc",
};

export function formatSourceDisplayName(source: string): string {
  return SOURCE_DISPLAY_NAMES[source] ?? source;
}

/** Marketplace-row value when every selected skill is ejected. */
export const ALL_SKILLS_EJECTED_LABEL = "All skills ejected";

export const CLI_COLORS = {
  PRIMARY: "#99FFFF",
  SUCCESS: "#90EE90",
  ERROR: "#DC343B",
  WARNING: "#E6A817",
  NEUTRAL: "#888888",
  WHITE: "#FFFFFF",
  DIM: "#666666",
  GRAY_1: "#ddd",
  LABEL_BG: "#383838",
  HOVER_BG: "#333333",
} as const;

/** Deliberately ignores `branding.name`: the mark is the product's, not the installation's. */
export const ASCII_LOGO = ` █████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗      ██╗███╗   ██╗ ██████╗
██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔════╝      ██║████╗  ██║██╔════╝
███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ███████╗      ██║██╔██╗ ██║██║
██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║      ██║██║╚██╗██║██║
██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ███████║      ██║██║ ╚████║╚██████╗
╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝      ╚═╝╚═╝  ╚═══╝ ╚═════╝`;
