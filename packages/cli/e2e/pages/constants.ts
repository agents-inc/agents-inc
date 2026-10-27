// Mirrors product values instead of importing them, so an assertion fails when the product moves.
// `scripts/check-mirrored-constants.ts` holds mirrored values to their source.

import { matchedAsWritten } from "../../src/cli/lib/__tests__/helpers/matched-as-written.js";

export const DIRS = {
  CLAUDE: ".claude",
  /** Mirrors `SOURCE_ROOT_DIR`. */
  SOURCE_ROOT: ".agents-inc",
  /** `sourceDirName("claude")`; two segments, so unusable with `listFiles`. */
  SOURCE_CLAUDE: ".agents-inc/claude",
  /** `sourceDirName("codex")`; marks a Codex installation. */
  SOURCE_CODEX: ".agents-inc/codex",
  /** Mirrors `RETIRED_SOURCE_FOLDER`. */
  RETIRED_SOURCE: ".claude-src",
  SKILLS: "skills",
  AGENTS: "agents",
  /** Mirrors `STANDARD_DIRS.EXAMPLES`. */
  EXAMPLES: "examples",
  PLUGINS: "plugins",
  PLUGIN_MANIFEST: "plugin-manifest",
  // Codex's home/project state dir, and where a project's Codex skills live.
  CODEX: ".codex",
  CODEX_PROJECT_SKILLS: ".agents/skills",
  // The Claude CLI's session-state backups under its config dir.
  CLAUDE_BACKUPS: "backups",
  /** Mirrors `cacheRoot()` under HOME: the CLI's saved copies, not giget's tarballs beside them. */
  SOURCE_CACHE: ".cache/agents-inc",
  /** One saved copy per marketplace, named by `sanitizeSourceForCache`. */
  SOURCE_CACHE_COPIES: ".cache/agents-inc/sources",
  /** Mirrors giget's `cacheDirectory()` under HOME: the tarballs it saved. */
  GIGET_CACHE: ".cache/giget",
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
  /** Mirrors `STANDARD_FILES.REFERENCE_MD`. */
  REFERENCE_MD: "reference.md",
  MARKETPLACE_JSON: "marketplace.json",
  CATALOG_JSON: "catalog.json",
  PACKAGE_JSON: "package.json",
  CODEX_AGENT_EXTENSION: ".toml",
  // The Claude CLI's session record and lock; golden trees leave them unpinned.
  CLAUDE_SESSION_JSON: ".claude.json",
  CLAUDE_SESSION_LOCK: ".claude.json.lock",
} as const;

