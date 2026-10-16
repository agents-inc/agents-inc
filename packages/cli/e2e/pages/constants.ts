// E2E constants are declared here rather than imported from `src/cli/`, so an assertion can
// fail when the product's value moves. Every mirrored value is held to its source by
// `scripts/check-mirrored-constants.ts`.
// Values with no production counterpart are this file's own.

export const DIRS = {
  CLAUDE: ".claude",
  /**
   * Mirrors `SOURCE_ROOT_DIR`: the parent every provider's source folder sits under. Detection,
   * uninstall cleanup and `.gitignore` name it alone.
   */
  SOURCE_ROOT: ".agents-inc",
  /**
   * Two segments, so unusable with `listFiles`. Unmirrored: production derives it with
   * `sourceDirName(provider)`, and the check compares literals.
   */
  SOURCE_CLAUDE: ".agents-inc/claude",
  /** Marks an installation as Codex (`config.ts` records no provider). Unmirrored, as above. */
  SOURCE_CODEX: ".agents-inc/codex",
  SKILLS: "skills",
  AGENTS: "agents",
  PLUGINS: "plugins",
  PLUGIN_MANIFEST: "plugin-manifest",
  // No `src/` value mirrors these yet. `CODEX` is Codex's state under a HOME (`CODEX_HOME`) and
  // holds a project's `.codex/agents`; `CODEX_PROJECT_SKILLS` is where a project's skills live for
  // Codex, which cannot scope a plugin to one project.
  CODEX: ".codex",
  CODEX_PROJECT_SKILLS: ".agents/skills",
  // Where the Claude CLI keeps backups of its own session state under its config dir.
  CLAUDE_BACKUPS: "backups",
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
  MARKETPLACE_JSON: "marketplace.json",
  CATALOG_JSON: "catalog.json",
  PACKAGE_JSON: "package.json",
  // A Codex sub-agent is a TOML file under `.codex/agents`. Unmirrored, as `DIRS.CODEX`.
  CODEX_AGENT_EXTENSION: ".toml",
  // The Claude CLI's own session record and its lock, which a golden tree leaves unpinned.
  CLAUDE_SESSION_JSON: ".claude.json",
  CLAUDE_SESSION_LOCK: ".claude.json.lock",
} as const;

