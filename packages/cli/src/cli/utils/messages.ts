import { CLI_INVOKE_COMMAND, DEFAULT_BRANDING, EDITOR_URL, STANDARD_FILES } from "../consts.js";
import type { UnusableSkillMetadata } from "../lib/loading/index.js";
import type { AgentName, SkillId } from "../types/index.js";

export const ERROR_MESSAGES = {
  UNKNOWN_ERROR: "Unknown error occurred",
  UNKNOWN_ERROR_SHORT: "Unknown error",
  NO_INSTALLATION: `No installation found. Run '${CLI_INVOKE_COMMAND} init' first to set up ${DEFAULT_BRANDING.NAME}`,
  NO_SKILLS_FOUND: "No skills found",
  VALIDATION_FAILED: "Validation failed",
  FAILED_RESOLVE_SOURCE: "Failed to resolve source",
  FAILED_LOAD_AGENT_PARTIALS: "Failed to load agent partials",
  FAILED_COMPILE_AGENTS: "Failed to compile agents",
  CLAUDE_CLI_NOT_FOUND: `Claude CLI not found — '${CLI_INVOKE_COMMAND} update' refreshes marketplaces through it. Install Claude Code first: https://claude.ai/code`,
} as const;

export const SUCCESS_MESSAGES = {
  UNINSTALL_COMPLETE: "Uninstall complete!",
  INIT_SUCCESS: `${DEFAULT_BRANDING.NAME} initialized successfully!`,
  PLUGIN_COMPILE_COMPLETE: "Plugin compile complete!",
} as const;

export const STATUS_MESSAGES = {
  INSTALLING_PLUGINS: "Installing skill plugins...",
  LOADING_SKILLS: "Loading skills...",
  LOADING_MARKETPLACE_SOURCE: "Loading marketplace source...",
  RECOMPILING_AGENTS: "Recompiling agents...",
  COMPILING_AGENTS: "Compiling agents...",
  DISCOVERING_SKILLS: "Discovering skills...",
  RESOLVING_SOURCE: "Resolving source...",
  RESOLVING_MARKETPLACE_SOURCE: "Resolving marketplace source...",
  LOADING_AGENT_PARTIALS: "Loading agent partials...",
  FETCHING_REPOSITORY: "Fetching repository...",
  COPYING_SKILLS: "Copying skills...",
  UPDATING_PLUGIN_SKILLS: "Updating plugin skills...",
  /**
   * Printed when revalidation found the remote source had moved on. It is the
   * only warning a user gets that this load costs a download rather than a
   * cache read, so it goes out before the download starts, not after.
   */
  MARKETPLACE_HAS_NEWER_CONTENT: "Marketplace has newer content — fetching the update...",
} as const;

export const INFO_MESSAGES = {
  NO_CHANGES_MADE: "No changes made.",
  RUN_COMPILE: `Run '${CLI_INVOKE_COMMAND} compile' to include imported skills in your agents.`,
  NO_AGENTS_TO_RECOMPILE: "No agents to recompile",
  NO_PLUGIN_INSTALLATION: "No plugin installation found.",
  NO_LOCAL_INSTALLATION: "No local installation found.",
  NOT_INSTALLED: `${DEFAULT_BRANDING.NAME} is not installed in this project.`,
  CONFIG_TYPES_REFRESHED: `Refreshed ${STANDARD_FILES.CONFIG_TYPES_TS}`,
  /**
   * `update` refreshes marketplaces and stops there. An ejected skill is a copy the
   * user owns and may have edited, so overwriting it from the source would discard
   * their work — this line says so once, as information rather than a warning.
   */
  EJECTED_SKILLS_USER_OWNED: `Ejected skills are yours to own — '${CLI_INVOKE_COMMAND} update' does not change them.`,
  NO_PLUGIN_MARKETPLACES: "No plugin marketplaces are configured — nothing to refresh.",
} as const;

/** Closing line of a plugin install, printed wherever one runs. */
export function pluginsInstalled(count: number): string {
  return `Installed ${count} skill plugins`;
}

/**
 * What an eject copy did, wherever `edit` performs one — a newly added local skill,
 * or a skill switched from plugin mode back to eject. Both copy through
 * `copyLocalSkills` at each skill's own scope, so both owe the same sentence.
 *
 * A count and no destination, deliberately: the copies are split between the
 * project directory and `$HOME` by each skill's scope, and one hardcoded path
 * would misname the other half.
 */
export function localSkillsCopied(count: number): string {
  return `Copied ${count} local skill(s)`;
}

