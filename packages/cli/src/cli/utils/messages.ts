import {
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  DEFAULT_PLUGIN_NAME,
  EDITOR_URL,
  LOCAL_SKILLS_PATH,
  MARKETPLACE_JSON,
  STANDARD_FILES,
  editorConfigUrl,
} from "../consts.js";
import type { UnusableSkillMetadata } from "../lib/loading/index.js";
import { charactersOutsideKebabCase } from "../lib/validate-kebab-name.js";
import type { AgentName, SkillId } from "../types/index.js";

export const ERROR_MESSAGES = {
  UNKNOWN_ERROR: "Unknown error occurred",
  UNKNOWN_ERROR_SHORT: "Unknown error",
  NO_INSTALLATION: `No installation found. Run '${CLI_INVOKE_COMMAND} init' first to set up ${DEFAULT_BRANDING.NAME}`,
  FAILED_RESOLVE_SOURCE: "Failed to resolve marketplace",
  FAILED_LOAD_AGENT_PARTIALS: "Failed to load agent partials",
  FAILED_COMPILE_AGENTS: "Failed to compile agents",
  CLAUDE_CLI_NOT_FOUND: `Claude CLI not found — '${CLI_INVOKE_COMMAND} update' refreshes marketplaces through it. Install Claude Code first: https://claude.ai/code`,
  /**
   * What `compile` refuses with when every pass discovered zero skills. It is reached only
   * after an installation was detected, so the state it describes is a configuration with
   * nothing installed under it — the same state `doctor` reports as `config-empty` and
   * names `init` for, because `init` on a config that declares nothing opens the wizard
   * rather than the dashboard. `edit` is the wrong half of the pair here: it modifies the
   * currently installed skills, and there are none to modify.
   */
  NO_SKILLS_TO_COMPILE: `No skills found. Run '${CLI_INVOKE_COMMAND} init' to choose skills, or add your own under ${LOCAL_SKILLS_PATH}/.`,
} as const;

export const SUCCESS_MESSAGES = {
  UNINSTALL_COMPLETE: "Uninstall complete!",
  INIT_SUCCESS: `${DEFAULT_BRANDING.NAME} initialized successfully!`,
  PLUGIN_COMPILE_COMPLETE: "Plugin compile complete!",
} as const;

export const STATUS_MESSAGES = {
  INSTALLING_PLUGINS: "Installing skill plugins...",
  LOADING_SKILLS: "Loading skills...",
  LOADING_MARKETPLACE_SOURCE: "Loading marketplace...",
  RECOMPILING_AGENTS: "Recompiling agents...",
  COMPILING_AGENTS: "Compiling agents...",
  DISCOVERING_SKILLS: "Discovering skills...",
  RESOLVING_SOURCE: "Resolving marketplace...",
  RESOLVING_MARKETPLACE_SOURCE: "Resolving marketplace...",
  LOADING_AGENT_PARTIALS: "Loading agent partials...",
  FETCHING_REPOSITORY: "Fetching repository...",
  COPYING_SKILLS: "Copying skills...",
  /**
   * Printed when revalidation found the remote marketplace had moved on. It is the
   * only warning a user gets that this load costs a download rather than a
   * cache read, so it goes out before the download starts, not after.
   */
  MARKETPLACE_HAS_NEWER_CONTENT: "Marketplace has newer content — fetching the update...",
} as const;

/**
 * The partials `readAgentFiles` compiles a sub-agent out of, in the order it reads them —
 * and therefore what `eject agent-partials` puts under the reader's control. Spelled from
 * {@link STANDARD_FILES} rather than as prose so the sentence below cannot name a file the
 * compiler does not read: it named "templates, agent intro, workflow, and examples" for
 * years, four nouns matching nothing that ships.
 */
const AGENT_PARTIAL_FILES = [
  STANDARD_FILES.IDENTITY_MD,
  STANDARD_FILES.PLAYBOOK_MD,
  STANDARD_FILES.CRITICAL_REQUIREMENTS_MD,
  STANDARD_FILES.CRITICAL_REMINDERS_MD,
  STANDARD_FILES.OUTPUT_MD,
];

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
  /** Printed under the destination `eject agent-partials` just named, so it names files only. */
  AGENT_PARTIALS_CUSTOMIZABLE: `Each sub-agent directory there holds ${AGENT_PARTIAL_FILES.join(", ")} — edit those to customize that sub-agent.`,
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
 * `build marketplace`'s refusal when package.json names no author, so the manifest
 * would carry an owner with no name.
 *
 * Refused rather than warned because `marketplaceOwnerSchema` requires that name: a
 * manifest written without one is a file this CLI's own reader rejects, and a build
 * that exits 0 having produced it reports success for a marketplace nobody can add.
 */
