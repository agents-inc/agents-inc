import {
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  DEFAULT_PLUGIN_NAME,
  EDITOR_URL,
  LOCAL_SKILLS_PATH,
  MARKETPLACE_JSON,
  PLUGIN_MANIFEST_DIR,
  STANDARD_FILES,
  editorConfigUrl,
  type Provider,
} from "../consts.js";
import type { UnusableSkillMetadata } from "../lib/loading/index.js";
import type { ScopeKind } from "../lib/installation/source-scopes.js";
import type { ConfigLoadError } from "../lib/configuration/project-config.js";
import type { JoinedAgent } from "../lib/seed/seed-apply.js";
import type { SkippedSkillAgents } from "@workspace/compile/seed-to-config";
import { RETIRED_SOURCE_FOLDER } from "../lib/installation/install-layout.js";
import { charactersOutsideKebabCase } from "../lib/validate-kebab-name.js";
import { plural, stripTerminalControls } from "./string.js";
import type { AgentName, Category, SkillId } from "../types/index.js";

export const ERROR_MESSAGES = {
  UNKNOWN_ERROR: "Unknown error occurred",
  UNKNOWN_ERROR_SHORT: "Unknown error",
  NO_INSTALLATION: `No installation found. Run '${CLI_INVOKE_COMMAND} init' first to set up ${DEFAULT_BRANDING.NAME}`,
  FAILED_RESOLVE_SOURCE: "Failed to resolve marketplace",
  FAILED_LOAD_AGENT_PARTIALS: "Failed to load agent partials",
  FAILED_COMPILE_AGENTS: "Failed to compile agents",
  /** Names `init`, not `edit`: there are no installed skills to edit. */
  NO_SKILLS_TO_COMPILE: `No skills found. Run '${CLI_INVOKE_COMMAND} init' to choose skills, or add your own under ${LOCAL_SKILLS_PATH}/.`,
} as const;

export const SUCCESS_MESSAGES = {
  UNINSTALL_COMPLETE: "Uninstall complete!",
  PLUGIN_COMPILE_COMPLETE: "Plugin compile complete!",
} as const;

const HOST_CLI: Record<Provider, { name: string; install: string }> = {
  claude: { name: "Claude CLI", install: "Install Claude Code first: https://claude.ai/code" },
  codex: {
    name: "Codex CLI",
    install: "Install the '@openai/codex' package first, so that 'codex' is on PATH",
  },
};

export function hostCliNotFound(provider: Provider): string {
  const cli = HOST_CLI[provider];
  return `${cli.name} not found — '${CLI_INVOKE_COMMAND} update' refreshes marketplaces through it. ${cli.install}`;
}

export function pluginLeftRegistered(pluginRef: string, provider: Provider): string {
  const cli = HOST_CLI[provider];
  return `Could not unregister plugin '${pluginRef}': ${cli.name} not found, so it stays registered. ${cli.install}`;
}

export function initSucceeded(brandingName: string): string {
  return `${brandingName} initialized successfully!`;
}

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
  /** Printed before the download starts: the only sign this load is not a cache read. */
  MARKETPLACE_HAS_NEWER_CONTENT: "Marketplace has newer content — fetching the update...",
} as const;

/** The partials `readAgentFiles` compiles a sub-agent from, in read order. */
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
  CONFIG_TYPES_REFRESHED: `Refreshed ${STANDARD_FILES.CONFIG_TYPES_TS}`,
  EJECTED_SKILLS_USER_OWNED: `Ejected skills are yours to own — '${CLI_INVOKE_COMMAND} update' does not change them.`,
  NO_PLUGIN_MARKETPLACES: "No plugin marketplaces are configured — nothing to refresh.",
  /** Printed under the destination already named, so it names files only. */
  AGENT_PARTIALS_CUSTOMIZABLE: `Each sub-agent directory there holds ${AGENT_PARTIAL_FILES.join(", ")} — edit those to customize that sub-agent.`,
} as const;

export function notInstalledHere(brandingName: string): string {
  return `${brandingName} is not installed in this project.`;
}

export function pluginsInstalled(count: number): string {
  return `Installed ${plural(count, "skill plugin")}`;
}