export const STEP_TEXT = {
  INIT_SUCCESS: "initialized successfully",
  EDIT_SUCCESS: "Done",
  EDIT_UNCHANGED: "No changes made",
  // The only line separating a run that found changes from one that did not; the counterpart
  // above is a negative, which a crashed run also satisfies.
  EDIT_CHANGES_HEADING: "Changes:",
  // Partial success: the changes above landed, which is what separates it from a refusal.
  COMPLETED_WITH_FAILURES: "the changes above landed, these did not",
  COMPILE_SUCCESS: "Compiled",
  COMPILE_COMPLETE: "compile complete", // Matches "Global/Project compile complete!" (case-sensitive)
  CONFIG_LOAD_FAILED: "could not be loaded", // Corrupt-config error phrase from ConfigLoadError
  // Single unbroken tokens: oclif word-wraps error text at the terminal width.
  CONFIG_UNREADABLE_RECREATE: "recreate",
  // The `/editor` segment is the point: the bare host is the landing page.
  EDITOR_URL: "https://agentsinc.sh/editor",
  CONFIG_UNREADABLE_DOCTOR: "doctor",
  // Composed with ` '<path>'`, so the scope cannot be satisfied by a line naming the other file.
  CONFIG_UNREADABLE_GLOBAL: "The global installation's config at",
  CONFIG_UNREADABLE_PROJECT: "This project's config at",
  // Composed with ` '<folder>'`: from a project over a broken global config, a remedy naming no
  // folder would send the user to uninstall the wrong installation.
  CONFIG_UNREADABLE_RECREATE_FROM: "'npx agents-inc uninstall' from",
  // The install a recreate ends on: a bare `init` only prints the editor's address.
  CONFIG_UNREADABLE_INSTALL_BY_ID: "'npx agents-inc init --from <id>'",
  EJECT_SUCCESS: "Eject complete!",
  UNINSTALL_SUCCESS: "Uninstall complete!",

  LOADING_SKILLS: "Loading skills",
  RECOMPILING: "Recompiling agents",
  NO_AGENTS_TO_RECOMPILE: "No agents to recompile",
  // "<n> agents rewritten, <m> unchanged"; specs compose the counts.
  AGENTS_REWRITTEN: "agents rewritten",
  UNCHANGED: "unchanged",
  // The two ways a recompile leaves work owed; the remedy is anchored on the claim about disk.
  AGENTS_NOT_COMPILED: "did not compile",
  RECOMPILATION_FAILED: "Agent recompilation failed",
  RECOMPILE_STALE_REMEDY: "the compiled agents on disk are stale until you do",
  /** `INCOMPLETE_WORK_RECOVERY.DELETE_AGENT_FILE`, for the stale-removal arm of `edit`. */
  DELETE_AGENT_FILE_REMEDY:
    "Claude Code loads a compiled sub-agent this project no longer configures",
  // Anchored on the word before the parenthesis: three other lines end in `(1 failed)`.
  COMPILED_WITH_FAILURES: "agent (1 failed)",
  COMPILE_GLOBAL_SCOPE_HINT: "global-scoped — run", // Stable fragment of the project-context compile hint
  CONFIG_TYPES_REFRESHED: "Refreshed config-types.ts", // Per-pass compile line after config-types regeneration
  SKILL_NOT_FOUND_WARNING: "is configured but was not found", // Compile warning for a config-listed skill with no installed files
  // A stack skill on disk but unknown to the matrix. Suppressed in the unit suite, so only
  // assertable here.
  STACK_SKILL_ABSENT_FROM_MATRIX: "not found in matrix",
  // `withdrawnSkillsWarning` in `lib/loading/source-loader.ts`, anchored on the decision rather
  // than the diagnosis.
  STACK_SKILL_LEFT_OUT: "Left out of the stack — selecting it",
  // `extractLocalSkill` on a metadata.yaml stating the `local` pseudo-category.
  LOCAL_SKILL_PLACEHOLDER_CATEGORY: "is a placeholder, not a real category",
  COMPILE_PASS_NO_SKILLS: "No skills found for", // Per-pass zero-skill line: "No skills found for global/project pass, skipping"
  // Revalidation found newer remote content; or could not ask and served the cache.
  SOURCE_HAS_NEWER_CONTENT: "Marketplace has newer content",
  SOURCE_UNREACHABLE_CACHED: "using the cached copy, which may be out of date",
  // `extractAllSkills` skipping an unparseable metadata.yaml; asserted with the `<dir>` beside it.
  MARKETPLACE_METADATA_UNPARSEABLE: "unparseable metadata.yaml",
  // A name in config.ts is refused naming the field instead, since that manifest is fine.
  RESERVED_NAME_MANIFEST_WAY_OUT: "rename the marketplace",
  RECORDED_MARKETPLACE_NAME_FIELD: "marketplaceName",
  // `skippedUnknownSkills`: "Skipped N skill(s) this catalog does not know: <ids>".
  CATALOG_DOES_NOT_KNOW: "this catalog does not know:",
  // Once per reference. Built-in rules are narrowed to the source's slugs first, so a fixture
  // shipping ten skills produces none.
  UNRESOLVED_SLUG: "Unresolved slug",
  // `checkMatrixHealth` prefixes what a load SAYS with this; doctor's Marketplaces row files the
  // same finding without it, so it is what tells the warning from the row.
  MATRIX_HEALTH_SAID: "[matrix]",
  // `claimSlug`: the loser of a slug clash becomes unreachable by slug, and this is its only trace.
  DUPLICATE_SLUG: "Duplicate slug",
  // Short of the four words it shares with COMPILE_PASS_NO_SKILLS; a longer fragment straddles
  // the oclif error box wrap.
  COMPILE_NO_SKILLS_ERROR: "No skills found. Run",
  // Asserted against the refusal and as the command invoked, so the two cannot diverge.
  COMPILE_NO_SKILLS_REMEDY: "init",
  // An installed skill's metadata.yaml that exists but is unusable. Asserted through
  // `flattenCliOutput`: it opens an oclif error box.
  COMPILE_METADATA_UNUSABLE: "does not describe",
  COMPILE_METADATA_MISSING_FIELD: "missing required field",
  // `judgeSkillMetadata` on an installed skill directory holding a SKILL.md and no metadata.yaml.
  INSTALLED_SKILL_METADATA_MISSING: "is missing metadata.yaml — skipped",
  // Shared by `compile` and `init`/`edit`. Asserted through `flattenCliOutput`.
  METADATA_UNUSABLE_WAY_OUT: "Fix the file, or delete the skill directory",
  // Counts projects rewritten, not reached, so a fan-out that changes nothing never prints it.
  PROPAGATED_RECOMPILE_ONE: "Recompiled agents in 1 registered project,",
  // Prefix of the same summary (`BaseCommand.reportPropagatedRecompile`), for absence assertions.
  PROPAGATED_RECOMPILE: "Recompiled agents in",
  LOADED: "Loaded",
  LOADED_SKILL: "Loaded skill:", // Verbose loader line prefix
  COMPILED_LIST: "Compiled:", // Verbose compile listing prefix, distinct from COMPILE_SUCCESS

  // `update`. The warn/error sentinels are short: oclif wraps that text and prefixes each
  // continuation with ` ›  `.
  UPDATE_HELP_SUMMARY: "Refresh the marketplaces this installation uses",
  EDIT_HELP_SUMMARY: "Open this installation in the editor, or apply a configuration with --from",
  UPDATE_EJECTED_OWNED: "Ejected skills are yours to own",
  UPDATE_NO_MARKETPLACES: "No plugin marketplaces are configured",
  UPDATE_MARKETPLACE_REFRESHED: "Updated marketplace",
  // A marketplace update re-reads listings; installed plugins keep their versions.
  UPDATE_COMPLETE: "Update complete!",
  UPDATE_PLUGINS_UNCHANGED: "Installed plugins were not changed",
  UPDATE_NO_CLAUDE_CLI: "Claude CLI not found",

  CONFIRM_UNINSTALL: "Are you sure you want to uninstall",
  UNINSTALL_PREVIEW: "The following will be removed", // Loose form for waitForText
  UNINSTALL_PREVIEW_HEADING: "The following will be removed:", // Exact rendered heading
  UNINSTALL_CONFIG_SECTION: "Config:", // Removal-plan section header for the config manifest
  UNINSTALL_PROJECTS_UPDATED_ONE: "Updated 1 registered project", // Global-uninstall summary after pruning one registered project's global entries
  UNINSTALL_PROJECT_SKIPPED: "Could not update registered project at", // Warn prefix for a registered project whose config a global uninstall could not prune
  // Composed as `${SKIPPED_REGISTERED_PROJECT} <path>: ${REGISTERED_PROJECT_CONFIG_UNREADABLE}`.
  SKIPPED_REGISTERED_PROJECT: "Skipped",
  REGISTERED_PROJECT_CONFIG_UNREADABLE: "its config.ts can't be read.",
  // The other reasons a global `compile` or `uninstall` leaves a registered project alone.
  REGISTERED_PROJECT_GONE: "nothing is installed there any more.",
  REGISTERED_PROJECT_OTHER_PROVIDER: "it is another provider's installation.",
  REGISTERED_PROJECT_UPDATE_FAILED: "updating it failed.",
  // Warn prefixes when uninstall continues past a config it cannot parse, naming whose it read.
  UNINSTALL_PROJECT_CONFIG_UNREADABLE: "Could not read the project config",
  UNINSTALL_GLOBAL_CONFIG_UNREADABLE: "Could not read the global config",
  // Printed together, in order; one alone cannot tell "found nothing" from "removed everything".
  UNINSTALL_NOTHING_TO_UNINSTALL: "Nothing to uninstall",
  UNINSTALL_NOT_INSTALLED: "is not installed in this project",
  UNINSTALL_NO_CHANGES_MADE: "No changes made.",
  UNINSTALL_CLI_COMPILED: "(CLI-compiled)",
  UNINSTALL_CLI_MANAGED_SECTION: "CLI-managed files:",
  // An agent file without the provenance marker is the user's and stays. The count is part of
  // the claim.
  UNINSTALL_AGENTS_KEPT_ONE: "Kept 1 agent in",
  UNINSTALL_AGENTS_KEPT_TWO: "Kept 2 agents in",
  UNINSTALL_AGENTS_KEPT_REASON: "no agents-inc marker",
  // Whether uninstall removed `.agents-inc/` or kept it for other content beside the provider
  // folders.
  UNINSTALL_SOURCE_ROOT_REMOVED: "Removed .agents-inc/",
  UNINSTALL_SOURCE_ROOT_KEPT: "Kept .agents-inc/ (contains user content)",

  DASHBOARD: "Doctor",
  // The select list's marker, a space, then the label; a paced choice waits on it.
  DASHBOARD_DOCTOR_FOCUSED: "❯ Doctor",

  // `doctor`: the content layer runs, then the operational rows; a row stands down only for a
  // failed content pass that names it, and the whole layer for an unreadable config.
  DOCTOR_CONTENT_SECTION: "Content checks",
  DOCTOR_OPERATIONAL_SECTION: "Operational checks",
  // `formatOverLengthWarning` in src/cli/lib/schemas.ts.
  DOCTOR_CLI_DESCRIPTION_OVER_LENGTH: "exceeds the recommended maximum",
  // Verbatim from `SKIP_AFTER_CONFIG_ERROR` in src/cli/commands/doctor.ts.
  DOCTOR_SKIP_AFTER_CONFIG_ERROR: "Skipped — fix the content errors above first",
  // `skipRestatingContent`: names the pass that blocked the row, so a negative about the blanket
  // sentence above says nothing about this one.
  DOCTOR_SKIP_RESTATING_SKILL_ERRORS:
    "Skipped — this row would only restate the skill errors above",
  // Verbatim from `SKIP_NO_INSTALLATION` in src/cli/commands/doctor.ts.
  DOCTOR_SKIP_NO_INSTALLATION: "Skipped — no installation here (marketplace repository)",
  // Only the operational layer emits it, so its absence proves the layer was skipped.
  DOCTOR_CONFIG_CHECK: "Config Valid",
  // Asserted anchored to the Config Valid row: Layout rows open with the same nouns.
  DOCTOR_CONFIG_THIS_PROJECT: "This project:",
  DOCTOR_CONFIG_THE_GLOBAL_INSTALLATION: "The global installation:",
  // No config here under a global installation: the row names the file it actually read.
  DOCTOR_CONFIG_USING_GLOBAL: "using the global installation's",
  // The remaining operational row names `runAllChecks` logs.
  /** `UI_SYMBOLS.SKIPPED`, an en dash; one of the two regexes using it is a negative. */
  DOCTOR_STATUS_SKIP: "\u2013",
  DOCTOR_ROW_PLACEMENTS: "Placements Offered",
  DOCTOR_ROW_SKILLS_RESOLVED: "Skills Resolved",
  DOCTOR_ROW_AGENTS_COMPILED: "Agents Compiled",
  DOCTOR_ROW_NO_ORPHANS: "No Orphans",
  DOCTOR_ROW_SKILLS_INSTALLED: "Skills Installed",
  DOCTOR_ROW_PLUGINS_INSTALLED: "Plugins Installed",
  DOCTOR_ROW_SOURCE_REACHABLE: "Marketplace Reachable",
  // `CONTENT_CHECKS`'s `name` in src/cli/commands/doctor.ts; renamed together with the row above.
  DOCTOR_ROW_MARKETPLACES: "Marketplaces",
  // The connection label keeps its colon so it cannot match prose about a local marketplace.
  DOCTOR_CONFIG_IS_VALID: "is valid",
  DOCTOR_SOURCE_LOCAL: "Connected to local:",
  DOCTOR_SKILLS_AVAILABLE: "skills available",
  DOCTOR_ONE_SKILL_AVAILABLE: "1 skill available",
  // Whole, because both halves are the claim: which marketplace, and that it was fetched.
  DOCTOR_MARKETPLACE_DEFAULT_FETCHED:
    "Fetched github:agents-inc/skills over the network — nothing here names one, so this is the default",
  DOCTOR_AGENTS_NEED_RECOMPILATION: "recompilation",
  // Anchored on the half with no `CLI_INVOKE_COMMAND`; never assert the bare word "compile".
  DOCTOR_TIP_COMPILE_AGENTS: "to generate missing agent files",
  DOCTOR_TIP_CHECK_SKILL_IDS: "Check skill IDs in config match available skills",
  // Verbatim from the `TIPS` table in src/cli/commands/doctor.ts.
  DOCTOR_TIP_RE_EJECT: "Re-eject the missing skills from the marketplace to restore their files",
  DOCTOR_SUMMARY: "Summary:",
  // What the content layer found on disk, independent of any config.
  DOCTOR_SKILLS_VALIDATED: "skills validated",
  DOCTOR_AGENTS_VALIDATED: "agents validated",
  DOCTOR_ONE_MARKETPLACE_VALIDATED: "1 marketplace validated",
  DOCTOR_MARKETPLACE_LOAD_FAILED: "Failed to load marketplace",
  DOCTOR_SKILLS_SKIPPED_UNREACHABLE: "Skipped (marketplace unreachable)",
  // The consumer's half of an unresolved-slug finding (`consumedMarketplaceMessage` in
  // src/cli/lib/source-validator.ts).
  DOCTOR_FOREIGN_MARKETPLACE_DEFECT: "Nothing to fix here",
  DOCTOR_CONFIG_UNREADABLE: "exists but could not be loaded",
  DOCTOR_CONFIG_NOT_FOUND: "config.ts not found",
  // A config that reads cleanly and declares nothing (`detectInstallation` maps it to `null`).
  DOCTOR_CONFIG_DECLARES_NOTHING: "declares no skills and no agents",
  DOCTOR_ONE_CONFIG_VALIDATED: "1 config validated",
  // One remedy per state: create (absent), recreate (unreadable), fill in (empty).
  DOCTOR_TIP_CREATE_CONFIG: "to create a configuration",
  DOCTOR_TIP_RECREATE_CONFIG: "still works on a config it cannot read",
  DOCTOR_TIP_NOTHING_CONFIGURED: "Nothing is configured yet",
  // A shared `~/.claude/skills/` directory nothing here installed. Verbatim from `foreignSkillNote`
  // in src/cli/lib/content-validator.ts.
  DOCTOR_FOREIGN_SKILL_DIR: "not installed by this CLI",
  // The No Orphans row with no config but installed files left behind.
  DOCTOR_UNOWNED_INSTALL: "no configuration declares them",
  // The tip's claim rather than its lead-in. Verbatim from the `orphans-unowned` tip in
  // src/cli/commands/doctor.ts.
  DOCTOR_TIP_UNOWNED_INSTALL: "removes them, the compiled agents included",
  DOCTOR_SKIPPED_CONFIG_INVALID: "Skipped (config invalid)",
  DOCTOR_NO_SKILLS_CONFIGURED: "No skills configured",
  DOCTOR_NO_AGENTS_CONFIGURED: "No agents configured",
  // `loadConfig`'s reason, quoted by the finding. Asserted present: a sentinel asserted absent
  // dies silently when the source line changes.
  CONFIG_LOAD_REASON: "Failed to load config from",

  NO_INSTALLATION: "No installation found",

  INSTALLING_PLUGINS: "Installing skill plugins",
  INSTALLING_PLUGINS_ELLIPSIS: "Installing skill plugins...", // Exact rendered form; the bare form stays for negative assertions
  // Printed by `init`'s install-plan line and `edit`'s mode-switch line alike.
  PLUGIN_NATIVE: "Plugin (native install)",
  // No directory named: the eject destination depends on host and scope.
  EJECT_LOCAL_COPY: "Eject (local copy)",
  // `logModeSwitch`, composed as
  // `${SWITCHING_SKILLS_PREFIX} ${n} ${SWITCHING_SKILLS_SUFFIX} ${MODE}`.
  SWITCHING_SKILLS_PREFIX: "Switching",
  SWITCHING_SKILLS_SUFFIX: "skill(s) to",
  // `copyNewLocalSkills`: "Copied <n> local skill(s)", with no destination path. `init` says
  // "local skills" without the "(s)".
  COPIED_LOCAL_SKILLS_PREFIX: "Copied",
  COPIED_LOCAL_SKILLS_SUFFIX: "local skill(s)",
  SKILLS_COPIED_TO: "Skills copied to:",
  AGENTS_COMPILED_TO: "Agents compiled to:",
  CONFIGURATION_LABEL: "Configuration:",
  NO_SKILLS_FOUND: "No skills found",
  UNINSTALL_CANCELLED: "Uninstall cancelled",
  // oclif's framing of the command's own "Cancelled".
  RUN_CANCELLED: "Error: Cancelled",
  ROOT_HELP_USAGE: "$ agents-inc [COMMAND]",

  // `init --from` is greenfield-only: it refuses anything it would install over, and a payload
  // the config model cannot write.
  SHARED_CONFIG_EXISTING_INSTALL: "An installation already exists at",
  SHARED_CONFIG_UNINSTALL_HINT: "Run 'npx agents-inc uninstall'",
  SHARED_CONFIG_UNWRITABLE_PAIR: "these assignments have nowhere to be written",

  // At home there is nowhere for project-scoped entries; the way out is not `uninstall`.
  SHARED_CONFIG_PROJECT_SCOPE_AT_HOME: "these project-scoped entries have nowhere to be written",
  SHARED_CONFIG_PROJECT_SCOPE_HINT: "Run this from inside a project directory",
  // Shared by `init --from` and `edit --from`. Asserted on flattened output.
  SHARED_CONFIG_UNCARRIED_DESTINATION: "no shared configuration put those directories there",
  SHARED_CONFIG_NOTHING_INSTALLABLE: "contains no skills this catalog can install",
  // Stops short of the ref, which oclif may wrap.
  SHARED_CONFIG_STACK_NOT_OFFERED: "is not a stack the source",
  SHARED_CONFIG_WRONG_VERSION: "is not in a format this version of the CLI can install",
  SHARED_CONFIG_RESHARE: "re-share the configuration",
  // "Sub-agent '<agent>' asks for Codex model '<id>', which this version …".
  CODEX_MODEL_NOT_OFFERED:
    "which this version of the CLI does not offer, so it runs on the session's model. Offered: gpt-6-astra, gpt-5.6-sol, gpt-5.6-terra and gpt-5.6-luna.",
  // Compared with spaces removed: oclif may break the list mid-token.
  CONFIG_MODEL_REFUSED:
    'agents.0.model: Invalid option: expected one of "sonnet"|"opus"|"haiku"|"fable"|"inherit"',
  CONFIG_CODEX_MODEL_REFUSED:
    'agents.0.codexModel: Invalid option: expected one of "gpt-6-astra"|"gpt-5.6-sol"|"gpt-5.6-terra"|"gpt-5.6-luna"',

  // `edit --from`: removals are confirmed first, and no terminal means a refusal. Short
  // fragments: oclif wraps error text, and the Ink plan is read off a 120-column PTY.
  SHARED_CONFIG_APPLY_PREVIEW: "Applying this configuration will remove:",
  SHARED_CONFIG_APPLY_CONFIRM: "Apply this configuration?",
  SHARED_CONFIG_APPLY_NOTHING_REMOVED: "Nothing is removed",
  SHARED_CONFIG_NEEDS_TERMINAL: "no terminal here to confirm it at",
  // `uninstall`'s version; the remedy is the flag that answers the confirm in advance.
  UNINSTALL_NEEDS_TERMINAL: "Uninstalling removes files, so it has to be confirmed",
  UNINSTALL_NEEDS_TERMINAL_REMEDY: "uninstall --yes",
  // Asserted absent: a refusal still printing it would be the crash with a sentence on top.
  INK_RAW_MODE_UNSUPPORTED: "Raw mode is not supported",
  // The plan's two "kept" disclosures: ownership (`forkedFrom`), and an id this catalogue
  // cannot place.
  SHARED_CONFIG_KEPT_AUTHORED: "written here rather than installed",
  SHARED_CONFIG_KEPT_UNPLACEABLE: "cannot place them",
  SHARED_CONFIG_KEPT_UNPLACEABLE_REMEDY: "then apply the configuration again",
  // "<id>: kept, no longer assigned to <sub-agent>'s <category>".
  SHARED_CONFIG_KEPT_UNASSIGNED: "kept, no longer assigned to",
  // Refused before the question, so asserted on a run that never asked.
  SHARED_CONFIG_SLOT_OVERFULL: "is exclusive but holds",
  // Two fragments: the line wraps on a long skill label.
  SHARED_CONFIG_PROJECT_COPY_REMOVED: "this project's copy is removed",
  SHARED_CONFIG_GLOBAL_TAKES_OVER: "the global one takes over",
  // What a `--from` install puts where, printed before any write. Assert the ORDER heading →
  // entry → other heading, not either heading alone.
  SHARED_CONFIG_LIST_PROJECT: "Into this project:",
  SHARED_CONFIG_LIST_GLOBAL: "Into the global install:",
  SHARED_CONFIG_LIST_SKIPPED: "Skipped, already in the global install:",
  SHARED_CONFIG_INSTALL_CONFIRM: "Install this configuration?",
  // A project run only adds to the global install; differences are named, not applied.
  SHARED_CONFIG_KEPT_AS_INSTALLED: "Kept as installed in the global install",
  // Held global sub-agents a new skill joins: "  sub-agent <name>: + <skill id>" follows.
  SHARED_CONFIG_ADDED_TO_GLOBAL: "Added to sub-agents in the global install",
  // `edit`'s Changes line for one of them, composed after "~ <name> ".
  EDIT_GLOBAL_SUB_AGENT_SKILLS_ADDED: "[G] (agent: skills added)",

  VALIDATION_REQUIRES: "requires:",

  // The scope filter's reporting: a project-scoped skill never reaches a global sub-agent, and
  // these say when that left a skill on no agent. The wording is the implementer's.
  //
  // `init`/`edit`: an active selected skill in zero agents' stacks.
  SKILL_ASSIGNED_TO_NO_AGENT: "is assigned to no sub-agent",
  // `compile`: a hand-edited stack pairing a global agent with a project skill.
  STACK_PAIR_DROPPED_BY_SCOPE: "cannot carry project-scoped skill",

  // `formatTerminalTooSmallMessage`, printed by the startup gate.
  TOO_NARROW: "too narrow",
  TOO_SHORT: "too short",
  // The sentinel to wait on when either dimension may have tripped the gate.
  RESIZE_PROMPT: "Please resize",

  // `█` is painted only in ASCII_LOGO.
  LOGO_BANNER: "█████╗",

  // formatSourceDisplayName("agents-inc").
  SOURCE_DISPLAY_DEFAULT: "Agents Inc",
  // formatSourceDisplayName("eject").
  SOURCE_DISPLAY_EJECT: "Eject",

  // Prefixed with the folder's name by `retired-source-folder.e2e.test.ts`.
  RETIRED_SOURCE_FOLDER_UNSUPPORTED:
    "is no longer supported (agents-inc now serves Claude and Codex). Move it to .agents-inc/claude/.",
  DOCTOR_ROW_LAYOUT: "Layout",
  DOCTOR_LAYOUT_CURRENT: "on .agents-inc/claude/",
  // `codexProjectTrustMessage`, and the line when the user's own answer is left alone.
  CODEX_PROJECT_TRUSTED: "Trusted this project in your Codex configuration",
  CODEX_PROJECT_TRUST_LEFT: "Left as you set it",
  // `claudeProjectNeedsTrustMessage`: a writing sub-agent's Stop hook is dropped in an untrusted
  // folder.
  CLAUDE_FOLDER_UNTRUSTED: "only once you trust the folder",
  // Only true where Claude Code will prompt: never below a folder already trusted.
  CLAUDE_TRUST_PROMPT_REMEDY: "accept the trust prompt",
  // `share` refusing ejected copies, editor-added skills included.
  SHARE_EJECTED_SKILLS_REFUSED: "ejected skills cannot be shared",
  SHARE_ONLY_PLUGINS: "Only plugins can be shared",
  SHARE_FOLDER_MARKETPLACE: "installs only where that folder exists",
  SHARE_SKILLS_NOT_INSTALLED_ELSEWHERE: "will not install elsewhere",
  // `marketplaceManifestMissing` / `marketplaceManifestUnreadable` in src/cli/utils/messages.ts.
  // Fragments of one sentence, so unmirrored.
  MANIFEST_REFUSAL_FIRST_BUILD: "build plugins",
  MANIFEST_REFUSAL_SECOND_BUILD: "build marketplace",
} as const;