/**
 * What a recompile pass did, as two numbers rather than one.
 *
 * The count it replaced was the roster the pass walked, so a run that rewrote
 * nothing and a run that rewrote everything printed the same sentence — the line
 * reported intent rather than outcome. `rewritten` is agents whose file this pass
 * wrote; `unchanged` is agents it found already correct and left alone.
 *
 * `subject` is the noun each caller counts in, because `compile` reports per
 * scope pass ("global agents") and `edit` reports the whole run's ("agents").
 */
export function recompileSummary(rewritten: number, unchanged: number, subject: string): string {
  return `${rewritten} ${subject} rewritten, ${unchanged} unchanged`;
}

/**
 * The same distinction for the fan-out a global change performs across every
 * OTHER registered project: a project whose agents all came back byte-identical
 * was visited and left alone, and says so instead of being counted as recompiled.
 */
export function propagatedRecompileSummary(
  rewritten: number,
  unchanged: number,
  failed: number,
): string {
  const failureSuffix = failed > 0 ? ` (${failed} failed)` : "";
  return `Recompiled agents in ${rewritten} registered projects, ${unchanged} unchanged${failureSuffix}`;
}

/**
 * Warning printed for an installed, actively-selected skill that no sub-agent's stack
 * carries. The install itself is correct — the files are on disk and `config.ts` records
 * them — but nothing will ever load the skill, and every other surface reports the run
 * as clean. This line is the only one that says so.
 */
export function skillAssignedToNoAgent(skillId: SkillId): string {
  return `Skill '${skillId}' is assigned to no sub-agent — nothing will load it.`;
}

/**
 * The reason behind {@link skillAssignedToNoAgent} whenever it is the scope rule: a
 * project-scoped skill never reaches a global-scoped sub-agent. Names every sub-agent the
 * rule kept the skill away from, so one line accounts for every dropped pair.
 *
 * Shared by the save path (`init` / `edit`, where the assignment was never built) and by
 * `compile` (where a hand-edited `config.ts` declares the pair and the compile-time filter
 * drops it). One verdict, one sentence — a second spelling would read as a second rule.
 */
export function scopeBlockedStackAssignment(agentNames: AgentName[], skillId: SkillId): string {
  const subject = agentNames.length === 1 ? "Sub-agent" : "Sub-agents";
  const named = agentNames.map((name) => `'${name}'`).join(", ");
  return `${subject} ${named} cannot carry project-scoped skill '${skillId}' — global-scoped sub-agents only carry global-scoped skills.`;
}

/**
 * Hint printed when a project-context compile resolves zero project agents but
 * the config still declares global-scope agents. Names the global context and
 * the count so the "No agents to recompile" no-op isn't silent after a global
 * stack change.
 */
export function globalScopedAgentsHint(count: number): string {
  const subject = count === 1 ? "agent is" : "agents are";
  return `${count} ${subject} global-scoped — run '${CLI_INVOKE_COMMAND} compile' from your home directory, or edit from this project, to recompile them.`;
}

/** Summary printed after `update` refreshed every marketplace its config named. */
export function marketplacesRefreshed(count: number): string {
  return `Update complete! ${count} ${count === 1 ? "marketplace" : "marketplaces"} refreshed.`;
}

/** Warning printed for one marketplace the Claude CLI could not refresh. */
export function marketplaceRefreshFailed(marketplace: string, reason: string): string {
  return `Could not update marketplace ${marketplace}: ${reason}`;
}

/**
 * Warning printed when a remote source could not be reached to check whether the
 * cached copy is still current, and the copy was used anyway.
 *
 * The load succeeds — an offline user gets the marketplace they already have
 * rather than an error — so the line's whole job is to name what it is they got.
 */
export function sourceUnreachableUsingCache(source: string): string {
  return `Could not reach ${source} — using the cached copy, which may be out of date.`;
}

/**
 * Fatal summary naming every marketplace that failed to refresh. Each cause was
 * already warned individually; this is what makes the run exit non-zero.
 */
export function marketplacesRefreshFailed(marketplaces: string[]): string {
  const subject = marketplaces.length === 1 ? "marketplace" : "marketplaces";
  return `${marketplaces.length} ${subject} could not be updated: ${marketplaces.join(", ")}`;
}

/**
 * Warning printed when a compile pass finished but the scope's config-types.ts
 * could not be regenerated (e.g. the skills source was unreachable). The compiled
 * agents are fine; only the type unions may still be stale.
 */
export function configTypesRefreshFailed(reason: string): string {
  return `Could not refresh ${STANDARD_FILES.CONFIG_TYPES_TS} — type unions may be stale: ${reason}`;
}

