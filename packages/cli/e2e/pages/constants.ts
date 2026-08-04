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
  BUILD_FOOTER: "Labels", // Build-step-only footer hint (the Labels indicator) — always rendered on first build frame. (The "Filter incompatible" hint that previously anchored this sentinel is gated off behind FEATURE_FLAGS.FILTER_INCOMPATIBLE.)
  SCOPE: "Scope", // Build/agents-step footer hotkey label — rendered only for genuine project-scope edits (hidden when isEditingFromGlobalScope is true).
  CATEGORY_FRAMEWORK: "Framework", // Category label passed as an argument, not a step sentinel like BUILD
  SOURCES: "Customize skill sources",
  AGENTS: "Select agents",
  CONFIRM: "to install",

  // Completion
  INIT_SUCCESS: "initialized successfully",
  EDIT_SUCCESS: "Done",
  EDIT_UNCHANGED: "No changes made",
  COMPILE_SUCCESS: "Compiled",
  COMPILE_COMPLETE: "compile complete", // Matches "Global/Project compile complete!" (case-sensitive)
  CONFIG_LOAD_FAILED: "could not be loaded", // Corrupt-config error phrase from ConfigLoadError
  EJECT_SUCCESS: "Eject complete!",
  IMPORT_SUCCESS: "Import complete:",
  UNINSTALL_SUCCESS: "Uninstall complete!",

  // Status / progress
  LOADING_SKILLS: "Loading skills",
  RECOMPILING: "Recompiling agents",
  NO_AGENTS_TO_RECOMPILE: "No agents to recompile",
  COMPILE_GLOBAL_SCOPE_HINT: "global-scoped — run", // Stable fragment of the project-context compile hint
  CONFIG_TYPES_REFRESHED: "Refreshed config-types.ts", // Per-pass compile line after config-types regeneration
  SKILL_NOT_FOUND_WARNING: "is configured but was not found", // Compile warning for a config-listed skill with no installed files
  COMPILE_PASS_NO_SKILLS: "No skills found for", // Per-pass zero-skill line: "No skills found for global/project pass, skipping"
  COMPILE_NO_SKILLS_ERROR: "No skills found. Add skills with", // Hard error when every compile pass discovered zero skills
  PROPAGATED_RECOMPILE_ONE: "Recompiled agents in 1 registered projects", // Summary after a global-scope change fans out to one registered project
  // Command-agnostic prefix of the same summary. `init` prints "... 1 registered
  // projects" and `edit` prints "... 1 registered project(s)", so a spec that must
  // hold across commands — or that asserts the line's ABSENCE before the command
  // that owes it has been given one — anchors on this instead of a whole line.
  PROPAGATED_RECOMPILE: "Recompiled agents in",
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
  UNINSTALL_CONFIG_SECTION: "Config:", // Removal-plan section header for the .claude-src/ manifest
  UNINSTALL_PROJECTS_UPDATED_ONE: "Updated 1 registered project", // Global-uninstall summary after pruning one registered project's global entries
  UNINSTALL_PROJECT_SKIPPED: "Could not update registered project at", // Warn prefix for an unreachable registered project during global uninstall
  UNINSTALL_CONFIG_UNREADABLE: "Could not read the project config", // Warn prefix when uninstall continues past a config it cannot parse

  // Sources step
  CONFIGURED_MARKETPLACES: "Configured marketplaces",
  ADD_SOURCE: "Add source",
  // Status line the settings overlay paints after `addSource` resolved the
  // marketplace and wrote it to config.ts — the sentinel proving the add
  // COMPLETED rather than merely that the input was submitted. The full line is
  // `Added "<name>" (<n> skills)`; the opening quote is kept so it cannot match
  // narrative prose elsewhere in the frame.
  SOURCE_ADDED: 'Added "',

  // Scope group labels. The info panel, the confirm step and the Sources grid's left-hand gutter
  // all head their per-scope blocks with these words. Paired with `SCOPE` above, which is the
  // caption the Sources grid must NOT print over that gutter — the labels already name it.
  SCOPE_GLOBAL: "Global",
  SCOPE_PROJECT: "Project",

  // Dashboard
  DASHBOARD: "Doctor",

  // UI elements
  FOOTER_SELECT: "select", // Footer text used for stable render detection
  // The whole footer as one unbroken line, with the exact spacing WizardFooter
  // renders (label backgrounds pad each key, columnGap 2 separates the hints).
  // Asserting the line rather than the individual words is what catches a step's
  // rows painting over the footer: a bleed leaves every word present but splices
  // the overflowing content between them.
  FOOTER_HOTKEY_ROW: "SPACE  select   ENTER  continue   ESC  back",
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

  // Terminal size warnings. All three come from one formatter
  // (formatTerminalTooSmallMessage in src/cli/utils/terminal.ts), printed by
  // BOTH size gates: the pre-Ink startup gate in BaseCommand and the
  // WizardLayout guard that catches a terminal shrinking mid-session.
  TOO_NARROW: "too narrow",
  TOO_SHORT: "too short",
  // Dimension-independent tail of the same message — the sentinel to wait on
  // when either dimension may be the one that tripped the gate.
  RESIZE_PROMPT: "Please resize",

  // A run of block glyphs from the stack step's ASCII banner (ASCII_LOGO in
  // src/cli/consts.ts). The wizard paints `█` nowhere else, so this string's
  // presence in a frame IS the banner's presence. The banner is height-gated on
  // LOGO_MIN_TERMINAL_ROWS in src/cli/consts.ts — below that height it is
  // dropped, because its six rows otherwise starve the stack list's viewport
  // until the shared scroll gate stops clipping and the rows bleed.
  LOGO_BANNER: "█████╗",

  // Scroll overflow affordance (ScrollAffordance in src/cli/components/wizard/scroll-affordance.tsx).
  // Text-only "N more below" / "N more above" hints painted when a viewport clips its content.
  SCROLL_MORE_BELOW: "more below",
  SCROLL_MORE_ABOVE: "more above",

  // Summary-panel header block (summary-panel.tsx). Two label/value rows above a
  // dimmed divider. Label and value are separate <Text> nodes in a flex row with
  // columnGap 1, so each renders as "<label> <value>" on one line — compose the
  // expected line as `${PANEL_MARKETPLACE} ${SOURCE_DISPLAY_DEFAULT}`.
  PANEL_MARKETPLACE: "Marketplace",
  PANEL_STACK: "Stack",
  // Literal fallback rendered in the Stack row when no stack is selected.
  PANEL_STACK_NONE: "none",
  // formatSourceDisplayName("agents-inc"). The Marketplace row names the distinct
  // marketplaces the selected skills' `SkillConfig.source` values point at, and the
  // E2E source carries no marketplace.json, so every skill resolves to
  // DEFAULT_PUBLIC_SOURCE_NAME and the row reads as this. Drive the wizard through
  // `setAllLocal()` and it says "All skills ejected" instead — an eject source names
  // no marketplace.
  SOURCE_DISPLAY_DEFAULT: "Agents Inc",
} as const;

