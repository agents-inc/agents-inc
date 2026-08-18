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
  MARKETPLACE_JSON: "marketplace.json",
  CATALOG_JSON: "catalog.json",
  PACKAGE_JSON: "package.json",
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
  // THE SOURCES STEP'S SCREEN SENTINEL — `wizard-layout.tsx`'s `STEP_DROPDOWN_LABEL.sources`,
  // duplicated exactly. Every step page object waits on it to know the screen arrived, so a
  // subtitle that moves without this constant does not fail an assertion: it hangs each wizard
  // spec for the full `TIMEOUTS.WIZARD_LOAD` budget. `wizard-layout.test.tsx` carries the fast
  // half of the pair and names the string in under a second.
  //
  // The wording is the step's subject — where each skill comes from — and NOT the config field
  // the step writes, which is `SkillConfig.origin`. Heading it with that field's noun was
  // proposed and withdrawn by the owner, so the mismatch is deliberate. Any rewording moves in
  // exactly two places: here and `wizard-layout.tsx`.
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
  // The `edit` / `init` refusal on a config that exists but cannot be read: there are no
  // versioned migrations, so an unreadable configuration is recreated rather than repaired.
  // Both sentinels are single unbroken tokens because oclif word-wraps error text at the
  // terminal width, so any multi-word fragment can straddle a line break.
  CONFIG_UNREADABLE_RECREATE: "recreate",
  EDITOR_URL: "https://agentsinc.sh", // The editor named as the other way to build a configuration
  // `doctor` named as the place the same fault is reported in context. Only correct since doctor
  // stopped calling an unreadable config "not found" — before that it contradicted the line above.
  CONFIG_UNREADABLE_DOCTOR: "doctor",
  EJECT_SUCCESS: "Eject complete!",
  IMPORT_SUCCESS: "Import complete:",
  UNINSTALL_SUCCESS: "Uninstall complete!",

  // Status / progress
  LOADING_SKILLS: "Loading skills",
  RECOMPILING: "Recompiling agents",
  NO_AGENTS_TO_RECOMPILE: "No agents to recompile",
  // The two invariant fragments of the recompile summary `edit` and `compile` print —
  // "<n> agents rewritten, <m> unchanged". The counts and `compile`'s scope word are
  // composed per-spec around them, because the whole point of the line is that the two
  // numbers differ: one names files this run wrote, the other files it left alone.
  AGENTS_REWRITTEN: "agents rewritten",
  UNCHANGED: "unchanged",
  COMPILE_GLOBAL_SCOPE_HINT: "global-scoped — run", // Stable fragment of the project-context compile hint
  CONFIG_TYPES_REFRESHED: "Refreshed config-types.ts", // Per-pass compile line after config-types regeneration
  SKILL_NOT_FOUND_WARNING: "is configured but was not found", // Compile warning for a config-listed skill with no installed files
  // The stack advisory `resolveAgentConfigToSkills` prints for a stack id no loaded
  // catalogue declares — its sibling one layer over: there the skill is missing from
  // disk, here it is on disk and unknown to the matrix. Suppressed inside the unit
  // suite, so it is only assertable here because neither runner hands the spawned
  // binary its own `VITEST`.
  STACK_SKILL_ABSENT_FROM_MATRIX: "not found in matrix",
  COMPILE_PASS_NO_SKILLS: "No skills found for", // Per-pass zero-skill line: "No skills found for global/project pass, skipping"
  // The line a load prints when revalidation found the remote source had moved on, and the
  // one it prints instead when it could not ask at all and served the cached copy anyway.
  SOURCE_HAS_NEWER_CONTENT: "Marketplace has newer content",
  SOURCE_UNREACHABLE_CACHED: "using the cached copy, which may be out of date",
  // What a relationship rule naming a slug no loaded skill carries warns, once per
  // reference. A source's own rules earn it; the CLI's built-ins, which are written
  // against the whole public catalogue, are narrowed to the source's slugs first — so
  // a fixture shipping ten skills must produce none of these.
  UNRESOLVED_SLUG: "Unresolved slug",
  COMPILE_NO_SKILLS_ERROR: "No skills found. Add skills with", // Hard error when every compile pass discovered zero skills
  // Hard error when an installed skill's metadata.yaml exists but nothing usable can be
  // made of it — unparseable, or parseable and missing fields the skill is described by.
  // Mirrors CONFIG_LOAD_FAILED's phrasing for the same class of fault one layer down.
  // Asserted through `flattenCliOutput` for the same reason the way-out line below is:
  // it opens an oclif error box, and where the wrap falls depends on how long the
  // skill id in the preceding line is.
  COMPILE_METADATA_UNUSABLE: "does not describe",
  // The reason line under the refusal above when the file parsed but left required fields out.
  COMPILE_METADATA_MISSING_FIELD: "missing required field",
  // The way out both metadata refusals close with — `compile`'s and the one `init`/`edit`
  // raise over a saved entry whose installed skill describes itself with an unusable
  // metadata.yaml. Asserted through `flattenCliOutput`, because oclif wraps error text.
  METADATA_UNUSABLE_WAY_OUT: "Fix the file, or delete the skill directory",
  // Why an unresolvable config entry went, in `edit`'s Changes block. Which one is printed is
  // the whole classification — the marketplace dropped the skill, or its local files are gone.
  // Both are only ever asserted with the removal row's own `[P] (` in front of them: the store
  // warns "is not present in the loaded source" about the same skill on the way in, so a bare
  // fragment is satisfied by a line that is not the one under test.
  REMOVED_REASON_NOT_IN_SOURCE: "not present in",
  REMOVED_REASON_FILES_GONE: "skill files no longer exist at",
  PROPAGATED_RECOMPILE_ONE: "Recompiled agents in 1 registered projects", // Summary after a global-scope change fans out to one registered project
  // Prefix of the same summary. All four fan-out commands print the one line
  // BaseCommand.reportPropagatedRecompile owns ("Recompiled agents in N registered
  // projects, M unchanged"), so a spec that asserts the line's ABSENCE — or must
  // not care about the counts — anchors on this instead of a whole line.
  PROPAGATED_RECOMPILE: "Recompiled agents in",
  LOADED: "Loaded",
  LOADED_SKILL: "Loaded skill:", // Verbose loader line prefix
  COMPILED_LIST: "Compiled:", // Verbose compile listing prefix, distinct from COMPILE_SUCCESS

  // `update` (src/cli/commands/update.ts). The command runs Claude's own marketplace
  // update for the marketplaces this installation's config names, and says so about the
  // ejected copies it deliberately leaves alone. The two warn/error sentinels are short
  // fragments on purpose: oclif wraps `warn`/`error` text at the terminal width and
  // prefixes each continuation with ` ›  `, so a whole sentence straddles line breaks.
  UPDATE_HELP_SUMMARY: "Refresh the marketplaces this installation uses",
  UPDATE_EJECTED_OWNED: "Ejected skills are yours to own",
  UPDATE_NO_MARKETPLACES: "No plugin marketplaces are configured",
  UPDATE_MARKETPLACE_REFRESHED: "Updated marketplace",
  UPDATE_COMPLETE: "Update complete!",
  UPDATE_NO_CLAUDE_CLI: "Claude CLI not found",

  // Prompts
  CONFIRM_UNINSTALL: "Are you sure you want to uninstall",
  SEARCH: "Search Skills",
  UNINSTALL_PREVIEW: "The following will be removed", // Loose form for waitForText
  UNINSTALL_PREVIEW_HEADING: "The following will be removed:", // Exact rendered heading
  UNINSTALL_CONFIG_SECTION: "Config:", // Removal-plan section header for the .claude-src/ manifest
  UNINSTALL_PROJECTS_UPDATED_ONE: "Updated 1 registered project", // Global-uninstall summary after pruning one registered project's global entries
  UNINSTALL_PROJECT_SKIPPED: "Could not update registered project at", // Warn prefix for an unreachable registered project during global uninstall
  UNINSTALL_CONFIG_UNREADABLE: "Could not read the project config", // Warn prefix when uninstall continues past a config it cannot parse
  // The three lines `reportNothingToUninstall` prints together, in order: the warn,
  // the state it found, and the promise it kept. Asserting one without the others
  // cannot tell "found nothing" from "removed everything and said so".
  UNINSTALL_NOTHING_TO_UNINSTALL: "Nothing to uninstall",
  UNINSTALL_NOT_INSTALLED: "is not installed in this project",
  UNINSTALL_NO_CHANGES_MADE: "No changes made.",
  // The removal plan's annotation for the compiled-agents directory, which marks it
  // as the CLI's to delete rather than the user's.
  UNINSTALL_CLI_COMPILED: "(CLI-compiled)",
  // The section header that annotation sits under. A header is a promise about the items
  // beneath it, so it belongs to the items the plan keeps rather than to the directories
  // merely existing — printed over an empty list it promises nothing.
  UNINSTALL_CLI_MANAGED_SECTION: "CLI-managed files:",
  // What the plan says beside the compiled-agents item, and the reason it gives. Once the
  // configuration naming this CLI's agents is gone, the provenance marker each compiled file
  // carries is what identifies them — so an agent file without one is the user's and stays,
  // and the plan says so rather than listing a removal it then declines to make. Both count
  // forms are spelled out because the count is part of the claim.
  UNINSTALL_AGENTS_KEPT_ONE: "Kept 1 agent in",
  UNINSTALL_AGENTS_KEPT_TWO: "Kept 2 agents in",
  UNINSTALL_AGENTS_KEPT_REASON: "no agents-inc marker",

  // The two cells of the Sources grid's install-mode control. They are the cells' OWN captions —
  // there is no pinned header repeating them, because with two fixed states the caption row would
  // print the same two words directly above themselves.
  INSTALL_MODE_LOCAL: "Local",
  INSTALL_MODE_PLUGIN: "Plugin",

  // The two hint labels `WizardLayout`'s key-hint band prints above the footer while the Sources
  // step is showing, for the bulk install-mode keys. Named so a spec can assert the step does NOT
  // advertise them: the wizard may not offer a key it does not honour. Their case is what keeps
  // them apart from the cell captions above — "Set all local" is not a substring match for "Local".
  FOOTER_SET_ALL_LOCAL: "Set all local",
  FOOTER_SET_ALL_PLUGIN: "Set all plugin",

  // Scope group labels. The info panel, the confirm step and the Sources grid's left-hand gutter
  // all head their per-scope blocks with these words. Paired with `SCOPE` above, which is the
  // caption the Sources grid must NOT print over that gutter — the labels already name it.
  SCOPE_GLOBAL: "Global",
  SCOPE_PROJECT: "Project",

  // Dashboard
  DASHBOARD: "Doctor",

  // `doctor` layered output (src/cli/commands/doctor.ts). The command validates
  // content first and only reaches the operational layer when content is clean —
  // operational failures on broken content are downstream cascades, not findings.
  DOCTOR_CONTENT_SECTION: "Content checks",
  DOCTOR_OPERATIONAL_SECTION: "Operational checks",
  DOCTOR_SKIP_AFTER_CONTENT_ERRORS: "Skipped — fix the content errors above first",
  // Duplicated verbatim from `SKIP_NO_INSTALLATION` in src/cli/commands/doctor.ts. The
  // parenthetical names what the directory IS to a marketplace author standing in it.
  DOCTOR_SKIP_NO_INSTALLATION: "Skipped — no installation here (marketplace repository)",
  // A row name that only the operational layer emits, so its absence proves the
  // layer was skipped rather than merely quiet.
  DOCTOR_CONFIG_CHECK: "Config Valid",
  // The six remaining operational row names `runAllChecks` logs. Named here rather
  // than retyped per spec: they are the report's skeleton, and a spec asserting one
  // of them is asserting that the row ran, not that a word appeared.
  DOCTOR_ROW_SKILLS_RESOLVED: "Skills Resolved",
  DOCTOR_ROW_AGENTS_COMPILED: "Agents Compiled",
  DOCTOR_ROW_NO_ORPHANS: "No Orphans",
  DOCTOR_ROW_SKILLS_INSTALLED: "Skills Installed",
  DOCTOR_ROW_PLUGINS_INSTALLED: "Plugins Installed",
  DOCTOR_ROW_SOURCE_REACHABLE: "Marketplace Reachable",
  // The content layer's own row for the same subject — `CONTENT_CHECKS`'s `name` in
  // src/cli/commands/doctor.ts. Named here because the two rows are the pair a rename has
  // to move together: one says whether the marketplace loads, the other what is in it.
  DOCTOR_ROW_MARKETPLACES: "Marketplaces",
  // `checkConfigValid`'s pass message and `checkSourceReachable`'s pass message
  // plus its details line. The connection label carries its colon so it cannot match
  // narrative prose about a local marketplace.
  DOCTOR_CONFIG_IS_VALID: "is valid",
  DOCTOR_SOURCE_LOCAL: "Connected to local:",
  DOCTOR_SKILLS_AVAILABLE: "skills available",
  // The `checkAgentsCompiled` warn message, split at the count the caller composes.
  DOCTOR_AGENTS_NEED_RECOMPILATION: "recompilation",
  // Tips from the `TIPS` table in src/cli/commands/doctor.ts, each anchored on the
  // half that carries no `CLI_INVOKE_COMMAND` interpolation. The agents tip in
  // particular must NOT be asserted as the bare word "compile" — the report's own
  // header and several row details carry it.
  DOCTOR_TIP_COMPILE_AGENTS: "to generate missing agent files",
  DOCTOR_TIP_CHECK_SKILL_IDS: "Check skill IDs in config match available skills",
  // Duplicated verbatim from the `TIPS` table in src/cli/commands/doctor.ts.
  DOCTOR_TIP_RE_EJECT: "Re-eject the missing skills from the marketplace to restore their files",
  DOCTOR_SUMMARY: "Summary:",
  // The content layer's two count rows, split at the number the caller composes:
  // "<n> skills validated" / "<n> agents validated". They are what the layer
  // found ON DISK, independent of any config — the only rows that still say
  // something after the configuration naming that content is deleted.
  DOCTOR_SKILLS_VALIDATED: "skills validated",
  DOCTOR_AGENTS_VALIDATED: "agents validated",
  // The Marketplaces row's own count line, composed by `contentMessage` from the check's
  // `noun`. One installation reads from one marketplace, so the singular is the whole row —
  // and the noun is what a rename of the check has to carry through to this sentence.
  DOCTOR_ONE_MARKETPLACE_VALIDATED: "1 marketplace validated",
  // The two failure lines the same row prints, from `checkSourceReachable` and from the
  // skills row that stands down when it could not load.
  DOCTOR_MARKETPLACE_LOAD_FAILED: "Failed to load marketplace",
  DOCTOR_SKILLS_SKIPPED_UNREACHABLE: "Skipped (marketplace unreachable)",
  // The half of the unresolved-slug finding only a CONSUMER is shown. The same defect is a hard
  // error while authoring the marketplace that holds it, and an advisory to a reader who cannot
  // open the file — so the consumer's line says outright that there is nothing here to fix.
  // Duplicated verbatim from `consumedMarketplaceMessage` in src/cli/lib/source-validator.ts.
  DOCTOR_FOREIGN_MARKETPLACE_DEFECT: "Nothing to fix here",
  // The content layer's config row. A config file that exists and cannot be parsed is a finding
  // about a file on disk, so it is reported here — and the operational layer, every row of which
  // would be a cascade of it, is skipped by the same rule that skips them after any content error.
  DOCTOR_CONFIG_UNREADABLE: "exists but could not be loaded",
  DOCTOR_CONFIG_NOT_FOUND: "config.ts not found",
  // The fourth load outcome: a config that reads cleanly and declares neither skills nor agents.
  // `detectInstallation` maps it to the same `null` as an absent file — right for `init`, which
  // has to pick between a dashboard and a wizard, and wrong for the one command whose job is to
  // name the state. It used to print that `null` as `not found` about a file the content layer
  // had validated four lines above.
  DOCTOR_CONFIG_DECLARES_NOTHING: "declares no skills and no agents",
  // The content layer's verdict on that same file, and the half of the contradiction that is
  // already true — it is the operational row beneath it that has to stop disagreeing.
  DOCTOR_ONE_CONFIG_VALIDATED: "1 config validated",
  // The three remedies, told apart by which state produced them: an absent config is created, an
  // unreadable one is recreated, and a valid one that declares nothing is filled in. Pointing a
  // user at the wrong one is what CLI-430 was.
  DOCTOR_TIP_CREATE_CONFIG: "to create a configuration",
  DOCTOR_TIP_RECREATE_CONFIG: "still works on a config it cannot read",
  DOCTOR_TIP_NOTHING_CONFIGURED: "Nothing is configured yet",
  // The skills content pass declining a directory in the shared `~/.claude/skills/` tree that
  // nothing here installed — no configuration names its id and it carries no `forkedFrom`. A note
  // rather than a finding: it is not this installation's file to judge, and saying so is the whole
  // of what it owes a reader wondering why the count is lower than the listing. Duplicated
  // verbatim from `foreignSkillNote` in src/cli/lib/content-validator.ts.
  DOCTOR_FOREIGN_SKILL_DIR: "not installed by this CLI",
  // The No Orphans row when the configuration is absent and the installation it described is not:
  // every skill directory and compiled agent file this CLI can prove it wrote is unowned, and the
  // row names each one instead of standing down. Its remedy is the fourth: the files outlive the
  // config, so `init` alone — which is what the config row already advises — does not describe
  // what to do with them.
  DOCTOR_UNOWNED_INSTALL: "no configuration declares them",
  // The tip's substantive CLAIM rather than its lead-in, because the lead-in is true of any
  // wording. This is the half a spec has to hold the CLI to: the tip used to say identifying the
  // compiled agents needed the configuration that is gone, which `identifiableAgents`' fallback
  // to the marker-carrying files had already made untrue, and a match on "Nothing declares the
  // files above" could not see it. Duplicated verbatim from the `orphans-unowned` tip in
  // src/cli/commands/doctor.ts.
  DOCTOR_TIP_UNOWNED_INSTALL: "removes them, the compiled agents included",
  // What the operational rows say once they are given a config that loads: the truth about an
  // empty one, in place of the `Skipped (config invalid)` they printed about a valid file.
  DOCTOR_SKIPPED_CONFIG_INVALID: "Skipped (config invalid)",
  DOCTOR_NO_SKILLS_CONFIGURED: "No skills configured",
  DOCTOR_NO_AGENTS_CONFIGURED: "No agents configured",
  // The config loader's own diagnostic for the same file, emitted once per read. doctor runs
  // verbose, so these used to interleave with the rows above; the finding carries the reason now
  // and nothing re-reads the file to print it again. Duplicated verbatim from `loadSourceConfig`
  // in src/cli/lib/configuration/config.ts — the spec below asserts its ABSENCE, which is the
  // assertion that silently stops matching if the two drift apart.
  CONFIG_SOURCE_LOAD_NOISE: "Failed to load project config",

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
  // The two install-mode descriptions, printed by BOTH commands that name a mode:
  // `init`'s install-plan line ("Install mode: <desc>") and `edit`'s line for the
  // skills it is switching ("Switching N skill(s) to <desc>"). One wording per mode,
  // so a spec asserting a switch to plugin mode asserts the string a plugin install
  // announces itself with anywhere.
  PLUGIN_NATIVE: "Plugin (native install)",
  EJECT_LOCAL_COPY: "Eject (copy to .claude/skills/)",
  // `edit`'s mode-switch narration (`logModeSwitch`), split at the count the caller
  // composes: "Switching <n> skill(s) to <mode description>". Compose the whole line
  // per-spec as `${SWITCHING_SKILLS_PREFIX} ${n} ${SWITCHING_SKILLS_SUFFIX} ${MODE}`
  // — a spec asserting only the verb cannot tell a switch TO plugin from a switch
  // BACK, which is what the two mode descriptions above are for.
  SWITCHING_SKILLS_PREFIX: "Switching",
  SWITCHING_SKILLS_SUFFIX: "skill(s) to",
  // `edit`'s count of eject copies (`copyNewLocalSkills`), split at the count the
  // caller composes: "Copied <n> local skill(s)". The EJECT direction of a mode
  // switch performs the same copies at the same scopes and owes the same line —
  // a destination path would misname the global direction, which copies under
  // $HOME rather than into `.claude/skills/`. Distinct from `init`'s own copy
  // lines, which say "local skills" without the "(s)".
  COPIED_LOCAL_SKILLS_PREFIX: "Copied",
  COPIED_LOCAL_SKILLS_SUFFIX: "local skill(s)",
  SKILLS_COPIED_TO: "Skills copied to:",
  AGENTS_COMPILED_TO: "Agents compiled to:",
  CONFIGURATION_LABEL: "Configuration:",
  READY_TO_INSTALL: "Ready to install",
  NO_SKILLS_FOUND: "No skills found",
  UNINSTALL_CANCELLED: "Uninstall cancelled",

  // `init --from` refusals. The command is greenfield-only: it installs a shared
  // configuration whole rather than merging it into what is already there, so it
  // refuses anything it would have to install over, and refuses a payload the
  // config model has nowhere to write.
  SHARED_CONFIG_EXISTING_INSTALL: "An installation already exists at",
  SHARED_CONFIG_GLOBAL_INSTALL: "a global installation already exists at",
  SHARED_CONFIG_UNINSTALL_HINT: "Run 'npx agents-inc uninstall'",
  SHARED_CONFIG_UNWRITABLE_PAIR: "these assignments have nowhere to be written",

  // The install-boundary refusal: the home directory IS the global scope, and a global
  // installation holds only global-scoped content, so a payload's project-scoped entries
  // have nowhere to be written there. The hint is the way out, and it is not `uninstall` —
  // the payload is fine, the location is not.
  SHARED_CONFIG_PROJECT_SCOPE_AT_HOME: "these project-scoped entries have nowhere to be written",
  SHARED_CONFIG_PROJECT_SCOPE_HINT: "Run this from inside a project directory",

  // `edit --from` — the inbound half of the round trip, and the destructive one. The project
  // is made to MATCH the payload, so the removals are shown and confirmed first, and a run
  // with no terminal refuses rather than confirming silently. Every sentinel below is a short
  // unbroken fragment: oclif wraps error text at the terminal width, and the Ink plan is read
  // off a 120-column PTY screen.
  SHARED_CONFIG_APPLY_PREVIEW: "Applying this configuration will remove:",
  SHARED_CONFIG_APPLY_CONFIRM: "Apply this configuration?",
  SHARED_CONFIG_APPLY_NOTHING_REMOVED: "Nothing is removed",
  SHARED_CONFIG_NEEDS_TERMINAL: "no terminal here to confirm it at",
  SHARED_CONFIG_ONE_DIRECTION: "two directions of the same round trip",
  // The plan's two "kept" disclosures — what the run may not remove, and why. The first is
  // ownership, which `forkedFrom` decides; the second is this catalogue's own limit, for an id
  // the configuration NAMES and the decode could not place. Both name a real remedy, which is
  // what makes them a disclosure rather than an apology. Scope is NOT one of them: a global
  // entry is removable, and what it gets instead is the blast-radius disclosure below.
  SHARED_CONFIG_KEPT_AUTHORED: "written here rather than installed",
  SHARED_CONFIG_KEPT_UNPLACEABLE: "cannot place them",
  SHARED_CONFIG_KEPT_UNPLACEABLE_REMEDY: "then apply the configuration again",
  // The project run's own half of the plan: a removal at global scope is shown under its own
  // heading, and the statement beneath it counts and NAMES the other registered projects the
  // yes changes. Absent at the home directory, where the scope was chosen and is obvious.
  SHARED_CONFIG_GLOBAL_SKILLS_HEADING: "Skills installed globally",
  SHARED_CONFIG_GLOBAL_AGENTS_HEADING: "Sub-agents installed globally",
  SHARED_CONFIG_GLOBAL_REACH: "shared by every project on this machine",
  SHARED_CONFIG_GLOBAL_REACH_PROJECTS: "Also affects",
  SHARED_CONFIG_GLOBAL_REACH_ALONE: "No other project is registered here",

  // The advisory selection-validation report both `init` and `edit` print after the wizard
  // (validateRequirements / validateConflicts / validateExclusivity in matrix-resolver.ts). The
  // connector carries its colon deliberately: the build grid annotates a cell with a
  // parenthesised "(requires X)" and no colon, so the colon is what tells the post-wizard warning
  // apart from the grid's own text in a full-session output match.
  VALIDATION_REQUIRES: "requires:",

  // Scope warnings
  GLOBAL_SKILLS_BLOCKED: "Global skills cannot be changed from project scope",
  GLOBAL_AGENTS_BLOCKED: "Global agents cannot be changed from project scope",

  // The two halves of the scope filter's own reporting. The rule — a project-scoped
  // skill never reaches a global-scoped sub-agent — is correct and enforced at four
  // layers; what neither layer says is that it fired, so a skill can install to disk
  // and be assigned to nothing with every surface reporting success.
  //
  // Both are in `SKILL_NOT_FOUND_WARNING`'s reporting class: a dropped assignment
  // that nothing names leaves the run claiming a clean install of an agent that does
  // not carry what config.ts implies it does.
  //
  // WORDING IS THE IMPLEMENTER'S. These two constants are where an acceptable
  // rewording lands — one edit here, no spec touched.
  //
  // `init`/`edit`, after the stack is built: an ACTIVE selected skill that ended up
  // in zero agents' stacks.
  SKILL_ASSIGNED_TO_NO_AGENT: "is assigned to no sub-agent",
  // `compile`, beside the unresolved-stack-skill warnings: a hand-edited config.ts
  // whose stack names a (global agent, project skill) pair the compile-time filter
  // drops on the way to the resolver.
  STACK_PAIR_DROPPED_BY_SCOPE: "cannot carry project-scoped skill",

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
  // formatSourceDisplayName("eject") — the label the summary surfaces give an ejected skill's
  // provenance. Named here so the Sources grid can be asserted NOT to use it: the grid captions
  // an install MODE, and "Eject" is a source value, not a mode.
  SOURCE_DISPLAY_EJECT: "Eject",
} as const;