/**
 * Summary printed after a global uninstall pruned the inlined global-scoped
 * config entries from the registered projects.
 */
export function registeredProjectsUpdated(count: number): string {
  return `Updated ${count} registered ${count === 1 ? "project" : "projects"}`;
}

/**
 * Warning printed when a global uninstall could not update one registered
 * project (missing directory or unreadable config). The uninstall continues.
 */
export function registeredProjectUpdateSkipped(projectPath: string): string {
  return `Could not update registered project at ${projectPath} — its config may still reference the uninstalled global content`;
}

/**
 * The file and the reason behind {@link skillMetadataUnusableError}, LOGGED rather than
 * carried in the error itself: oclif hard-wraps error text at the terminal width, and a path
 * broken across two lines is one nobody can copy. The error names the skills; this names
 * their files, unwrapped, immediately above it.
 *
 * The reason is the reader's own message and can run to several lines — a YAML parse error
 * carries the position and the offending line, which is the point of naming the file at all.
 * For a file that parsed, it is the fields the file leaves out, named as missing.
 */
export function skillMetadataUnusableDetail({
  skillDirName,
  metadataPath,
  reason,
}: UnusableSkillMetadata): string {
  return `  ${skillDirName} — ${metadataPath}\n    ${reason}`;
}

/**
 * Which skills the refusal is about, and that their files are named above it. Shared by both
 * refusals below because it is one sentence about one verdict — the commands differ on what
 * the file being unreadable COSTS, not on what it says.
 *
 * Every offending skill is named rather than the first, so one run fixes the lot.
 */
function metadataUnusableOpening(entries: UnusableSkillMetadata[]): string {
  const named = entries.map(({ skillDirName }) => `'${skillDirName}'`).join(", ");
  const subject = entries.length === 1 ? "that skill" : "those skills";
  return `The ${STANDARD_FILES.METADATA_YAML} of ${named} does not describe ${subject} — the file and the reason are named above.`;
}

/**
 * The two ways out, and where the whole list of skills in this state is reported. Also shared:
 * a refusal that named a different way out per command would be describing a different fault.
 */
const METADATA_UNUSABLE_WAY_OUT = `Fix the file, or delete the skill directory — '${CLI_INVOKE_COMMAND} doctor' reports every skill in this state.`;

/**
 * Refusal printed when `compile` meets an installed skill whose metadata.yaml exists but
 * describes no skill — either nothing can be parsed out of it, or it parses without the
 * fields a skill is described by. It is the sibling of {@link configUnreadableError} one
 * layer down: the file is there, and nothing can be made of it.
 *
 * Compile refuses rather than skips because a skipped skill is invisible. The same file is
 * refused by the local-skill discovery that regenerates `config-types.ts`, so a compile that
 * loaded the skill from its SKILL.md anyway would write agents around a skill the generated
 * types never carry — which is what it used to do, in the same run, silently.
 */
export function skillMetadataUnusableError(entries: UnusableSkillMetadata[]): string {
  return [
    metadataUnusableOpening(entries),
    `A skill this file cannot describe is skipped when ${STANDARD_FILES.CONFIG_TYPES_TS} is regenerated, so compiling it would write agents around a skill the generated types never carry.`,
    METADATA_UNUSABLE_WAY_OUT,
  ].join("\n");
}

/**
 * The same refusal raised by `init` and `edit`, where what the file costs is different: the
 * wizard resolves the installed roster against the catalogue, and a skill nothing can be
 * loaded for reaches no screen — so the entry naming it is dropped from `config.ts` and
 * reported as a removal the user never asked for.
 *
 * That is the right answer for a skill the marketplace no longer carries and the wrong one
 * here, where the files are sitting in the install and one repairable file stands between
 * them and the catalogue. So the run stops with the entry intact, exactly as `compile` stops
 * over the same verdict about the same file, rather than spending the record of an install
 * on a YAML typo and billing the marketplace for it.
 */
export function savedSkillMetadataUnusableError(entries: UnusableSkillMetadata[]): string {
  return [
    metadataUnusableOpening(entries),
    `A config entry naming a skill this file cannot describe is dropped as one this source does not carry — and a file that can be repaired must not cost an install its record.`,
    METADATA_UNUSABLE_WAY_OUT,
  ].join("\n");
}

/**
 * `init --from` is greenfield-only. A shared configuration is installed whole — its own
 * `assignments` map REPLACES the ownership-derived stack rather than merging with it — so there is
 * no coherent answer to what it should do when it meets a setup that is already there. Both
 * refusals below name `uninstall`, because that is the whole of the way through.
 */