/** Both builds, `build plugins` first. */
export const MANIFEST_REFUSAL_BUILDS_IN_ORDER = new RegExp(
  `${STEP_TEXT.MANIFEST_REFUSAL_FIRST_BUILD}[\\s\\S]*${STEP_TEXT.MANIFEST_REFUSAL_SECOND_BUILD}`,
);

/** The diff glyph painted before a removed row. */
export const REMOVED_MARKER = "-";
/** `~ <name> (<from> → <to>)` in `edit`'s Changes block. */
export const CHANGED_MARKER = "~";

/** Mirrors `CLI_INVOKE_COMMAND` in `src/cli/consts.ts`. */
export const CLI_INVOKE_COMMAND = "npx agents-inc";

/**
 * `DEFAULT_NAME` mirrors `DEFAULT_BRANDING.NAME`; `WHITE_LABEL_NAME` is a fixture sharing no
 * substring with it. Specs assert the composed heading (`<name> Doctor`), not either half.
 */
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
  /** Spawn → first frame. Full-suite parallel load can exceed 15s. */
  WIZARD_LOAD: 45_000,
  /** Enter → the next view's first frame, sized for full-suite load. */
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

// Internal to the framework — NOT exported to tests
export const KEYS = {
  /** For page objects writing several keys as one burst, like a paste. */
  ARROW_DOWN: "\x1b[B",
  ENTER: "\r",
} as const;