export function marketplaceOwnerHasNoName(packageJsonPath: string): string {
  return [
    `A marketplace's owner must have a name, and no name could be read from 'author' in ${packageJsonPath}.`,
    `Nothing was written: a ${MARKETPLACE_JSON} whose 'owner.name' is empty is refused by this CLI's own reader, so the build would have reported success for a marketplace nobody can install from.`,
    `Set 'author' in that file — either "Jane Doe <jane@example.com>" or { "name": "Jane Doe" } — and build again.`,
  ].join("\n\n");
}

/**
 * `build marketplace`'s refusal when package.json carries a version that is only a version
 * to a reader who does not check it.
 *
 * `marketplaceSchema` requires `min(1)` here, and nothing upstream did: the package.json
 * schema types the field as a bare string, and the generator's `??` default treats `""` as
 * a value because it is not nullish. So an empty version reached the manifest, the build
 * exited 0, and the file was refused the first time this CLI read it back — the same
 * write-then-fail-on-read shape the zero-plugin refusal closed.
 */
export function marketplaceHasNoVersion(packageJsonPath: string): string {
  return [
    `A marketplace must have a version, and 'version' in ${packageJsonPath} is empty.`,
    `Nothing was written: a ${MARKETPLACE_JSON} whose 'version' is empty is refused by this CLI's own reader, so the build would have reported success for a marketplace nobody can install from.`,
    `Set 'version' in that file — "0.1.0" if this is its first release — and build again.`,
  ].join("\n\n");
}

/**
 * `build marketplace`'s refusal when the name read from package.json is not one a
 * marketplace may publish under.
 *
 * The way out is the flag rather than a rename of the npm package: an npm scoped name
 * is a legitimate thing for a package to have and an illegitimate marketplace name, so
 * the two identities are allowed to differ. Every offending character is named, because
 * `@scope/thing` gives an author two edits to make and a rule alone gives them none.
 */