export const STEP_TEXT = {
  INIT_SUCCESS: "initialized successfully",
  EDIT_SUCCESS: "Done",
  EDIT_UNCHANGED: "No changes made",
  // Positive proof of changes; EDIT_UNCHANGED's absence is also true of a crashed run.
  EDIT_CHANGES_HEADING: "Changes:",
  COMPLETED_WITH_FAILURES: "the changes above landed, these did not",
  COMPILE_SUCCESS: "Compiled",
  COMPILE_COMPLETE: "compile complete", // "Global/Project compile complete!"
  CONFIG_LOAD_FAILED: "could not be loaded", // ConfigLoadError
  // Single unbroken tokens: oclif word-wraps error text at the terminal width.
  CONFIG_UNREADABLE_RECREATE: "recreate",
  // `LOCAL_EDITOR_URL`: every e2e worker runs on this machine, so every printed link opens it.
  EDITOR_URL: "http://localhost:5173/editor",
  // `DEFAULT_EDITOR_URL`, beside a worker elsewhere.
  LIVE_EDITOR_URL: "https://agentsinc.sh/editor",
  // The two above without their scheme, as help text names the editor.
  EDITOR_ADDRESS: "localhost:5173/editor",
  LIVE_EDITOR_ADDRESS: "agentsinc.sh/editor",
  CONFIG_UNREADABLE_DOCTOR: "doctor",
  // Composed with ` '<path>'`.
  CONFIG_UNREADABLE_GLOBAL: "The global installation's config at",
  CONFIG_UNREADABLE_PROJECT: "This project's config at",
  // Composed with ` '<folder>'`, so the remedy names which installation to uninstall.
  CONFIG_UNREADABLE_RECREATE_FROM: "'npx agents-inc uninstall' from",
  CONFIG_UNREADABLE_INSTALL_BY_ID: "'npx agents-inc init --from <id>'",
  EJECT_SUCCESS: "Eject complete!",
  UNINSTALL_SUCCESS: "Uninstall complete!",

  LOADING_SKILLS: "Loading skills",
  RECOMPILING: "Recompiling agents",
  NO_AGENTS_TO_RECOMPILE: "No agents to recompile",
  // "<n> agents rewritten, <m> unchanged".
  AGENTS_REWRITTEN: "agents rewritten",
  UNCHANGED: "unchanged",
  AGENTS_NOT_COMPILED: "did not compile",
  RECOMPILATION_FAILED: "Agent recompilation failed",
  // The remedy's claim about disk, not its lead-in.
  RECOMPILE_STALE_REMEDY: "the compiled agents on disk are stale until you do",
  /** `INCOMPLETE_WORK_RECOVERY.DELETE_AGENT_FILE`. */
  DELETE_AGENT_FILE_REMEDY:
    "Claude Code loads a compiled sub-agent this project no longer configures",
  // Includes "agent": other lines also end in `(1 failed)`.
  COMPILED_WITH_FAILURES: "agent (1 failed)",
  COMPILE_GLOBAL_SCOPE_HINT: "global-scoped — run",
  CONFIG_TYPES_REFRESHED: "Refreshed config-types.ts",
  SKILL_NOT_FOUND_WARNING: "is configured but was not found",
  // Suppressed in the unit suite, so only assertable here.
  STACK_SKILL_ABSENT_FROM_MATRIX: "not found in matrix",
  // The decision half, not the diagnosis; `withdrawnSkillsWarning` in lib/loading/source-loader.ts.
  STACK_SKILL_LEFT_OUT: "Left out of the stack — selecting it",
  // `extractLocalSkill`.
  LOCAL_SKILL_PLACEHOLDER_CATEGORY: "is a placeholder, not a real category",
  COMPILE_PASS_NO_SKILLS: "No skills found for", // "No skills found for global/project pass, skipping"
  SOURCE_HAS_NEWER_CONTENT: "Marketplace has newer content",
  SOURCE_UNREACHABLE_CACHED: "using the cached copy, which may be out of date",
  // `createDetailedFetchError`, for a marketplace answering 404 and 403; the URL follows each.
  MARKETPLACE_REPOSITORY_NOT_FOUND: "Repository not found:",
  MARKETPLACE_ACCESS_DENIED: "Access denied to:",
  // The same, for a 401, and for any status it has no message of its own for (a 410 among them).
  MARKETPLACE_AUTHENTICATION_REQUIRED: "Authentication required for:",
  MARKETPLACE_FETCH_FAILED: "Failed to fetch",
  // `sourceRefusedUsingCache`: `<url> refused the request (<status>) — ` and then
  // `SOURCE_UNREACHABLE_CACHED`.
  MARKETPLACE_REFUSED_CACHED: "refused the request",
  // `extractAllSkills`.
  MARKETPLACE_METADATA_UNPARSEABLE: "unparseable metadata.yaml",
  MARKETPLACE_METADATA_NO_DISPLAY_NAME:
    "invalid metadata.yaml — missing required field: displayName",
  MARKETPLACE_SKILL_MD_MISSING: "No SKILL.md found",
  RESERVED_NAME_MANIFEST_WAY_OUT: "rename the marketplace",
  RECORDED_MARKETPLACE_NAME_FIELD: "marketplaceName",
  // `skippedSkills`, for a skill no marketplace ships.
  CATALOG_DOES_NOT_KNOW: "this catalog does not know:",
  // The same skip, for a skill the marketplace ships and could not load.
  CATALOG_COULD_NOT_LOAD: "this catalog could not load:",
  // `skippedSkills`, the line naming the sub-agents installed without a skill.
  INSTALLED_WITHOUT_THE_SKILL: "carrying nothing else this catalog knows:",
  UNRESOLVED_SLUG: "Unresolved slug",
  // `checkMatrixHealth`'s prefix; doctor's Marketplaces row omits it.
  MATRIX_HEALTH_SAID: "[matrix]",
  // `claimSlug`.
  DUPLICATE_SLUG: "Duplicate slug",
  // Short: a longer fragment straddles the oclif error-box wrap.
  COMPILE_NO_SKILLS_ERROR: "No skills found. Run",
  COMPILE_NO_SKILLS_REMEDY: "init",
  // Inside an oclif error box: assert through `flattenCliOutput`.
  COMPILE_METADATA_UNUSABLE: "does not describe",
  COMPILE_METADATA_MISSING_FIELD: "missing required field",
  // `judgeSkillMetadata`.
  INSTALLED_SKILL_METADATA_MISSING: "is missing metadata.yaml — skipped",
  // Assert through `flattenCliOutput`.
  METADATA_UNUSABLE_WAY_OUT: "Fix the file, or delete the skill directory",
  // Every project reached and recompiled, whether or not its files came out changed.
  PROPAGATED_RECOMPILE_ONE: "Registered projects: 1 recompiled",
  // `BaseCommand.reportPropagatedRecompile`.
  PROPAGATED_RECOMPILE: "Registered projects:",
  // Composed as `${PROPAGATED_RECOMPILE} <n> ${PROPAGATED_RECOMPILED}`, with no unchanged count.
  PROPAGATED_RECOMPILED: "recompiled",
  LOADED: "Loaded",
  LOADED_SKILL: "Loaded skill:",
  COMPILED_LIST: "Compiled:",
  // `provenanceMarker()`, assembled from parts, so no mirror check can hold it.
  PROVENANCE_MARKER: "<!-- Generated by agents-inc — do not edit; compile rewrites this file -->",

  // Short: oclif wraps warn/error text.
  UPDATE_HELP_SUMMARY: "Refresh the marketplaces this installation uses",
  EDIT_HELP_SUMMARY: "Open this installation in the editor, or apply a configuration with --from",
  UPDATE_EJECTED_OWNED: "Ejected skills are yours to own",
  UPDATE_NO_MARKETPLACES: "No plugin marketplaces are configured",
  UPDATE_MARKETPLACE_REFRESHED: "Updated marketplace",
  UPDATE_COMPLETE: "Update complete!",
  UPDATE_PLUGINS_UNCHANGED: "Installed plugins were not changed",
  UPDATE_NO_CLAUDE_CLI: "Claude CLI not found",

  CONFIRM_UNINSTALL: "Are you sure you want to uninstall",
  UNINSTALL_PROJECTS_UPDATED_ONE: "Updated 1 registered project",
  UNINSTALL_PROJECT_SKIPPED: "Could not update registered project at",
  // Composed as `${SKIPPED_REGISTERED_PROJECT} <path>: ${REGISTERED_PROJECT_CONFIG_UNREADABLE}`.
  SKIPPED_REGISTERED_PROJECT: "Skipped",
  REGISTERED_PROJECT_CONFIG_UNREADABLE: "its config.ts can't be read.",
  REGISTERED_PROJECT_GONE: "nothing is installed there any more.",
  REGISTERED_PROJECT_OTHER_PROVIDER: "it is another provider's installation.",
  REGISTERED_PROJECT_UPDATE_FAILED: "updating it failed.",
  UNINSTALL_PROJECT_CONFIG_UNREADABLE: "Could not read the project config",
  UNINSTALL_GLOBAL_CONFIG_UNREADABLE: "Could not read the global config",
  // Printed together; one alone cannot tell "found nothing" from "removed everything".
  UNINSTALL_NOTHING_TO_UNINSTALL: "Nothing to uninstall",
  UNINSTALL_NOT_INSTALLED: "is not installed in this project",
  UNINSTALL_NO_CHANGES_MADE: "No changes made.",
  UNINSTALL_AGENTS_KEPT_ONE: "Kept 1 agent in",
  UNINSTALL_AGENTS_KEPT_TWO: "Kept 2 agents in",
  UNINSTALL_AGENTS_KEPT_REASON: "no agents-inc marker",
  UNINSTALL_SOURCE_ROOT_REMOVED: "Removed .agents-inc/",
  UNINSTALL_SOURCE_ROOT_KEPT: "Kept .agents-inc/ (contains user content)",

  DASHBOARD: "Doctor",
  DASHBOARD_DOCTOR_FOCUSED: "❯ Doctor",
  // Heads each installation's block where one scope holds two.
  DASHBOARD_PROVIDER: "Provider:",

  DOCTOR_CONTENT_SECTION: "Content checks",
  DOCTOR_OPERATIONAL_SECTION: "Operational checks",
  // `formatOverLengthWarning`.
  DOCTOR_CLI_DESCRIPTION_OVER_LENGTH: "exceeds the recommended maximum",
  // `SKIP_AFTER_CONFIG_ERROR` in commands/doctor.ts.
  DOCTOR_SKIP_AFTER_CONFIG_ERROR: "Skipped — fix the content errors above first",
  // `skipRestatingContent`.
  DOCTOR_SKIP_RESTATING_SKILL_ERRORS:
    "Skipped — this row would only restate the skill errors above",
  // `SKIP_NO_INSTALLATION` in commands/doctor.ts.
  DOCTOR_SKIP_NO_INSTALLATION: "Skipped — no installation here (marketplace repository)",
  // Only the operational layer emits it.
  DOCTOR_CONFIG_CHECK: "Config Valid",
  // Anchor to the Config Valid row: Layout rows open with the same nouns.
  DOCTOR_CONFIG_THIS_PROJECT: "This project:",
  DOCTOR_CONFIG_THE_GLOBAL_INSTALLATION: "The global installation:",
  DOCTOR_CONFIG_USING_GLOBAL: "using the global installation's",
  /** `UI_SYMBOLS.CHECK`. */
  DOCTOR_STATUS_PASS: "\u2713",
  /** `UI_SYMBOLS.SKIPPED`. */
  DOCTOR_STATUS_SKIP: "\u2013",
  /** Mirrors `UI_SYMBOLS.CROSS`. */
  DOCTOR_STATUS_FAIL: "\u2717",
  DOCTOR_ROW_PLACEMENTS: "Placements Offered",
  DOCTOR_ROW_SKILLS_RESOLVED: "Skills Resolved",
  DOCTOR_ROW_AGENTS_COMPILED: "Agents Compiled",
  DOCTOR_ROW_NO_ORPHANS: "No Orphans",
  DOCTOR_ROW_SKILLS_INSTALLED: "Skills Installed",
  DOCTOR_ROW_PLUGINS_INSTALLED: "Plugins Installed",
  DOCTOR_ROW_SOURCE_REACHABLE: "Marketplace Reachable",
  // `CONTENT_CHECKS` in commands/doctor.ts.
  DOCTOR_ROW_MARKETPLACES: "Marketplaces",
  // `INSTALLATIONS_ROW_NAME` and `SOURCE_REPO_ROW_NAME` in commands/doctor.ts.
  DOCTOR_ROW_INSTALLATIONS: "Installations",
  DOCTOR_ROW_MARKETPLACE_REPOSITORY: "Marketplace Repository",
  // Composed after the number of installations.
  DOCTOR_INSTALLATIONS_EACH_CHECKED: "installations here, each checked below",
  DOCTOR_NO_ORPHANED_AGENTS: "No orphaned agent files",
  DOCTOR_CONFIG_IS_VALID: "is valid",
  DOCTOR_SOURCE_LOCAL: "Connected to local:",
  // The address follows the space.
  DOCTOR_SOURCE_REMOTE: "Connected to remote: ",
  DOCTOR_SKILLS_AVAILABLE: "skills available",
  DOCTOR_ONE_SKILL_AVAILABLE: "1 skill available",
  // Whole: both halves are the claim (which marketplace, and that the network reached it).
  DOCTOR_MARKETPLACE_DEFAULT_REACHED:
    "Reached github:agents-inc/skills over the network — nothing here names one, so this is the default",
  DOCTOR_AGENTS_NEED_RECOMPILATION: "recompilation",
  // The half without `CLI_INVOKE_COMMAND`; never assert the bare word "compile".
  DOCTOR_TIP_COMPILE_AGENTS: "to generate missing agent files",
  DOCTOR_TIP_CHECK_SKILL_IDS: "Check skill IDs in config match available skills",
  // `TIPS` in commands/doctor.ts.
  DOCTOR_TIP_RE_EJECT: "Re-eject the missing skills from the marketplace to restore their files",
  DOCTOR_SUMMARY: "Summary:",
  DOCTOR_SKILLS_VALIDATED: "skills validated",
  DOCTOR_AGENTS_VALIDATED: "agents validated",
  DOCTOR_ONE_MARKETPLACE_VALIDATED: "1 marketplace validated",
  DOCTOR_MARKETPLACE_LOAD_FAILED: "Failed to load marketplace",
  DOCTOR_SKILLS_SKIPPED_UNREACHABLE: "Skipped (marketplace unreachable)",
  // `ONLY_A_SAVED_COPY_CAME_BACK` in lib/loading/source-fetcher.ts.
  DOCTOR_DOWNLOAD_FAILED_SAVED_COPY: "the download failed and only a saved copy came back",
  DOCTOR_SAVED_COPY_REPLACED: "The saved copy differed from the marketplace and has been replaced",
  // `consumedMarketplaceMessage` in lib/source-validator.ts.
  DOCTOR_FOREIGN_MARKETPLACE_DEFECT: "Nothing to fix here",
  DOCTOR_CONFIG_UNREADABLE: "exists but could not be loaded",
  DOCTOR_CONFIG_NOT_FOUND: "config.ts not found",
  DOCTOR_CONFIG_DECLARES_NOTHING: "declares no skills and no agents",
  DOCTOR_ONE_CONFIG_VALIDATED: "1 config validated",
  DOCTOR_TIP_CREATE_CONFIG: "to create a configuration",
  DOCTOR_TIP_RECREATE_CONFIG: "still works on a config it cannot read",
  DOCTOR_TIP_NOTHING_CONFIGURED: "Nothing is configured yet",
  // `foreignSkillNote` in lib/content-validator.ts.
  DOCTOR_FOREIGN_SKILL_DIR: "not installed by this CLI",
  DOCTOR_UNOWNED_INSTALL: "no configuration declares them",
  // The tip's claim, not its lead-in (which stays true whatever the remedy says). The
  // `orphans-unowned` tip in commands/doctor.ts.
  DOCTOR_TIP_UNOWNED_INSTALL: "removes them, the compiled agents included",
  DOCTOR_SKIPPED_CONFIG_INVALID: "Skipped (config invalid)",
  DOCTOR_NO_SKILLS_CONFIGURED: "No skills configured",
  DOCTOR_NO_AGENTS_CONFIGURED: "No agents configured",
  // `loadConfig`'s reason, quoted by the finding.
  CONFIG_LOAD_REASON: "Failed to load config from",
  // `NO_VALID_DEFAULT_EXPORT`, the reason a config that declares nothing is refused.
  NO_VALID_DEFAULT_EXPORT: "the file has no valid default export",
  // `configUnreadableError`, which sends the reader to the marketplace's repository.
  MARKETPLACE_OWN_CONFIG: "This is the marketplace's own config rather than an installation's",

  NO_INSTALLATION: "No installation found",

  INSTALLING_PLUGINS: "Installing skill plugins",
  INSTALLING_PLUGINS_ELLIPSIS: "Installing skill plugins...",
  PLUGIN_NATIVE: "Plugin (native install)",
  EJECT_LOCAL_COPY: "Eject (local copy)",
  // `logModeSwitch`: `${PREFIX} ${n} ${SUFFIX} ${MODE}`.
  SWITCHING_SKILLS_PREFIX: "Switching",
  SWITCHING_SKILLS_SUFFIX: "skill(s) to",
  // `copyNewLocalSkills`: "Copied <n> local skill(s)".
  COPIED_LOCAL_SKILLS_PREFIX: "Copied",
  COPIED_LOCAL_SKILLS_SUFFIX: "local skill(s)",
  SKILLS_COPIED_TO: "Skills copied to:",
  AGENTS_COMPILED_TO: "Agents compiled to:",
  CONFIGURATION_LABEL: "Configuration:",
  NO_SKILLS_FOUND: "No skills found",
  UNINSTALL_CANCELLED: "Uninstall cancelled",
  RUN_CANCELLED: "Error: Cancelled",
  ROOT_HELP_USAGE: "$ agents-inc [COMMAND]",

  SHARED_CONFIG_EXISTING_INSTALL: "An installation already exists at",
  SHARED_CONFIG_UNINSTALL_HINT: "Run 'npx agents-inc uninstall'",
  SHARED_CONFIG_UNWRITABLE_PAIR: "these assignments have nowhere to be written",

  SHARED_CONFIG_PROJECT_SCOPE_AT_HOME: "these project-scoped entries have nowhere to be written",
  SHARED_CONFIG_PROJECT_SCOPE_HINT: "Run this from inside a project directory",
  // Assert on flattened output.
  SHARED_CONFIG_UNCARRIED_DESTINATION: "no shared configuration put those directories there",
  // Assert on flattened output.
  SHARED_CONFIG_ID_NAMES_NO_DIRECTORY: "under ids that are not a single directory name",
  SHARED_CONFIG_NOTHING_INSTALLABLE: "contains no skills this catalog can install",
  // Stops short of the ref, which oclif may wrap.
  SHARED_CONFIG_STACK_NOT_OFFERED: "is not a stack the source",
  SHARED_CONFIG_WRONG_VERSION: "is not in a format this version of the CLI can install",
  SHARED_CONFIG_RESHARE: "re-share the configuration",
  CODEX_MODEL_NOT_OFFERED:
    "which this version of the CLI does not offer, so it runs on the session's model. Offered: gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra and gpt-5.6-luna.",
  // Compare with spaces removed: oclif may break the list mid-token.
  CONFIG_MODEL_REFUSED:
    'agents.0.model: Invalid option: expected one of "sonnet"|"opus"|"haiku"|"fable"|"inherit"',
  CONFIG_CODEX_MODEL_REFUSED:
    'agents.0.codexModel: Invalid option: expected one of "gpt-6-astra"|"gpt-5.6-sol"|"gpt-5.6-terra"|"gpt-5.6-luna"',

  // The summary panel at a question, or where one would be: its header row, then its scope labels.
  PANEL_HEADER: "│  Marketplace ",
  PANEL_ALL_SKILLS_EJECTED: "│  Marketplace All skills ejected ",
  PANEL_PROJECT_SCOPE: " Project ",
  PANEL_GLOBAL_SCOPE: " Global ",

  // Short fragments: oclif wraps error text.
  SHARED_CONFIG_APPLY_CONFIRM: "Apply this configuration?",
  SHARED_CONFIG_NEEDS_TERMINAL: "no terminal here to confirm it at",
  UNINSTALL_NEEDS_TERMINAL: "Uninstalling removes files, so it has to be confirmed",
  UNINSTALL_NEEDS_TERMINAL_REMEDY: "uninstall --yes",
  INK_RAW_MODE_UNSUPPORTED: "Raw mode is not supported",
  SHARED_CONFIG_KEPT_AUTHORED: "written here rather than installed",
  SHARED_CONFIG_KEPT_UNPLACEABLE: "cannot place them",
  SHARED_CONFIG_KEPT_UNPLACEABLE_REMEDY: "then apply the configuration again",
  SHARED_CONFIG_KEPT_UNASSIGNED: "kept, no longer assigned to",
  SHARED_CONFIG_SLOT_OVERFULL: "is exclusive but holds",
  // `registeredProjectsRecompiled`.
  SHARED_CONFIG_REGISTERED_RECOMPILED: "is recompiled to match",
  SHARED_CONFIG_INSTALL_CONFIRM: "Install this configuration?",
  SHARED_CONFIG_KEPT_AS_INSTALLED: "Kept as installed in the global install",
  // `keptAsInstalledGlobally`'s route, after the command it hands out.
  SHARED_CONFIG_KEPT_CHANGE_FROM_HOME: "from your home directory.",
  // `subAgentChanged`: composed as `~ <name> (global): gains <skill>` under the panel.
  SUB_AGENT_CHANGED_GLOBALLY: "(global):",
  SUB_AGENT_GAINS: "gains",
  SUB_AGENT_LOSES: "loses",
  SHARED_CONFIG_ADDED_TO_GLOBAL: "Added to sub-agents in the global install",
  // Composed after "~ <name> ".
  EDIT_GLOBAL_SUB_AGENT_SKILLS_ADDED: "[G] (agent: skills added)",

  VALIDATION_REQUIRES: "requires:",

  SKILL_ASSIGNED_TO_NO_AGENT: "is assigned to no sub-agent",
  STACK_PAIR_DROPPED_BY_SCOPE: "cannot carry project-scoped skill",

  // `formatTerminalTooSmallMessage`.
  TOO_NARROW: "too narrow",
  TOO_SHORT: "too short",
  RESIZE_PROMPT: "Please resize",

  // `█` is painted only in ASCII_LOGO.
  LOGO_BANNER: "█████╗",

  // formatSourceDisplayName("agents-inc").
  SOURCE_DISPLAY_DEFAULT: "Agents Inc",
  // formatSourceDisplayName("eject").
  SOURCE_DISPLAY_EJECT: "Eject",

  DOCTOR_ROW_LAYOUT: "Layout",
  // `codexProjectTrustMessage`.
  CODEX_PROJECT_TRUSTED: "Trusted this project in your Codex configuration",
  CODEX_PROJECT_TRUST_LEFT: "Left as you set it",
  // `claudeProjectNeedsTrustMessage`.
  CLAUDE_FOLDER_UNTRUSTED: "only once you trust the folder",
  CLAUDE_TRUST_PROMPT_REMEDY: "accept the trust prompt",
  SHARE_EJECTED_SKILLS_REFUSED: "ejected skills cannot be shared",
  SHARE_ONLY_PLUGINS: "Only plugins can be shared",
  SHARE_FOLDER_MARKETPLACE: "installs only where that folder exists",
  SHARE_SKILLS_NOT_INSTALLED_ELSEWHERE: "will not install elsewhere",
  // `marketplaceManifestMissing` / `marketplaceManifestUnreadable` in utils/messages.ts.
  MANIFEST_REFUSAL_FIRST_BUILD: "build plugins",
  MANIFEST_REFUSAL_SECOND_BUILD: "build marketplace",
} as const;