/**
 * Diff glyphs the info panel, the confirm step and the Sources grid all paint in
 * front of a row. Mirrored here rather than imported from `src/cli/consts.ts`:
 * an assertion that imports the very symbol the product rendered with cannot
 * fail when that symbol changes, because both sides move together.
 */
export const ADDED_MARKER = "+";
export const REMOVED_MARKER = "-";
/** The confirm summary's marker for a row the edit leaves alone. */
export const UNCHANGED_MARKER = "•";

/**
 * The invocation prefix the CLI prints in its user-facing guidance ("Run
 * '<prefix> init'"). Mirrored for the same reason as the glyphs above — a spec
 * that imports `CLI_INVOKE_COMMAND` from `src/cli/consts.ts` asserts the string
 * the product printed with, so renaming the published binary moves both sides
 * together and the assertion cannot fail.
 */
export const CLI_INVOKE_COMMAND = "npx agents-inc";

/**
 * The stack step's tab. Named on its own because it is the one tab a flow can
 * lack: a source that ships no stacks gives the wizard no stack step, and a bar
 * that still drew this label would advertise a step the run never has.
 */
export const WIZARD_TAB_STACK = "Stack";

/**
 * The wizard's step tabs, in the order `WizardTabs` paints them. Mirrored for
 * the same reason as everything else in this block — and kept as the whole set
 * because a spec naming two of the six cannot tell a complete tab bar from one
 * that dropped the steps it did not mention.
 */