/** No destination: the copies are split between project and home by each skill's scope. */
export function localSkillsCopied(count: number): string {
  return `Copied ${count} local skill(s)`;
}

/** `subject` is singular, pluralised against `rewritten`. */
export function recompileSummary(rewritten: number, unchanged: number, subject: string): string {
  return `${plural(rewritten, subject)} rewritten, ${unchanged} unchanged`;
}

export function agentsNotCompiled(agentNames: readonly AgentName[]): string {
  return `${agentNames.length} sub-agent(s) did not compile: ${agentNames.join(", ")}`;
}

export type IncompleteWork = {
  what: string;
  recovery: string;
};

/** One sentence per kind of leftover state, not per failure site. */
export const INCOMPLETE_WORK_RECOVERY = {
  RECOMPILE: `Run '${CLI_INVOKE_COMMAND} compile' — the compiled agents on disk are stale until you do.`,
  INSPECT_INSTALLATION: `Run '${CLI_INVOKE_COMMAND} doctor' to see what this installation is left holding.`,
  DELETE_AGENT_FILE:
    "Delete the file by hand — Claude Code loads a compiled sub-agent this project no longer configures.",
} as const;

/** Restates warnings already printed: it is what explains a non-zero exit from a finished run. */
export function completedWithFailures(failures: readonly IncompleteWork[]): string {
  return [
    `Completed with ${failures.length} failure(s) — the changes above landed, these did not:`,
    ...failures.flatMap(failureLines),
  ].join("\n");
}

function failureLines({ what, recovery }: IncompleteWork): string[] {
  return [`  ${what}`, `    ${recovery}`];
}

/** A project counts as rewritten when its config pair or its compiled sub-agents changed. */
export function propagatedRecompileSummary(
  rewritten: number,
  unchanged: number,
  failed: number,
): string {
  const failureSuffix = failed > 0 ? ` (${failed} failed)` : "";
  return `Registered projects: ${rewritten} rewritten, ${unchanged} unchanged${failureSuffix}`;
}

export function skillAssignedToNoAgent(skillId: SkillId): string {
  return `Skill '${skillId}' is assigned to no sub-agent — nothing will load it.`;
}

export function scopeBlockedStackAssignment(agentNames: AgentName[], skillId: SkillId): string {
  const subject = agentNames.length === 1 ? "Sub-agent" : "Sub-agents";
  const named = agentNames.map((name) => `'${name}'`).join(", ");
  return `${subject} ${named} cannot carry project-scoped skill '${skillId}' — global-scoped sub-agents only carry global-scoped skills.`;
}

export function globalScopedAgentsHint(count: number): string {
  const [subject, object] = count === 1 ? ["agent is", "it"] : ["agents are", "them"];
  return `${count} ${subject} global-scoped — run '${CLI_INVOKE_COMMAND} compile' from your home directory to recompile ${object}.`;
}

export function marketplacesRefreshed(count: number): string {
  return `Refreshed ${plural(count, "marketplace listing")}. Installed plugins were not changed.`;
}

export function marketplaceRefreshFailed(marketplace: string, reason: string): string {
  return `Could not update marketplace ${marketplace}: ${reason}`;
}

export function sourceUnreachableUsingCache(source: string): string {
  return `Could not reach ${source} — using the cached copy, which may be out of date.`;
}

export function marketplacesRefreshFailed(marketplaces: string[]): string {
  return `${plural(marketplaces.length, "marketplace")} could not be updated: ${marketplaces.join(", ")}`;
}

export function marketplaceOwnerHasNoName(packageJsonPath: string): string {
  return [
    `A marketplace's owner must have a name, and no name could be read from 'author' in ${packageJsonPath}.`,
    `Nothing was written: a ${MARKETPLACE_JSON} whose 'owner.name' is empty is refused by this CLI's own reader, so the build would have reported success for a marketplace nobody can install from.`,
    `Set 'author' in that file — either "Jane Doe <jane@example.com>" or { "name": "Jane Doe" } — and build again.`,
  ].join("\n\n");
}