export const MANIFEST_REFUSAL_BUILDS_IN_ORDER = new RegExp(
  `${matchedAsWritten(STEP_TEXT.MANIFEST_REFUSAL_FIRST_BUILD)}[\\s\\S]*${matchedAsWritten(STEP_TEXT.MANIFEST_REFUSAL_SECOND_BUILD)}`,
);

export const REMOVED_MARKER = "-";
export const CHANGED_MARKER = "~";
export const ADDED_MARKER = "+";
export const UNCHANGED_MARKER = "•";
export const OVERWRITTEN_MARKER = "↻";
/** The summary panel's mark for a skill installed as a local copy. */
export const LOCAL_COPY_MARK = "⏏";

/** One of the summary panel's rows: its mark, then the skill's display name or the sub-agent's. */
export function panelRow(marker: string, name: string): string {
  return ` ${marker} ${name} `;
}

/**
 * One of doctor's check rows: its name, its status mark, then the opening of its message, each
 * matched as written. End `message` with "\n" to hold it whole; `.source` composes a longer pattern.
 */
export function doctorRow(
  name: string,
  status: (typeof STEP_TEXT)["DOCTOR_STATUS_PASS" | "DOCTOR_STATUS_FAIL" | "DOCTOR_STATUS_SKIP"],
  message = "",
): RegExp {
  return new RegExp(
    `${matchedAsWritten(name)}\\s+${matchedAsWritten(status)}\\s+${matchedAsWritten(message)}`,
  );
}