export const WIZARD_TAB_LABELS = [
  WIZARD_TAB_STACK,
  "Domains",
  "Skills",
  "Sources",
  "Agents",
  "Confirm",
] as const;

/** The whole tab bar a stackless flow paints — every tab above but the Stack one. */
export const WIZARD_TAB_LABELS_WITHOUT_STACK = WIZARD_TAB_LABELS.filter(
  (label) => label !== WIZARD_TAB_STACK,
);

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

/**
 * Prefix every marketplace an E2E fixture publishes under must carry.
 *
 * `e2e/global-setup.ts` sweeps stale Claude marketplace registrations with a
 * `startsWith` on this string, so a fixture that publishes outside it survives
 * the run that created it. It lives here rather than in that file because the
 * sweep and the names being swept are two surfaces that must agree.
 */
export const E2E_MARKETPLACE_PREFIX = "e2e-test-";

/**
 * The marketplace name `createE2EPluginSource` publishes under by default.
 *
 * STABLE, not timestamped: a marketplace's name is the namespace its skill ids
 * are written in, so a name that changes per run cannot be asserted against and
 * cannot be composed into an id. `e2eSkillId` in create-e2e-source.ts builds
 * ids from it.
 *
 * Carries {@link E2E_MARKETPLACE_PREFIX} so the cleanup sweep still matches, and
 * spells neither "source" nor "marketplace" — the name is echoed into CLI output
 * (`Installed <skill>@<marketplace>`), where a spec asserting the absence of
 * either noun would match the fixture instead of the product's own prose. Same
 * reasoning as the `fixture` path segment in create-e2e-source.ts.
 */
export const E2E_MARKETPLACE_NAME = `${E2E_MARKETPLACE_PREFIX}fixture`;

/**
 * Composes a skill id in the fixture marketplace's namespace.
 *
 * A marketplace's skill ids carry that marketplace's name as their prefix, and the
 * prefix must EQUAL the name `build marketplace` reads from package.json — so the
 * two are one string and neither surface may spell it alone. Exported before a
 * second caller exists for the reason CLAUDE.md carves out for `skillSlotKey`:
 * this is the one definition every surface that builds or asserts a fixture id is
 * meant to call, and four of them have to agree on it.
 *
 * It lives here rather than beside the disk writer because `test-utils.ts` has to
 * call it too, and that file is what the disk writer imports its temp dir from —
 * so a builder living there could only be reached through an import cycle.
 *
 * `bare` is the id WITHOUT the namespace. The composed id is deliberately typed
 * `string`: a namespaced id is not a member of the generated `SkillId` union, and
 * casting it into one would be a lie about the catalogue.
 */
export function e2eSkillId(bare: string): string {
  return `${E2E_MARKETPLACE_NAME}-${bare}`;
}

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