export function marketplaceHasNoVersion(packageJsonPath: string): string {
  return [
    `A marketplace must have a version, and 'version' in ${packageJsonPath} is empty.`,
    `Nothing was written: a ${MARKETPLACE_JSON} whose 'version' is empty is refused by this CLI's own reader, so the build would have reported success for a marketplace nobody can install from.`,
    `Set 'version' in that file — "0.1.0" if this is its first release — and build again.`,
  ].join("\n\n");
}

export function marketplaceNameNotPublishable(name: string, packageJsonPath: string): string {
  return [
    `Marketplace name '${name}', read from 'name' in ${packageJsonPath}, is not a name a marketplace may publish under.`,
    ...offendingCharactersStatement(name),
    `A marketplace name is kebab-case: lowercase letters, numbers and hyphens, starting with a letter.`,
    `Publish under a name of your own instead: '${CLI_INVOKE_COMMAND} build marketplace --name <your-marketplace>'.`,
  ].join("\n\n");
}

function offendingCharactersStatement(name: string): string[] {
  const offenders = charactersOutsideKebabCase(name);
  if (offenders.length === 0) return [];

  const named = offenders.map((character) => `'${character}'`).join(" and ");
  return [`It carries ${named}, which a marketplace name may not.`];
}

const MARKETPLACE_MANIFEST = `${PLUGIN_MANIFEST_DIR}/${MARKETPLACE_JSON}`;

const MARKETPLACE_MANIFEST_REQUIRED = [
  `Every marketplace other than the default one must publish a valid ${MARKETPLACE_MANIFEST}.`,
  `Run '${CLI_INVOKE_COMMAND} build plugins' and then '${CLI_INVOKE_COMMAND} build marketplace' in that marketplace's repository, which write it.`,
].join(" ");

export function marketplaceManifestMissing(source: string): string {
  return [
    `'${source}' has no ${MARKETPLACE_MANIFEST}, so it is not a marketplace yet.`,
    MARKETPLACE_MANIFEST_REQUIRED,
  ].join("\n\n");
}

export function marketplaceManifestUnreadable(source: string, reason: string): string {
  return [
    `'${source}' has a ${MARKETPLACE_MANIFEST} this CLI cannot read:\n${reason}`,
    MARKETPLACE_MANIFEST_REQUIRED,
  ].join("\n\n");
}

export function configTypesRefreshFailed(reason: string): string {
  return `Could not refresh ${STANDARD_FILES.CONFIG_TYPES_TS} — type unions may be stale: ${reason}`;
}

export function registeredProjectsUpdated(count: number): string {
  return `Updated ${plural(count, "registered project")}`;
}

export function registeredProjectUpdateSkipped(projectPath: string): string {
  return `Could not update registered project at ${projectPath} — its config may still reference the uninstalled global content`;
}

export function registeredProjectConfigUnreadable(projectPath: string): string {
  return `Skipped ${projectPath}: its config.ts can't be read.`;
}

export function registeredProjectGone(projectPath: string): string {
  return `Skipped ${projectPath}: nothing is installed there any more.`;
}

export function registeredProjectOnAnotherProvider(projectPath: string): string {
  return `Skipped ${projectPath}: it is another provider's installation.`;
}

export function registeredProjectUpdateFailed(projectPath: string): string {
  return `Skipped ${projectPath}: updating it failed.`;
}

/** Logged rather than put in the error: oclif hard-wraps error text, breaking copyable paths. */
export function skillMetadataUnusableDetail({
  skillDirName,
  metadataPath,
  reason,
}: UnusableSkillMetadata): string {
  return `  ${skillDirName} — ${metadataPath}\n    ${reason}`;
}

function metadataUnusableOpening(entries: UnusableSkillMetadata[]): string {
  const named = entries.map(({ skillDirName }) => `'${skillDirName}'`).join(", ");
  const subject = entries.length === 1 ? "that skill" : "those skills";
  return `The ${STANDARD_FILES.METADATA_YAML} of ${named} does not describe ${subject} — the file and the reason are named above.`;
}

const METADATA_UNUSABLE_WAY_OUT = `Fix the file, or delete the skill directory — '${CLI_INVOKE_COMMAND} doctor' reports every skill in this state.`;

