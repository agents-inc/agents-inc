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
import { RETIRED_SOURCE_FOLDER } from "../lib/installation/install-layout.js";
import { charactersOutsideKebabCase } from "../lib/validate-kebab-name.js";
import { plural } from "./string.js";
import type { AgentName, Category, SkillId } from "../types/index.js";

export const ERROR_MESSAGES = {
  UNKNOWN_ERROR: "Unknown error occurred",
  UNKNOWN_ERROR_SHORT: "Unknown error",
  NO_INSTALLATION: `No installation found. Run '${CLI_INVOKE_COMMAND} init' first to set up ${DEFAULT_BRANDING.NAME}`,
  FAILED_RESOLVE_SOURCE: "Failed to resolve marketplace",
  FAILED_LOAD_AGENT_PARTIALS: "Failed to load agent partials",
  FAILED_COMPILE_AGENTS: "Failed to compile agents",
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
  PLUGIN_COMPILE_COMPLETE: "Plugin compile complete!",
} as const;

/**
 * How each provider's own CLI is named, and what a user does about it not being there.
 *
 * A table keyed on {@link Provider} rather than a sentence built from the provider's own value:
 * "Codex CLI" and "Claude Code" are proper names, and the thing to DO about each is a different
 * fact again — one is a product to install, the other is an npm package whose bin has to reach
 * PATH. Neither is derivable from the four letters the folder is named after.
 *
 * The Codex row names the package this repository pins as a devDependency rather than a download
 * page, because the package is a fact this tree can be held against
 * (`packages/cli/package.json` -> `@openai/codex`) and a URL is one it cannot.
 */
const HOST_CLI: Record<Provider, { name: string; install: string }> = {
  claude: { name: "Claude CLI", install: "Install Claude Code first: https://claude.ai/code" },
  codex: {
    name: "Codex CLI",
    install: "Install the '@openai/codex' package first, so that 'codex' is on PATH",
  },
};

/**
 * What a command says when the host binary its work goes through is not on the machine.
 *
 * It was a constant naming Claude until C4, with one caller — true while Claude was the only host,
 * and a wrong answer the moment a Codex installation could resolve one: a machine with no `codex`
 * was told to install Claude Code, which is neither the binary that is missing nor a step that
 * would help. The provider comes from the host the caller is already holding, so the line cannot
 * disagree with the installation it is about.
 */
export function hostCliNotFound(provider: Provider): string {
  const cli = HOST_CLI[provider];
  return `${cli.name} not found — '${CLI_INVOKE_COMMAND} update' refreshes marketplaces through it. ${cli.install}`;
}

/**
 * `init`'s closing line, under the name the run prints itself as.
 *
 * A builder rather than a constant because it carries `branding.name`, which is per-installation
 * and cannot be baked in at module load. `init` is its one caller and resolves the name once on
 * its own spine, through `BaseCommand.resolveBrandingName`, which is where the default comes
 * from.
 */
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

/**
 * What `uninstall` reports when the directory holds nothing of this CLI's, under the name the run
 * prints itself as.
 *
 * A builder for the same reason as {@link initSucceeded}, and it matters more here: `uninstall`
 * heads its output with the configured name and signs off with it, so a constant would put the
 * shipped name in the middle of a run that says the configured one twice around it.
 */
export function notInstalledHere(brandingName: string): string {
  return `${brandingName} is not installed in this project.`;
}