export const TIMEOUTS = {
  /**
   * Spawn → first wizard frame (and the BaseStep default wait timeout).
   * Sized like WIZARD_TRANSITION below, for the same reason: individual runs
   * land in ~1–2s, but init against a real marketplace under full-suite
   * parallel load can sit at "Loading skills..." well past 15s.
   */
  WIZARD_LOAD: 45_000,
  /**
   * Enter → next-wizard-view first-frame waits (e.g. init → dashboard render,
   * dashboard selectEdit → build step first frame, EditWizard.launch → build
   * step first frame). Sized to absorb full-suite parallelism load:
   * individual runs land in ~1–2s, but contention can push these transitions
   * past 15s. Do NOT use for intra-step waits.
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
  /**
   * Smallest viewport that still clears the wizard's own minimum-size gate
   * (`MIN_TERMINAL_SIZE` in src/cli/consts.ts — 80 cols / 20 rows). Wide enough
   * to render normally, short enough that any step whose content exceeds the
   * viewport must clip and signal the overflow.
   *
   * `rows` must track that gate exactly: one row lower and every spec using this
   * hangs on "Terminal too short. Please resize." until its timeout, one row
   * higher and the specs stop being the tightest geometry the wizard supports.
   * The value is duplicated rather than imported because this file is
   * deliberately free of src/cli imports.
   */
  SHORT: { rows: 20, cols: 100 },
  /**
   * BELOW the gate — the geometry a mid-session shrink has to be caught at.
   *
   * Never LAUNCH a session here: the startup gate blocks before Ink mounts and
   * the session sits on the resize prompt until its timeout. Reach it only by
   * resizing a session that started larger (`BaseStep.resizeBelowMinimum`).
   */
  BELOW_MINIMUM: { rows: 16, cols: 100 },
} as const;

/** Which wizard a shared step page object is driving. */
export type WizardType = "init" | "edit";