export function skillMetadataUnusableError(entries: UnusableSkillMetadata[]): string {
  return [
    metadataUnusableOpening(entries),
    `A skill this file cannot describe is skipped when ${STANDARD_FILES.CONFIG_TYPES_TS} is regenerated, so compiling it would write agents around a skill the generated types never carry.`,
    METADATA_UNUSABLE_WAY_OUT,
  ].join("\n");
}

export function savedSkillMetadataUnusableError(entries: UnusableSkillMetadata[]): string {
  return [
    metadataUnusableOpening(entries),
    `A config entry naming a skill this file cannot describe is dropped as one this marketplace does not carry — and a file that can be repaired must not cost an install its record.`,
    METADATA_UNUSABLE_WAY_OUT,
  ].join("\n");
}

export function editorSkillMetadataUnusableError(entries: UnusableSkillMetadata[]): string {
  return [
    metadataUnusableOpening(entries),
    `The editor opens on what these files describe, so no link is made until each one describes its skill.`,
    METADATA_UNUSABLE_WAY_OUT,
  ].join("\n");
}

const SHARED_CONFIG_GREENFIELD_HINT =
  "installing a shared configuration is a fresh setup, not a merge";

export function sharedConfigDestinations(id: string): string[] {
  return [
    `  Install it:  ${CLI_INVOKE_COMMAND} init --from ${id}`,
    `  Open it:     ${editorConfigUrl(id)}`,
  ];
}

export function applySharedConfigHere(
  id: string | undefined,
  installedHere: boolean,
  provider: Provider | undefined,
): string {
  const command = `${CLI_INVOKE_COMMAND} ${installedHere ? "edit" : "init"} --from`;
  const verb = installedHere ? "apply" : "install";
  const named = providerArgument(provider);
  return id === undefined
    ? `Then ${verb} what it gives you with '${command} <id>${named}'.`
    : `To ${verb} it here instead, run '${command} ${id}${named}'.`;
}

export function shareRefusesEjectedSkills(skillIds: readonly string[]): string {
  return [
    "This installation holds ejected skills, and ejected skills cannot be shared:",
    ...skillIds.map((id) => `  ${id}`),
    "Only plugins can be shared.",
  ].join("\n");
}

export function sharedIdNamesAFolder(folder: string): string {
  return `This id names the marketplace folder ${folder}, so it installs only where that folder exists.`;
}

export function sharedSkillsLeftBehind(skillIds: readonly string[]): string {
  return `A shared id names one marketplace, and these skill(s) come from another, so they will not install elsewhere: ${skillIds.join(", ")}`;
}

export function sharedConfigExistingInstall(
  configPath: string,
  id: string,
  provider: Provider | undefined,
): string {
  return `An installation already exists at ${configPath}. Run '${CLI_INVOKE_COMMAND} uninstall${providerArgument(provider)}' first — ${SHARED_CONFIG_GREENFIELD_HINT}. ${applySharedConfigHere(id, true, provider)}`;
}

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

/** A key no catalogue knows came off the wire as written, so it is printed inert. */
function unknownKeys(keys: readonly string[]): string {
  return keys.map(stripTerminalControls).join(", ");
}

export function skippedUnknownSkills(
  skillIds: readonly string[],
  skippedWith: readonly SkippedSkillAgents[],
): string {
  return [
    `Skipped ${skillIds.length} skill(s) this catalog does not know: ${unknownKeys(skillIds)}`,
    ...skippedWith.map(
      ({ skillId, agentNames }) =>
        `  sub-agent(s) skipped with ${unknownKeys([skillId])}, carrying nothing else this catalog knows: ${agentNames.join(", ")}`,
    ),
  ].join("\n");
}

export function skippedUnknownAgents(agentNames: readonly string[]): string {
  return `Skipped ${agentNames.length} unknown sub-agent(s): ${unknownKeys(agentNames)}`;
}

export function carriedSkillsWritten(skillIds: readonly string[]): string {
  return `Wrote ${skillIds.length} skill(s) this configuration carries: ${skillIds.join(", ")}`;
}