export function marketplaceNameNotPublishable(name: string, packageJsonPath: string): string {
  const offenders = charactersOutsideKebabCase(name);
  return [
    `Marketplace name '${name}', read from 'name' in ${packageJsonPath}, is not a name a marketplace may publish under.`,
    ...(offenders.length > 0
      ? [
          `It carries ${offenders.map((character) => `'${character}'`).join(" and ")}, which a marketplace name may not.`,
        ]
      : []),
    `A marketplace name is kebab-case: lowercase letters, numbers and hyphens, starting with a letter.`,
    `Publish under a name of your own instead: '${CLI_INVOKE_COMMAND} build marketplace --name <your-marketplace>'.`,
  ].join("\n\n");
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
    `A config entry naming a skill this file cannot describe is dropped as one this marketplace does not carry — and a file that can be repaired must not cost an install its record.`,
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

/**
 * Where a freshly minted id can be acted on, which is the whole of what makes it a share.
 *
 * Exactly two things read one — this CLI and the editor the configuration reopens in — and both
 * commands that mint an id (`share`, and `edit --ui`) print both lines, because an id nobody can
 * act on is not a share. One definition rather than two, so the two commands cannot come to
 * describe the same id differently.
 */
export function sharedConfigDestinations(id: string): string[] {
  return [
    `  Install it:  ${CLI_INVOKE_COMMAND} init --from ${id}`,
    `  Open it:     ${editorConfigUrl(id)}`,
  ];
}

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
 * Refusal printed when `init --from` runs at the home directory and the payload carries
 * project-scoped entries.
 *
 * It is NOT a greenfield refusal, and deliberately says nothing about `uninstall`: the payload is
 * installable and the location is not, so the way out is another directory rather than a removal.
 * A global installation holds only global-scoped content, and at the home root both scopes resolve
 * to the same files — so a project-scoped entry does not land elsewhere, it lands in the global
 * config wearing a label that contradicts the file it is in.
 *
 * Every offender is named, skills and sub-agents alike, because they are separate decisions in the
 * payload and only the sharer knows which one they meant — the same reason the unwritable-pair
 * refusal names both halves of every pair.
 */
export function sharedConfigProjectScopeAtHome(
  skillIds: readonly SkillId[],
  agentNames: readonly AgentName[],
): string {
  return [
    "This configuration cannot be installed here: the home directory is the global scope, and a " +
      "global installation holds only global-scoped content — so these project-scoped entries " +
      "have nowhere to be written:",
    ...skillIds.map((id) => `  skill ${id} (scope: project)`),
    ...agentNames.map((name) => `  sub-agent ${name} (scope: project)`),
    "Run this from inside a project directory, or re-share it with each entry above at global scope.",
  ].join("\n");
}

/**
 * The ids a decode could not place, named rather than counted.
 *
 * "3 skills were skipped" cannot be acted on; the ids can, and this is the one moment a user
 * can tell whether what was shared is what they are getting. One definition because both
 * consumers of a shared configuration report it — `init --from` on the way into a clean
 * directory, `edit --from` on the way over an installed one — and a skip that read differently
 * per command would look like a different kind of skip.
 */
export function skippedUnknownSkills(skillIds: readonly string[]): string {
  return `Skipped ${skillIds.length} skill(s) this catalog does not know: ${skillIds.join(", ")}`;
}

/** The sub-agent half of {@link skippedUnknownSkills}, judged against `AGENT_NAMES`. */
export function skippedUnknownAgents(agentNames: readonly string[]): string {
  return `Skipped ${agentNames.length} unknown sub-agent(s): ${agentNames.join(", ")}`;
}

/**
 * What a shared configuration brought with it rather than named. Named for the same reason the
 * skips are: these are the entries no catalogue can explain, so this line is the only place a
 * user learns what arrived inside the configuration itself.
 */
export function carriedSkillsWritten(skillIds: readonly string[]): string {
  return `Wrote ${skillIds.length} skill(s) this configuration carries: ${skillIds.join(", ")}`;
}

/**
 * The fixed text of `edit --from`'s removal plan.
 *
 * Applying a shared configuration makes this project MATCH it, so a skill the previous
 * configuration installed and this payload omits is removed. That is the whole reason the
 * command is interactive, and the reason the heading names removal rather than the apply:
 * additions and re-tunings need no permission, and the change summary prints them afterwards.
 */
export const SHARED_CONFIG_APPLY = {
  PREVIEW_HEADING: "Applying this configuration will remove:",
  SKILLS_HEADING: "Skills:",
  AGENTS_HEADING: "Sub-agents:",
  /**
   * The two headings a PROJECT run prints instead, for entries that live at global scope. They
   * exist only there: at the home directory every entry is global, so a heading saying so would
   * label the whole list with the one fact the location already states.
   */
  GLOBAL_SKILLS_HEADING: "Skills installed globally:",
  GLOBAL_AGENTS_HEADING: "Sub-agents installed globally:",
  /** Printed in place of the sections when the payload takes nothing away. */
  NOTHING_REMOVED: "Nothing is removed — this configuration only adds and re-tunes.",
  CONFIRM: "Apply this configuration?",
} as const;

/**
 * Refusal printed when `edit --from` has no terminal to confirm its removals at.
 *
 * A confirm nobody can answer must never become a yes, so this refuses rather than applying
 * silently. It names the other command deliberately: `init --from` installs the same
 * configuration into a clean directory and removes nothing, so it is safe headless and is the
 * whole of what a pipeline can do with an id.
 */
export function sharedConfigNeedsTerminal(id: string): string {
  return [
    `Applying configuration '${id}' removes whatever it leaves out, so it has to be confirmed — and there is no terminal here to confirm it at.`,
    `Run '${CLI_INVOKE_COMMAND} edit --from ${id}' from a terminal, or '${CLI_INVOKE_COMMAND} init --from ${id}' in a clean directory, which installs without removing anything.`,
  ].join("\n");
}

/**
 * Refusal printed when `edit --ui` and `edit --from` are asked for at once. They are the two
 * ends of one round trip — one hands this installation to the editor, the other applies a
 * configuration back — and there is no order in which doing both in a single run means
 * anything.
 */
export const SHARED_CONFIG_ONE_DIRECTION =
  "--ui and --from are the two directions of the same round trip: --ui hands this installation to the editor, and --from applies one back. Run one, then the other.";

/**
 * The removal plan's statement of CONSEQUENCE for entries a project run removes at global scope.
 *
 * A global install is one installation every registered project reads, so removing one from
 * inside a project changes projects the person confirming is not looking at and did not choose
 * to be looking at. Nothing is refused over that — the ruling is that they may do it — but a yes
 * given without it is a yes to a change nobody described, so the reach is counted AND named:
 * "2 other projects" cannot be weighed against anything, and a path can.
 *
 * Printed only from a PROJECT. Inside the global installation the location IS the scope and the
 * person chose it, so the ordinary apply confirm is the whole of the gate there — see
 * `edit`'s two plan branches.
 */
export function globallyInstalledRemoved(otherProjects: readonly string[]): string {
  return [
    "These are installed globally, and a global install is shared by every project on this machine.",
    ...globalRemovalReach(otherProjects),
    `To keep them, answer no and re-share the configuration with them included.`,
  ].join("\n");
}

/** Who else the removal above lands on: every registered project but the one being edited. */
function globalRemovalReach(otherProjects: readonly string[]): string[] {
  if (otherProjects.length === 0) {
    return [
      "No other project is registered here, so nothing else changes today — a project set up later inherits whatever the global install holds then.",
    ];
  }

  return [
    `Also affects ${otherProjects.length} other registered project(s):`,
    ...otherProjects.map((projectDir) => `  ${projectDir}`),
  ];
}

/**
 * The removal plan's statement for skills the round trip does not own.
 *
 * `forkedFrom` decides ownership: the CLI stamps it into every skill directory it writes, and a
 * skill written by hand into `.claude/skills/` carries none — so no shared configuration ever
 * carried it, and this one made no statement about it. Deleting it would be this command
 * inventing an instruction nobody gave.
 */
export function authoredHereKept(skillIds: readonly SkillId[]): string {
  return [
    "Kept — written here rather than installed, so a shared configuration never carried them:",
    ...skillIds.map((id) => `  skill ${id}`),
    `Remove them with '${CLI_INVOKE_COMMAND} edit'.`,
  ].join("\n");
}

/**
 * The removal plan's statement for skills this configuration NAMES that this catalogue cannot
 * place.
 *
 * The skips reported earlier say what did not arrive; this says what stayed because of it, and
 * the two are one fact read from either end. A destructive apply removes on intent and never on
 * its own inability: the payload asked for these ids, so their absence from the decode is this
 * catalogue's limit rather than an instruction, and deleting an installed skill over it would
 * delete it because the catalogue moved.
 *
 * The remedy is the catalogue rather than the skill, which is the whole difference from the two
 * statements above: nothing is wrong with what is installed, and nothing the user does to it
 * makes the configuration's instruction applicable.
 */
export function unplaceableKept(skillIds: readonly SkillId[]): string {
  return [
    "Kept — named by this configuration, and this catalogue cannot place them:",
    ...skillIds.map((id) => `  skill ${id}`),
    `Run '${CLI_INVOKE_COMMAND} update' to refresh this installation's marketplace, then apply the configuration again.`,
  ].join("\n");
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
 * Statement printed in the uninstall removal plan, and again in the summary, for the agent
 * files this run leaves where they are. Every agent the compiler writes carries a provenance
 * marker, so an agent file without one was written by somebody else — and saying so is what
 * makes the removal beside it a claim about provably-ours rather than about a directory.
 *
 * Printed both before the confirmation and after the removal, from the one plan, so what the
 * user approved and what the run reports cannot disagree.
 */
export function unmarkedAgentsKept(agentsDir: string, count: number): string {
  const subject = count === 1 ? "agent" : "agents";
  const object = count === 1 ? "it" : "them";
  return `Kept ${count} ${subject} in ${agentsDir}/ — no ${DEFAULT_PLUGIN_NAME} marker, so this CLI did not compile ${object}.`;
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
 * only the skills whose `forked-from` metadata names a marketplace are — so the line says
 * which of its contents the run is claiming.
 */
export function localSkillsRemoval(skillsDir: string): string {
  return `${skillsDir}/ (matching the marketplace)`;
}

/**
 * The plan's line for the compiled agents directory, marking it as the CLI's to delete
 * rather than the user's. Printed when the run can name which agents those are — from the
 * configuration, or from the provenance marker each compiled file carries when the
 * configuration is gone. {@link unmarkedAgentsKept} names the rest.
 */
export function compiledAgentsRemoval(agentsDir: string): string {
  return `${agentsDir}/ (CLI-compiled)`;
}