export const INTERNAL_DELAYS = {
  STEP_TRANSITION: 500,
  KEYSTROKE: 150,
} as const;

/** Framework-internal. */
export const INTERNAL_RETRIES = {
  INTERVAL_MS: 3_000,
} as const;

/**
 * Mirrors `src/cli/lib/exit-codes.ts` (`check-mirrored-constants.ts`), as a superset:
 * {@link EXIT_CODES.UNKNOWN_COMMAND} is the shell's status when `dist/` is absent.
 */
export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  INVALID_ARGS: 2,
  NETWORK_ERROR: 3,
  CANCELLED: 4,
  /** Partial success; asserting it separates a partial apply from a refusal. */
  COMPLETED_WITH_FAILURES: 5,
  UNKNOWN_COMMAND: 127,
} as const;

/** `e2e/global-setup.ts` sweeps stale marketplace registrations by this prefix. */
export const E2E_MARKETPLACE_PREFIX = "e2e-test-";

/**
 * Stable, because it namespaces fixture skill ids (`e2eSkillId`). Spells neither "source" nor
 * "marketplace", so absence assertions on those nouns cannot match the fixture.
 */
export const E2E_MARKETPLACE_NAME = `${E2E_MARKETPLACE_PREFIX}fixture`;

/**
 * The one builder for fixture skill ids, which must start with the name `build marketplace`
 * reads. Lives here to avoid an import cycle with `test-utils.ts`. Typed `string`: a namespaced
 * id is not a `SkillId`.
 */