export const SHARED_CONFIG_APPLY = {
  PREVIEW_HEADING: "Applying this configuration will remove:",
  SKILLS_HEADING: "Skills:",
  AGENTS_HEADING: "Sub-agents:",
  NOTHING_REMOVED: "Nothing is removed — this configuration only adds and re-tunes.",
  OVERWRITTEN_HEADING: "Will be overwritten:",
  CONFIRM: "Apply this configuration?",
} as const;

export function projectCopyRemoved(subject: string): string {
  return `${subject}: this project's copy is removed; the global one takes over`;
}

export function projectCopyMovedToGlobal(subject: string): string {
  return `${subject}: moves to the global install, so this project's copy is removed`;
}

export function registeredProjectsRewritten(projectPaths: readonly string[]): string {
  return [
    "Each project registered with this global install is rewritten to match:",
    ...projectPaths.map((projectPath) => `  ${projectPath}`),
  ].join("\n");
}

/** `provider` is the one the run named, which its commands must name again. */
export function sharedConfigNeedsTerminal(id: string, provider: Provider | undefined): string {
  const named = providerArgument(provider);
  return [
    `Applying configuration '${id}' removes whatever it leaves out, so it has to be confirmed — and there is no terminal here to confirm it at.`,
    `Run '${CLI_INVOKE_COMMAND} edit --from ${id}${named}' from a terminal, or '${CLI_INVOKE_COMMAND} init --from ${id}${named}' in a clean directory, which installs without removing anything.`,
  ].join("\n");
}

export function nothingInstalledToApplyTo(id: string, provider: Provider | undefined): string {
  return `No installation found. Run '${CLI_INVOKE_COMMAND} init --from ${id}${providerArgument(provider)}' to install configuration '${id}' here.`;
}

/** `provider` is the one the run named, which its commands must name again. */
export function uninstallNeedsTerminal(provider: Provider | undefined): string {
  const named = providerArgument(provider);
  return [
    "Uninstalling removes files, so it has to be confirmed — and there is no terminal here to confirm it at.",
    `Run '${CLI_INVOKE_COMMAND} uninstall${named}' from a terminal, or '${CLI_INVOKE_COMMAND} uninstall --yes${named}' to remove it without being asked.`,
  ].join("\n");
}

export function addMarketplaceInTheEditor(ref: string, isFolder: boolean): string {
  return isFolder
    ? `${ref} is a folder on this machine, which the editor cannot read — push it to GitHub, then add it from the editor's Marketplace button.`
    : `Add ${ref} from the editor's Marketplace button.`;
}

export const SHARED_CONFIG_ARRIVALS = {
  PROJECT_HEADING: "Into this project:",
  GLOBAL_HEADING: "Into the global install:",
  SKIPPED_HEADING: "Skipped, already in the global install:",
  INSTALL_CONFIRM: "Install this configuration?",
} as const;

/** `idAppliedAtHome` is the id only where a run from home would take the configuration. */
export function keptAsInstalledGlobally(
  skillIds: readonly SkillId[],
  agentNames: readonly AgentName[],
  idAppliedAtHome: string | undefined,
): string {
  return [
    "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
    ...skillIds.map((id) => `  skill ${id}`),
    ...agentNames.map((name) => `  sub-agent ${name}`),
    ...(idAppliedAtHome === undefined
      ? []
      : [
          `Change them with '${CLI_INVOKE_COMMAND} edit --from ${idAppliedAtHome}' from your home directory.`,
        ]),
  ].join("\n");
}

export function addedToGlobalSubAgents(joined: readonly JoinedAgent[]): string {
  return [
    "Added to sub-agents in the global install — each keeps everything it already has, since a project run only adds to the global install:",
    ...joined.map(
      ({ agentName, skillIds }) => `  sub-agent ${agentName}: + ${skillIds.join(", ")}`,
    ),
  ].join("\n");
}

export function authoredHereKept(skillIds: readonly SkillId[]): string {
  return [
    "Kept — written here rather than installed, so a shared configuration never carried them:",
    ...skillIds.map((id) => `  skill ${id}`),
  ].join("\n");
}

export function unplaceableKept(skillIds: readonly SkillId[]): string {
  return [
    "Kept — named by this configuration, and this catalogue cannot place them:",
    ...skillIds.map((id) => `  skill ${id}`),
    `Run '${CLI_INVOKE_COMMAND} update' to refresh this installation's marketplace, then apply the configuration again.`,
  ].join("\n");
}