const SHARED_CONFIG_GREENFIELD_HINT =
  "installing a shared configuration is a fresh setup, not a merge";

/** Refusal printed when the directory `init --from` was run in is already installed. */
export function sharedConfigExistingInstall(configPath: string): string {
  return `An installation already exists at ${configPath}. Run '${CLI_INVOKE_COMMAND} uninstall' first — ${SHARED_CONFIG_GREENFIELD_HINT}.`;
}

/**
 * Refusal printed when this project is clean but the payload writes into the user's own
 * ~/.claude, which is already installed. Only a payload carrying global-scoped entries can reach
 * that far, so a project-only configuration is never refused for it.
 */
export function sharedConfigGlobalInstall(configPath: string): string {
  return `This configuration installs global-scoped content, and a global installation already exists at ${configPath}. Run '${CLI_INVOKE_COMMAND} uninstall' from your home directory first — ${SHARED_CONFIG_GREENFIELD_HINT}.`;
}

/**
 * Refusal printed when a command that must read an existing configuration meets one it
 * cannot load. There are no versioned migrations, so an unreadable configuration is
 * recreated rather than repaired — and `uninstall` deliberately keeps working on one, which
 * is what makes the first instruction a real way out rather than a suggestion to delete
 * directories by hand. The editor is the other: it builds a configuration the CLI installs
 * by id.
 *
 * `configLoadFailure` is a `ConfigLoadError` message, so the offending file and the reason
 * are already in it and are not restated here.
 *
 * `doctor` is named last and deliberately: it reports this same file as its own finding, with the
 * same way out. It could not be named until it did — it used to call a config that exists but
 * cannot be read `.claude-src/config.ts not found` and send the reader to `init`, contradicting
 * every line below (CLI-430).
 */
export function configUnreadableError(configLoadFailure: string): string {
  return [
    configLoadFailure,
    `There is no automatic repair for this — recreate the configuration: '${CLI_INVOKE_COMMAND} uninstall' still works on a config it cannot read, then '${CLI_INVOKE_COMMAND} init'.`,
    `Or build one at ${EDITOR_URL} and install it with '${CLI_INVOKE_COMMAND} init --from <id>'.`,
    `'${CLI_INVOKE_COMMAND} doctor' reports the same file, alongside whatever else is wrong here.`,
  ].join("\n");
}

/**
 * Warning printed when a global uninstall could not update the registered
 * projects at all (e.g. the skills source failed to load). The uninstall
 * itself still completes.
 */
export function registeredProjectsUpdateFailed(reason: string): string {
  return `Could not update registered projects — their configs may still reference the uninstalled global content: ${reason}`;
}

/**
 * Statement printed in the uninstall removal plan when compiled agent files are on
 * disk but nothing can say which of them this CLI compiled. Removal matches on-disk
 * basenames against `config.agents`, so a run with no configuration it can read
 * leaves every one of them where it is — and the plan owes the reader that sentence
 * in place of the removal it would otherwise promise and then decline to make.
 */
export function compiledAgentsKept(agentsDir: string): string {
  return `Kept compiled agents in ${agentsDir}/ — identifying which of them this CLI compiled needs the configuration, and this run has none it could read.`;
}

/**
 * The uninstall removal plan's fixed text: the heading the whole plan is printed under,
 * and the heading each removal is grouped beneath. A heading is a promise about the lines
 * below it, so one is printed only when the plan carries a removal that sits under it.
 * Both renderers — the `--yes` printer and the confirm UI — read them from here, so the
 * preview a user approves and the list a `--yes` run prints cannot drift apart.
 */
export const UNINSTALL_PLAN = {
  PREVIEW_HEADING: "The following will be removed:",
  PLUGINS_HEADING: "Plugins:",
  CLI_MANAGED_FILES_HEADING: "CLI-managed files:",
  CONFIG_HEADING: "Config:",
} as const;

/**
 * The plan's line for the local skills directory. The directory is not removed wholesale —
 * only the skills whose `forked-from` metadata names a source are — so the line says which
 * of its contents the run is claiming.
 */
export function localSkillsRemoval(skillsDir: string): string {
  return `${skillsDir}/ (matching sources)`;
}

/**
 * The plan's line for the compiled agents directory, marking it as the CLI's to delete
 * rather than the user's. Printed only when the configuration names which agents this CLI
 * compiled; {@link compiledAgentsKept} stands in its place when nothing can.
 */
export function compiledAgentsRemoval(agentsDir: string): string {
  return `${agentsDir}/ (CLI-compiled)`;
}