/** How {@link oldSourceFolderIgnored} names HOME; a project is named by its absolute path. */
export const HOME_SHORTHAND = "~";

/** The line a run prints for a root holding an old `.claude-src/`; `readFrom` is the folder agents-inc reads in that root. */
export function oldSourceFolderIgnored(
  root: string,
  readFrom: typeof DIRS.SOURCE_CLAUDE | typeof DIRS.SOURCE_CODEX,
): string {
  return `${root}/${DIRS.RETIRED_SOURCE}/ is ignored; agents-inc reads ${root}/${readFrom}/. Delete the old folder once you have kept anything you need from it.`;
}

/** Mirrors `CLI_INVOKE_COMMAND` in `src/cli/consts.ts`. */
export const CLI_INVOKE_COMMAND = "npx agents-inc";

// `DEFAULT_NAME` mirrors `DEFAULT_BRANDING.NAME`; the white-label names share no substring with it.
export const BRANDING = {
  DEFAULT_NAME: "Agents Inc.",
  WHITE_LABEL_NAME: "Northwind",
  RENAMED_WHITE_LABEL_NAME: "Fabrikam",
  DOCTOR_HEADING_NOUN: "Doctor",
  EJECT_HEADING_NOUN: "Eject",
  UNINSTALL_HEADING_NOUN: "Uninstall",
  UNINSTALL_SIGN_OFF: "has been uninstalled.",
} as const;