export function keptUnassigned(skillId: SkillId, agentName: AgentName, category: Category): string {
  return `${skillId}: kept, no longer assigned to ${agentName}'s ${category}`;
}

function doctorReportsTheSame(count: number): string {
  return `'${CLI_INVOKE_COMMAND} doctor' reports the same ${count === 1 ? "file" : "files"}, alongside whatever else is wrong here.`;
}

type UnreadableConfig = Pick<
  ConfigLoadError,
  "configPath" | "reason" | "scope" | "scopeRoot" | "providerToName"
>;

export function installationConfigsUnreadable(failures: readonly UnreadableConfig[]): string {
  return [...failures.flatMap(whoseConfigAndItsWayOut), doctorReportsTheSame(failures.length)].join(
    "\n",
  );
}

function whoseConfigAndItsWayOut(failure: UnreadableConfig): string[] {
  return [
    `${scopeLabel(failure.scope)}'s config at '${failure.configPath}' could not be loaded: ${failure.reason}`,
    `There is no automatic repair for this — fix the file, or recreate the configuration by running ${recreateConfigFrom(failure)}.`,
  ];
}

export function uninstallConfigUnreadable(
  failure: Pick<ConfigLoadError, "scope" | "message">,
): string {
  return `Could not read the ${failure.scope} config — plugins and compiled agents it lists may be left behind: ${failure.message}`;
}

export function uninstallSkillMetadataUnreadable(metadataPath: string): string {
  return `Cannot read ${metadataPath}, so uninstall cannot tell whether it made that skill. Fix the file's permissions, or move the skill out, and run uninstall again.`;
}

export function recreateConfigFrom({
  scopeRoot,
  providerToName,
}: Pick<UnreadableConfig, "scopeRoot" | "providerToName">): string {
  const named = providerArgument(providerToName);
  return `'${CLI_INVOKE_COMMAND} uninstall${named}' from '${scopeRoot}', which still works on a config it cannot read, then '${CLI_INVOKE_COMMAND} init --from <id>${named}' with an id from ${EDITOR_URL}`;
}

/** Beside a second installation an acting command refuses until it is told which one. */
export function providerArgument(provider: Provider | undefined): string {
  return provider === undefined ? "" : ` --provider ${provider}`;
}

export function configUnreadableError(configLoadFailure: string): string {
  return [
    configLoadFailure,
    "This is the marketplace's own config rather than an installation's, so it is fixed in the marketplace repository it comes from.",
  ].join("\n");
}

export function registeredProjectsUpdateFailed(reason: string): string {
  return `Could not update registered projects — their configs may still reference the uninstalled global content: ${reason}`;
}

export function unmarkedAgentsKept(agentsDir: string, count: number): string {
  const object = count === 1 ? "it" : "them";
  return `Kept ${plural(count, "agent")} in ${agentsDir}/ — no ${DEFAULT_PLUGIN_NAME} marker, so this CLI did not compile ${object}.`;
}

export const UNINSTALL_PLAN = {
  PREVIEW_HEADING: "The following will be removed:",
  PLUGINS_HEADING: "Plugins:",
  CLI_MANAGED_FILES_HEADING: "CLI-managed files:",
  CONFIG_HEADING: "Config:",
} as const;

export function localSkillsRemoval(skillsDir: string): string {
  return `${skillsDir}/ (matching the marketplace)`;
}

export function compiledAgentsRemoval(agentsDir: string): string {
  return `${agentsDir}/ (CLI-compiled)`;
}

export function scopeNoun(kind: ScopeKind): string {
  return kind === "project" ? "this project" : "the global installation";
}

export function scopeLabel(kind: ScopeKind): string {
  return sentenceCase(scopeNoun(kind));
}

function sentenceCase(text: string): string {
  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
}

export function layoutIsCurrent(label: string, to: string): string {
  return `${label} is on ${to}/`;
}

export function retiredSourceFolderUnsupported(replacement: string): string {
  return `${RETIRED_SOURCE_FOLDER}/ is no longer supported (agents-inc now serves Claude and Codex). Move it to ${replacement}/.`;
}