/** Closing line of a plugin install, printed wherever one runs. */
export function pluginsInstalled(count: number): string {
  return `Installed ${plural(count, "skill plugin")}`;
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
 * `subject` is the noun each caller counts in, given in the singular and pluralised against
 * `rewritten`, because `compile` reports per scope pass ("global agent") and `edit` reports the
 * whole run's ("agent").
 */
export function recompileSummary(rewritten: number, unchanged: number, subject: string): string {
  return `${plural(rewritten, subject)} rewritten, ${unchanged} unchanged`;
}

/**
 * The sub-agents a recompile pass could not write, named rather than counted.
 *
 * Read off the pass's `failed` roster rather than off the prose it also returns: that roster is
 * the structured answer to "which ones did not land", while `warnings` carries entries that are
 * not failures at all, and a summary built from the prose would file those as work owed.
 */
export function agentsNotCompiled(agentNames: readonly AgentName[]): string {
  return `${agentNames.length} sub-agent(s) did not compile: ${agentNames.join(", ")}`;
}

/**
 * One thing a run set out to do and did not, paired with the one command that finishes it.
 *
 * Both halves are required. A run that names the failure and no way out has told the user their
 * installation is wrong and left them holding it, and one that names a remedy without saying
 * what it remedies is advice about nothing.
 */
export type IncompleteWork = {
  /** What did not happen, in the words it was warned about with where they exist. */
  what: string;
  /** The single next thing that finishes it. */
  recovery: string;
};

/**
 * The ways out a command names when it finishes with work undone.
 *
 * One sentence per KIND of leftover state rather than one per failure site: what a person does
 * about a plugin registration that outlived the skill it was for is the same whichever of the
 * moments left it there, and three spellings of the same instruction read as three different
 * instructions.
 */
export const INCOMPLETE_WORK_RECOVERY = {
  RECOMPILE: `Run '${CLI_INVOKE_COMMAND} compile' — the compiled agents on disk are stale until you do.`,
  INSPECT_INSTALLATION: `Run '${CLI_INVOKE_COMMAND} doctor' to see what this installation is left holding.`,
  DELETE_AGENT_FILE:
    "Delete the file by hand — Claude Code loads a compiled sub-agent this project no longer configures.",
} as const;

/**
 * The account a command ends on when its work landed and part of it did not.
 *
 * It restates warnings the run already printed, deliberately: each was emitted where it
 * happened, which is where it is explicable and where the screens of output after it bury it.
 * This block is what a person reads after the fact, and the only place a non-zero exit from a
 * command that finished is explained.
 *
 * The lead-in claims the changes above LANDED, because that is the whole difference between
 * this ending and a refusal, and it is the sentence a reader would dispute.
 */
export function completedWithFailures(failures: readonly IncompleteWork[]): string {
  return [
    `Completed with ${failures.length} failure(s) — the changes above landed, these did not:`,
    ...failures.flatMap(failureLines),
  ].join("\n");
}

/** One failure as two lines, the remedy indented under the failure it answers. */
function failureLines({ what, recovery }: IncompleteWork): string[] {
  return [`  ${what}`, `    ${recovery}`];
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
  return `Recompiled agents in ${plural(rewritten, "registered project")}, ${unchanged} unchanged${failureSuffix}`;
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
  const [subject, object] = count === 1 ? ["agent is", "it"] : ["agents are", "them"];
  return `${count} ${subject} global-scoped — run '${CLI_INVOKE_COMMAND} compile' from your home directory, or edit from this project, to recompile ${object}.`;
}

/**
 * Summary printed after `update` refreshed every marketplace its config named. A marketplace
 * refresh re-reads the listing and installs nothing, so the installed plugins keep their versions.
 */
export function marketplacesRefreshed(count: number): string {
  return `Refreshed ${plural(count, "marketplace listing")}. Installed plugins were not changed.`;
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

/** A marketplace's manifest as its author has to type the path. */
const MARKETPLACE_MANIFEST = `${PLUGIN_MANIFEST_DIR}/${MARKETPLACE_JSON}`;

/**
 * The rule and its remedy, shared by both refusals below: the two builds that write the manifest,
 * in the order an author runs them — `build plugins` writes the bundles `build marketplace` lists.
 */
const MARKETPLACE_MANIFEST_REQUIRED = [
  `Every marketplace other than the default one must publish a valid ${MARKETPLACE_MANIFEST}.`,
  `Run '${CLI_INVOKE_COMMAND} build plugins' and then '${CLI_INVOKE_COMMAND} build marketplace' in that marketplace's repository, which write it.`,
].join(" ");

/** The refusal of a marketplace other than the default one that publishes no manifest at all. */
export function marketplaceManifestMissing(source: string): string {
  return [
    `'${source}' has no ${MARKETPLACE_MANIFEST}, so it is not a marketplace yet.`,
    MARKETPLACE_MANIFEST_REQUIRED,
  ].join("\n\n");
}

/**
 * The refusal of a marketplace other than the default one whose manifest is there and cannot be
 * read — it does not parse, or the schema refuses it. `reason` is the reader's own, so a schema
 * refusal names the field the author has to fix as well as the builds that rewrite the file.
 */
export function marketplaceManifestUnreadable(source: string, reason: string): string {
  return [
    `'${source}' has a ${MARKETPLACE_MANIFEST} this CLI cannot read:\n${reason}`,
    MARKETPLACE_MANIFEST_REQUIRED,
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
 * Warning printed when a global uninstall could not prune one registered project whose config is
 * still there — unreadable, or its rewrite failed. The uninstall continues.
 */
export function registeredProjectUpdateSkipped(projectPath: string): string {
  return `Could not update registered project at ${projectPath} — its config may still reference the uninstalled global content`;
}

/** Warning printed when a global change could not reach a registered project whose config.ts cannot be loaded. */
export function registeredProjectConfigUnreadable(projectPath: string): string {
  return `Skipped ${projectPath}: its config.ts can't be read.`;
}

/** Warning printed when a global change found nothing installed at a registered project's path. */
export function registeredProjectGone(projectPath: string): string {
  return `Skipped ${projectPath}: nothing is installed there any more.`;
}

/** Warning printed when a global change left a registered project on the other provider alone. */
export function registeredProjectOnAnotherProvider(projectPath: string): string {
  return `Skipped ${projectPath}: it is another provider's installation.`;
}

/** Warning printed when a global compile's rewrite of a registered project failed. */
export function registeredProjectUpdateFailed(projectPath: string): string {
  return `Skipped ${projectPath}: updating it failed.`;
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
 * fields a skill is described by. It is the sibling of {@link installationConfigsUnreadable} one
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
 * `init --from` installs into a clean directory. A shared configuration is installed whole — its
 * own `assignments` map REPLACES the ownership-derived stack rather than merging with it — so there
 * is no coherent answer to what it should do when it meets a setup that is already there. The
 * refusal below names `edit --from`, which applies the id to that setup, and `uninstall`, which
 * clears the way for this one.
 *
 * A global installation above the directory is not such a setup. It is not this directory's, so
 * the run adds to it what it lacks and leaves the rest as installed — see
 * {@link keptAsInstalledGlobally}.
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

/**
 * What `init --ui` and `edit --ui --from` print under the link: the command that applies an id
 * HERE. `init --from` installs into a directory holding no installation of its own and refuses one
 * that does, where `edit --from` is what applies an id — so the line follows the directory, never
 * the command that opened the link. With no id yet (a bare `init --ui`), it names the command for
 * the id the editor will give.
 */
export function applySharedConfigHere(id: string | undefined, installedHere: boolean): string {
  const command = `${CLI_INVOKE_COMMAND} ${installedHere ? "edit" : "init"} --from`;
  const verb = installedHere ? "apply" : "install";
  return id === undefined
    ? `Then ${verb} what it gives you with '${command} <id>'.`
    : `To ${verb} it here instead, run '${command} ${id}'.`;
}

/**
 * `share`'s refusal while anything it would send is an ejected (Local) copy, an editor-added skill
 * included. A share carries plugins only; `edit --ui` still opens the same installation.
 */
export function shareRefusesEjectedSkills(skillIds: readonly string[]): string {
  return [
    "This installation holds ejected skills, and ejected skills cannot be shared:",
    ...skillIds.map((id) => `  ${id}`),
    "Only plugins can be shared.",
  ].join("\n");
}

/** What `share` says after the id when the marketplace it names is a folder on this machine. */
export function sharedIdNamesAFolder(folder: string): string {
  return `This id names the marketplace folder ${folder}, so it installs only where that folder exists.`;
}

/**
 * What `share` says after the id when what it sent comes from more than one marketplace. A payload
 * names one, so the others' skills are skipped wherever the id is installed.
 */
export function sharedSkillsLeftBehind(skillIds: readonly string[]): string {
  return `A shared id names one marketplace, and these skill(s) come from another, so they will not install elsewhere: ${skillIds.join(", ")}`;
}

/** Refusal printed when the directory `init --from <id>` was run in is already installed. */
export function sharedConfigExistingInstall(configPath: string, id: string): string {
  return `An installation already exists at ${configPath}. Run '${CLI_INVOKE_COMMAND} uninstall' first — ${SHARED_CONFIG_GREENFIELD_HINT}. ${applySharedConfigHere(id, true)}`;
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
 * Applying a shared configuration makes the installation this run edits MATCH it, so a skill the
 * previous configuration installed and this payload omits is removed. That is the whole reason the
 * command is interactive, and the reason the heading names removal rather than the apply. What the
 * apply adds or changes is listed above it, in {@link SHARED_CONFIG_ARRIVALS}' two lists.
 */
export const SHARED_CONFIG_APPLY = {
  PREVIEW_HEADING: "Applying this configuration will remove:",
  SKILLS_HEADING: "Skills:",
  AGENTS_HEADING: "Sub-agents:",
  /** Printed in place of the sections when the payload takes nothing away. */
  NOTHING_REMOVED: "Nothing is removed — this configuration only adds and re-tunes.",
  CONFIRM: "Apply this configuration?",
} as const;

/**
 * A removal-plan line for the project's half of a `[P][G]` pair the configuration leaves out. Only
 * this project's copy goes: the global install keeps its own, which the project then reads.
 */
export function projectCopyRemoved(subject: string): string {
  return `${subject}: this project's copy is removed; the global one takes over`;
}

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
 * Refusal printed when `edit --from` is run where nothing is installed, terminal or not: there is
 * no installation for the configuration to be applied to. It names `init --from` with the id
 * rather than bare `init`, because the configuration is already in hand and that is the command
 * that installs it here.
 */
export function nothingInstalledToApplyTo(id: string): string {
  return `No installation found. Run '${CLI_INVOKE_COMMAND} init --from ${id}' to install configuration '${id}' here.`;
}

/** The run each wizard-opening command can be swapped for where there is no terminal. */
const RUNS_WITHOUT_A_TERMINAL = {
  init: `'${CLI_INVOKE_COMMAND} init --from <id>' installs a configuration built in the editor without one`,
  edit: `'${CLI_INVOKE_COMMAND} edit --ui' opens this installation in the editor without one`,
} as const;

/**
 * Refusal printed when `init` or `edit` would open the wizard where there is no terminal to open
 * it in — a CI job, a script, a pipe.
 *
 * Mounting it anyway died on Ink's raw-mode error over a React stack trace. A command that cannot
 * run without a terminal "should break because it's not a valid command" (owner ruling
 * 2026-10-02), so it breaks on purpose and in words, worded after {@link sharedConfigNeedsTerminal}
 * because it is the same refusal one command over.
 */
export function wizardNeedsTerminal(command: keyof typeof RUNS_WITHOUT_A_TERMINAL): string {
  return [
    `'${CLI_INVOKE_COMMAND} ${command}' opens a wizard, and there is no terminal here to open it in.`,
    `Run it from a terminal — ${RUNS_WITHOUT_A_TERMINAL[command]}.`,
  ].join("\n");
}

/**
 * Refusal printed when `uninstall` has no terminal to confirm its removals at. A confirm nobody
 * can answer must never become a yes, so `--yes` — the person saying it in advance — is named.
 */
export function uninstallNeedsTerminal(): string {
  return [
    "Uninstalling removes files, so it has to be confirmed — and there is no terminal here to confirm it at.",
    `Run '${CLI_INVOKE_COMMAND} uninstall' from a terminal, or '${CLI_INVOKE_COMMAND} uninstall --yes' to remove it without being asked.`,
  ].join("\n");
}

/**
 * Refusal printed for `init --ui --marketplace`. The editor's address carries a configuration id
 * and nothing else, so a marketplace named here would be dropped on the way — and a flag silently
 * dropped reads as honoured. The one command it names is the same run without the flag, because
 * that runs in every folder: `init --marketplace` refuses in one whose installation came from
 * another marketplace.
 */
export function editorLoadsItsOwnMarketplace(named: string): string {
  return `--marketplace '${named}' cannot be handed to the editor: the editor loads marketplaces itself. Run '${CLI_INVOKE_COMMAND} init --ui' and load it there.`;
}

/**
 * Refusal printed when `init --marketplace` names a marketplace other than the one this folder's
 * own installation was made from. An installation's marketplace is chosen once, when it is made,
 * and every command after `init` reads the one it stored.
 */
export function marketplaceFixedAtInstall(stored: string, named: string): string {
  return `This folder's installation was made from the marketplace '${stored}', and an installation's marketplace is chosen once, when it is made — so --marketplace '${named}' was not used. Run '${CLI_INVOKE_COMMAND} init' without it to open this installation, or '${CLI_INVOKE_COMMAND} uninstall' first to set this folder up from another.`;
}

/**
 * The two lists every `--from` install prints before it writes anything — what goes into this
 * project and what into the global install — and the question `init --from` asks under them at a
 * terminal.
 *
 * Half a shared configuration may land in the global install, which every project on the machine
 * reads, so what lands where is said before anything does. `init --from` prints the lists with no
 * terminal too, where it carries on without asking; `edit --from` prints them above the confirm it
 * already asks, listing only what it adds or changes. At the home directory the run IS the global
 * install, so only the second list can have anything in it.
 *
 * In a project, `init --from` lists a third thing under those two: the global skills it skips
 * because the global install above the project already holds them, each left as installed.
 */
export const SHARED_CONFIG_ARRIVALS = {
  PROJECT_HEADING: "Into this project:",
  GLOBAL_HEADING: "Into the global install:",
  SKIPPED_HEADING: "Skipped, already in the global install:",
  INSTALL_CONFIRM: "Install this configuration?",
} as const;

/**
 * The statement for global entries a project run leaves exactly as the global install holds them,
 * though the configuration states them otherwise.
 *
 * From a project, `--from` only ADDS to the global install: it is one installation every project on
 * the machine reads, and a run started in one of them is not a decision about the rest. So a global
 * skill or sub-agent the configuration installs differently, loads differently or tunes
 * differently stays as installed — and is named here, because a difference nobody is told about is
 * a configuration that silently did not arrive. So is a global skill or sub-agent `edit --from`
 * keeps though the configuration leaves it out, and a carried skill whose global copy reads
 * otherwise than the configuration's.
 */
export function keptAsInstalledGlobally(
  skillIds: readonly SkillId[],
  agentNames: readonly AgentName[],
): string {
  return [
    "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
    ...skillIds.map((id) => `  skill ${id}`),
    ...agentNames.map((name) => `  sub-agent ${name}`),
    `Change them with '${CLI_INVOKE_COMMAND} edit' from your home directory.`,
  ].join("\n");
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
 * A kept skill's row in a category that holds one skill, which the configuration's own skill
 * takes: the skill stays installed, and that sub-agent no longer loads it there.
 */
export function keptUnassigned(skillId: SkillId, agentName: AgentName, category: Category): string {
  return `${skillId}: kept, no longer assigned to ${agentName}'s ${category}`;
}

/**
 * What every refusal over an unreadable config offers besides recreating it: the editor builds a
 * configuration the CLI installs by id, and `doctor` reports the same files as its own findings.
 *
 * `doctor` could not be named until it did — it used to call a config that exists but cannot be
 * read "not found" and send the reader to `init`, contradicting both lines.
 */
function otherWaysPastUnreadableConfigs(count: number): string[] {
  return [
    `Or build one at ${EDITOR_URL} and install it with '${CLI_INVOKE_COMMAND} init --from <id>'.`,
    `'${CLI_INVOKE_COMMAND} doctor' reports the same ${count === 1 ? "file" : "files"}, alongside whatever else is wrong here.`,
  ];
}

/** One config that could not be loaded, as the refusal names it. */
type UnreadableConfig = Pick<ConfigLoadError, "configPath" | "reason" | "scope" | "scopeRoot">;

/**
 * Refusal printed when a command that must read an installation's configuration meets configs it
 * cannot load. There are no versioned migrations, so an unreadable configuration is recreated
 * rather than repaired — and `uninstall` deliberately keeps working on one, which is what makes
 * the first instruction a real way out rather than a suggestion to delete directories by hand.
 *
 * It says WHOSE config each is and where its way out is taken from. A project reads two configs,
 * its own and the global one it inherits, so a refusal printed in a project can be about either
 * or both — and one naming no folder sent a user with a healthy project config and a broken global
 * one to uninstall the project, deleting the one config that was fine. Naming only the first of
 * two broken ones sends them round twice.
 */
export function installationConfigsUnreadable(failures: readonly UnreadableConfig[]): string {
  return [
    ...failures.flatMap(whoseConfigAndItsWayOut),
    ...otherWaysPastUnreadableConfigs(failures.length),
  ].join("\n");
}

/** One unreadable config: whose it is, why, and the folder its way out is run from. */
function whoseConfigAndItsWayOut(failure: UnreadableConfig): string[] {
  return [
    `${scopeLabel(failure.scope)}'s config at '${failure.configPath}' could not be loaded: ${failure.reason}`,
    `There is no automatic repair for this — recreate the configuration by running ${recreateConfigFrom(failure.scopeRoot)}.`,
  ];
}

/**
 * `uninstall`'s warning over a config it cannot read, which it goes past rather than stops on: the
 * plugins and compiled agents the config lists can no longer be identified. It names whose config
 * it read — at the home directory that is the global installation's, never a project's.
 */
export function uninstallConfigUnreadable(
  failure: Pick<ConfigLoadError, "scope" | "message">,
): string {
  return `Could not read the ${failure.scope} config — plugins and compiled agents it lists may be left behind: ${failure.message}`;
}

/**
 * The way out of a config nobody can read, run from the folder that holds it: the project, or the
 * home directory for the global config. Shared with `doctor`'s tip, so the report and the refusal
 * send a user to the same place.
 */
export function recreateConfigFrom(scopeRoot: string): string {
  return `'${CLI_INVOKE_COMMAND} uninstall', which still works on a config it cannot read, then '${CLI_INVOKE_COMMAND} init', from '${scopeRoot}'`;
}

/**
 * The same refusal for a config file that belongs to no installation — a marketplace repository's
 * own `config.ts`, which `loadSourceRepoConfig` reads — so there is no scope to name and no folder
 * to send anyone to. `configLoadFailure` is the loader's own message, which already names the file
 * and the reason.
 */
export function configUnreadableError(configLoadFailure: string): string {
  return [
    configLoadFailure,
    `There is no automatic repair for this — recreate the configuration: '${CLI_INVOKE_COMMAND} uninstall' still works on a config it cannot read, then '${CLI_INVOKE_COMMAND} init'.`,
    ...otherWaysPastUnreadableConfigs(1),
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

/** How a sentence names the directory a source folder sits under, mid-sentence. */
export function scopeNoun(kind: ScopeKind): string {
  return kind === "project" ? "this project" : "the global installation";
}

/** The same noun where it starts a sentence — doctor's rows. */
export function scopeLabel(kind: ScopeKind): string {
  return sentenceCase(scopeNoun(kind));
}

function sentenceCase(text: string): string {
  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
}

/** doctor's Layout row: which folder a scope's installation is read from and written to. */
export function layoutIsCurrent(label: string, to: string): string {
  return `${label} is on ${to}/`;
}

/**
 * The one line a run prints at startup while the project or HOME holds the retired folder.
 *
 * Nothing reads or writes that folder any more (owner ruling, 2026-10-04), so an installation
 * still in it is invisible to every command — this line is the only thing that says why. Bare,
 * and printed once per run however many scopes hold the folder: it is a notice, not a fault, and
 * the command it precedes runs as it would without it.
 */
export function retiredSourceFolderUnsupported(replacement: string): string {
  return `${RETIRED_SOURCE_FOLDER}/ is no longer supported (agents-inc now serves Claude and Codex). Move it to ${replacement}/.`;
}