export const TIMEOUTS = {
  /** Spawn to first frame; full-suite load can exceed 15s. */
  WIZARD_LOAD: 45_000,
  WIZARD_TRANSITION: 45_000,
  INSTALL: 30_000,
  PLUGIN_INSTALL: 60_000,
  PLUGIN_TEST: 60_000 + 30_000, // PLUGIN_INSTALL + EXIT_WAIT
  EXIT: 10_000,
  /** Doubled in CI. */
  SESSION_DEFAULT: 10_000,
  SESSION_DEFAULT_CI: 20_000,
  EXIT_WAIT: 30_000,
  SETUP: 60_000,
  SETUP_DUAL: 60_000 * 2, // SETUP * 2
  LIFECYCLE: 180_000,
  EXTENDED_LIFECYCLE: 300_000,
  INTERACTIVE: 120_000,
} as const;

export const KEYS = {
  ARROW_DOWN: "\x1b[B",
  ENTER: "\r",
} as const;

export const INTERNAL_DELAYS = {
  STEP_TRANSITION: 500,
  KEYSTROKE: 150,
} as const;

export const INTERNAL_RETRIES = {
  INTERVAL_MS: 3_000,
} as const;

// A superset of src/cli/lib/exit-codes.ts: 127 is the shell's status when `dist/` is absent.
export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  INVALID_ARGS: 2,
  NETWORK_ERROR: 3,
  CANCELLED: 4,
  COMPLETED_WITH_FAILURES: 5,
  UNKNOWN_COMMAND: 127,
} as const;