export function e2eSkillId(bare: string): string {
  return `${E2E_MARKETPLACE_NAME}-${bare}`;
}

export const SOURCE_PATHS = {
  SKILLS_DIR: "src/skills",
  SKILL_CATEGORIES: "config/skill-categories.ts",
  SKILL_RULES: "config/skill-rules.ts",
  STACKS_FILE: "config/stacks.ts",
  PLUGIN_MANIFEST_DIR: ".claude-plugin",
  // Mirrors PLUGINS_DIST_PATH in src/cli/consts.ts.
  PLUGINS_DIST: "dist/plugins",
} as const;

export const MARKETPLACE_MANIFEST_PATH = `${SOURCE_PATHS.PLUGIN_MANIFEST_DIR}/${FILES.MARKETPLACE_JSON}`;

/** The unset defaults live in e2e/helpers/terminal-session.ts, unmirrored. */
export const TERMINAL_SIZE = {
  TALL: { rows: 60, cols: 120 },
  /**
   * The minimum-size gate exactly (`MIN_TERMINAL_SIZE.ROWS`, held by
   * `check-mirrored-constants.ts`): one row lower and specs hang on the resize prompt. `cols` sits
   * above the gate's 80 and is not mirrored.
   */
  SHORT: { rows: 20, cols: 100 },
} as const;
