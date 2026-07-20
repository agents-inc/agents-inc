// --- e2e/pages/constants.ts ---
// Self-contained E2E constants. NO imports from src/cli/.

export const DIRS = {
  CLAUDE: ".claude",
  CLAUDE_SRC: ".claude-src",
  SKILLS: "skills",
  AGENTS: "agents",
  PLUGINS: "plugins",
  PLUGIN_MANIFEST: "plugin-manifest",
} as const;

export const FILES = {
  CONFIG_TS: "config.ts",
  CONFIG_TYPES_TS: "config-types.ts",
  SKILL_MD: "SKILL.md",
  METADATA_YAML: "metadata.yaml",
  SETTINGS_JSON: "settings.json",
  INSTALLED_PLUGINS_JSON: "installed_plugins.json",
  IDENTITY_MD: "identity.md",
  PLAYBOOK_MD: "playbook.md",
  PLUGIN_JSON: "plugin.json",
} as const;

/** Text that identifies each wizard step. Centralized so UI changes update one place. */
export const STEP_TEXT = {
  // Step identification
  STACK: "Choose a stack",
  DOMAINS: "Select domains",
  DOMAIN_WEB: "Web",
  DOMAIN_API: "API",
  DOMAIN_META: "Methodology",
  DOMAIN_MOBILE: "Mobile",
  BUILD: "Framework", // First category visible in build step
  BUILD_FOOTER: "Filter incompatible", // Build-step-only footer hint — always rendered on first build frame
  CATEGORY_FRAMEWORK: "Framework", // Category label passed as an argument, not a step sentinel like BUILD
  SOURCES: "Customize skill sources",
  AGENTS: "Select agents",
  CONFIRM: "to install",

  // Completion
  INIT_SUCCESS: "initialized successfully",
  EDIT_SUCCESS: "Done",
  EDIT_UNCHANGED: "No changes made",
  COMPILE_SUCCESS: "Compiled",
  EJECT_SUCCESS: "Eject complete!",
  IMPORT_SUCCESS: "Import complete:",
  UNINSTALL_SUCCESS: "Uninstall complete!",

  // Status / progress
  LOADING_SKILLS: "Loading skills",
  RECOMPILING: "Recompiling agents",
  LOADED: "Loaded",
  LOADED_LOCAL: "Loaded from local:",
  LOADED_SKILL: "Loaded skill:", // Verbose loader line prefix
  COMPILED_LIST: "Compiled:", // Verbose compile listing prefix, distinct from COMPILE_SUCCESS

  // Prompts
  CONFIRM_UPDATE: "Proceed with update?",
  CONFIRM_UNINSTALL: "Are you sure you want to uninstall",
  SEARCH: "Search Skills",
  UNINSTALL_PREVIEW: "The following will be removed", // Loose form for waitForText
  UNINSTALL_PREVIEW_HEADING: "The following will be removed:", // Exact rendered heading

  // Sources step
  CONFIGURED_MARKETPLACES: "Configured marketplaces",
  ADD_SOURCE: "Add source",

  // Dashboard
  DASHBOARD: "Doctor",

  // UI elements
  FOOTER_SELECT: "select", // Footer text used for stable render detection
  START_FROM_SCRATCH: "Start from scratch",
  TOGGLE_SELECTION: "Toggle selection",
  NO_INSTALLATION: "No installation found",

  // Installation output
  INSTALLING_PLUGINS: "Installing skill plugins",
  INSTALLING_PLUGINS_ELLIPSIS: "Installing skill plugins...", // Exact rendered form; the bare form stays for negative assertions
  PLUGIN_NATIVE: "Plugin (native install)",
  SKILLS_COPIED_TO: "Skills copied to:",
  AGENTS_COMPILED_TO: "Agents compiled to:",
  CONFIGURATION_LABEL: "Configuration:",
  READY_TO_INSTALL: "Ready to install",
  NO_SKILLS_FOUND: "No skills found",
  UNINSTALL_CANCELLED: "Uninstall cancelled",

  // Scope warnings
  GLOBAL_SKILLS_BLOCKED: "Global skills cannot be changed from project scope",
  GLOBAL_AGENTS_BLOCKED: "Global agents cannot be changed from project scope",

  // Terminal size warnings
  TOO_NARROW: "too narrow",
  TOO_SHORT: "too short",
} as const;

export const TIMEOUTS = {
  WIZARD_LOAD: 15_000,
  /**
   * Enter → next-wizard-view first-frame waits (e.g. init → dashboard render,
   * dashboard selectEdit → build step first frame, EditWizard.launch → build
   * step first frame). Higher than WIZARD_LOAD to absorb full-suite
   * parallelism load: individual runs land in ~1–2s, but contention can push
   * these transitions past 15s. Do NOT use for intra-step waits.
   */
  WIZARD_TRANSITION: 45_000,
  INSTALL: 30_000,
  PLUGIN_INSTALL: 60_000,
  /** Combined timeout for tests that include plugin operations + exit wait */
  PLUGIN_TEST: 60_000 + 30_000, // PLUGIN_INSTALL + EXIT_WAIT
  EXIT: 10_000,
  /** Default session timeout, doubled in CI for slower environments */
  SESSION_DEFAULT: 10_000,
  SESSION_DEFAULT_CI: 20_000,
  EXIT_WAIT: 30_000,
  SETUP: 60_000,
  /** Doubled setup budget for beforeAll hooks that build two sources (dual-scope, plugin source). */
  SETUP_DUAL: 60_000 * 2, // SETUP * 2
  LIFECYCLE: 180_000,
  EXTENDED_LIFECYCLE: 300_000,
  INTERACTIVE: 120_000,
} as const;

// Internal to the framework — NOT exported to tests
export const INTERNAL_DELAYS = {
  STEP_TRANSITION: 500,
  KEYSTROKE: 150,
} as const;

/**
 * Retry budget for closed-loop Enter presses on Ink components that may drop
 * the first keystroke if the useInput handler is not mounted yet under load.
 * Framework-internal — NOT for test files.
 */
export const INTERNAL_RETRIES = {
  /** Max re-presses before giving up (total budget = MAX_ATTEMPTS * INTERVAL_MS). */
  MAX_ATTEMPTS: 5,
  /** Time to wait for the expected post-input sentinel before re-pressing. */
  INTERVAL_MS: 3_000,
} as const;

export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  INVALID_ARGS: 2,
  NETWORK_ERROR: 3,
  CANCELLED: 4,
  UNKNOWN_COMMAND: 127,
} as const;

/** Paths within a skills source directory, duplicated from src/cli/consts.ts. */
export const SOURCE_PATHS = {
  SKILLS_DIR: "src/skills",
  SKILL_CATEGORIES: "config/skill-categories.ts",
  SKILL_RULES: "config/skill-rules.ts",
  STACKS_FILE: "config/stacks.ts",
  PLUGIN_MANIFEST_DIR: ".claude-plugin",
  PLUGINS_DIST: "dist/plugins", // Mirrors PLUGINS_DIST_PATH in src/cli/consts.ts
} as const;

/**
 * Terminal geometry overrides for CLI sessions. The unset defaults live in
 * e2e/helpers/terminal-session.ts and are deliberately not mirrored here.
 */
export const TERMINAL_SIZE = {
  /** Tall viewport used by wizard flows that need the full build grid visible. */
  TALL: { rows: 60, cols: 120 },
} as const;

/** Which wizard a shared step page object is driving. */
export type WizardType = "init" | "edit";