// global-setup.ts sweeps stale marketplaces by this prefix.
export const E2E_MARKETPLACE_PREFIX = "e2e-test-";

// Spells neither "source" nor "marketplace", so absence assertions on those nouns cannot match it.
export const E2E_MARKETPLACE_NAME = `${E2E_MARKETPLACE_PREFIX}fixture`;

/** Mirrors `DEFAULT_PUBLIC_SOURCE_NAME`. */
export const PUBLIC_MARKETPLACE_NAME = "agents-inc";

/** Mirrors `EJECT_SOURCE`. */
export const EJECT_SOURCE_NAME = "eject";

/** The display name `new marketplace` writes for the example skill it scaffolds. */
export const SCAFFOLDED_SKILL_DISPLAY_NAME = "Example Skill";

// Typed `string`: a namespaced fixture id is not a `SkillId`.
export function e2eSkillId(bare: string): string {
  return `${E2E_MARKETPLACE_NAME}-${bare}`;
}

export const SOURCE_PATHS = {
  SKILLS_DIR: "src/skills",
  /** Mirrors `DIRS.agents`. */
  AGENTS_DIR: "src/agents",
  SKILL_CATEGORIES: "config/skill-categories.ts",
  SKILL_RULES: "config/skill-rules.ts",
  STACKS_FILE: "config/stacks.ts",
  PLUGIN_MANIFEST_DIR: ".claude-plugin",
  // Mirrors PLUGINS_DIST_PATH.
  PLUGINS_DIST: "dist/plugins",
} as const;

export const MARKETPLACE_MANIFEST_PATH = `${SOURCE_PATHS.PLUGIN_MANIFEST_DIR}/${FILES.MARKETPLACE_JSON}`;

export const TERMINAL_SIZE = {
  TALL: { rows: 60, cols: 120 },
  /** `rows` is exactly `MIN_TERMINAL_SIZE.ROWS`; one lower and specs hang on the resize prompt. */
  SHORT: { rows: 20, cols: 100 },
  /** `cols` is exactly `MIN_TERMINAL_SIZE.COLS`, the narrowest terminal the CLI draws at. */
  NARROWEST: { rows: 40, cols: 80 },
  /** Between the narrowest and the PTY default, where a name that fits at 120 still overruns. */
  MIDDLE: { rows: 40, cols: 100 },
} as const;
