import os from "os";
import path from "path";

import chalk from "chalk";
import { Flags } from "@oclif/core";
import { render } from "../components/render.js";

import { difference, indexBy, partition } from "remeda";

import { BaseCommand } from "../base-command.js";
import { type WizardResultV2 } from "../components/wizard/wizard.js";
import { runWizardSession } from "../components/wizard/run-wizard-session.js";
import {
  CLI_INVOKE_COMMAND,
  CLI_COLORS,
  EDIT_PROJECT_SETUP_FLAG,
  EJECT_SOURCE,
  editorConfigUrl,
  formatSourceDisplayName,
} from "../consts.js";
import {
  detectProject,
  loadSource,
  copyLocalSkills,
  uninstallPluginSkills,
  loadAgentDefs,
  type AgentDefs,
  writeProjectConfig,
  type ConfigWriteResult,
  compileAgentsAllScopes,
  discoverInstalledSkills,
  removeCompiledAgents,
  type RemoveCompiledAgentsOptions,
} from "../lib/operations/index.js";
import { Spinner } from "../components/common/spinner.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import {
  type Installation,
  detectMigrations,
  executeMigration,
  isHomeDirectory,
  installBaseDir,
  resolveInstallPaths,
  INSTALL_MODE_DESCRIPTIONS,
} from "../lib/installation/index.js";
import {
  applyMigratedGlobalSources,
  mutateGlobal,
  normalizeProjectPath,
} from "../lib/config-gate/index.js";
import { matrix, getSkillById, getSkillDisplayName } from "../lib/matrix/matrix-provider";
import { type AuthoritativeScope, loadProjectConfigFromDir } from "../lib/configuration/index.js";
import {
  activeAgentNames,
  activeAgentScopeMap,
  isActiveAt,
} from "../lib/configuration/scope-predicates.js";
import type { SourceLoadResult } from "../lib/loading/index.js";
import {
  discoverAllPluginSkills,
  buildMarketplacePluginRef,
  toClaudePluginScope,
} from "../lib/plugins/index.js";
import {
  deleteLocalSkill,
  migrateLocalSkillScope,
  unresolvedSkillRemovalReasons,
} from "../lib/skills/index.js";
import type {
  SkillId,
  SkillConfig,
  AgentName,
  AgentScopeConfig,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillScope,
} from "../types/index.js";
import {
  seedPayloadForInstallation,
  skillsAuthoredHere,
} from "../lib/seed/installation-payload.js";
import { publishSeedConfig } from "../lib/seed/publish-seed.js";
import { fetchSeedConfig } from "../lib/seed/fetch-seed.js";
import {
  registerExternalSkills,
  writeExternalSkills,
  type ExternalSkillInstall,
} from "../lib/seed/external-skills.js";
import { seedToWizardResult, type SeedMapping } from "../lib/seed/seed-to-wizard.js";
import { reconcileSharedConfig, type KeptFromRoundTrip } from "../lib/seed/seed-apply.js";
import {
  RemovalPlanConfirm,
  type RemovalPlanSection,
} from "../components/common/removal-plan-confirm.js";
import { promptConfirm } from "../components/common/prompt-confirm.js";
import { claudePluginInstall, claudePluginUninstall } from "../utils/exec.js";
import { openUrl } from "../utils/open-url.js";
import { getErrorMessage } from "../utils/errors.js";
import { type StartupMessage } from "../utils/logger.js";
import {
  ERROR_MESSAGES,
  INFO_MESSAGES,
  SHARED_CONFIG_APPLY,
  SHARED_CONFIG_ONE_DIRECTION,
  STATUS_MESSAGES,
  authoredHereKept,
  carriedSkillsWritten,
  globallyInstalledRemoved,
  localSkillsCopied,
  recompileSummary,
  sharedConfigDestinations,
  sharedConfigNeedsTerminal,
  skippedUnknownAgents,
  skippedUnknownSkills,
  unplaceableKept,
} from "../utils/messages.js";
import { formatScopeTag } from "../lib/wizard/index.js";
import { typedKeys } from "../utils/typed-object.js";
import type { SeedPayload } from "@workspace/matrix/seed";

/** A scope transition (`from` → `to`) for a re-scoped skill or agent. */
type ScopeChange = { from: SkillScope; to: SkillScope };

/**
 * The noun `edit`'s recompile summary counts in. `edit` recompiles every scope this
 * context owns in one pass, so it has no scope word to qualify with — `compile`,
 * which runs one scope at a time, does.
 */
const RECOMPILE_SUBJECT = "agents";

/**
 * Dual-scope add/remove: the project half of a [P][G] pair was toggled while the
 * global half persists. Reported as a project-scope addition/removal; a
 * scope-change arrow line would falsely claim the global install moved.
 */
function formatDualScopeTransition(displayName: string, to: SkillScope): string {
  const isAdd = to === "project";
  const prefix = isAdd ? "+" : "-";
  const color = isAdd ? CLI_COLORS.SUCCESS : CLI_COLORS.ERROR;
  return chalk.hex(color)(`  ${prefix} ${displayName} [P]`);
}

/**
 * One re-scoped skill's line. A dual-scope toggle is the transition above rather than a
 * migration; a genuine `[G] → [P]` reads as an addition because the skill arrives in this
 * project, and every other direction is the amber `~` a move is written with.
 */
function formatSkillScopeChangeLine(
  skillId: SkillId,
  change: ScopeChange,
  dualScopeSkillTransitions: ReadonlySet<SkillId>,
): string {
  const displayName = getSkillDisplayName(skillId);
  if (dualScopeSkillTransitions.has(skillId)) {
    return formatDualScopeTransition(displayName, change.to);
  }

  const isGlobalToProject = change.from === "global" && change.to === "project";
  const prefix = isGlobalToProject ? "+" : "~";
  const color = isGlobalToProject ? CLI_COLORS.SUCCESS : CLI_COLORS.WARNING;
  return (
    chalk.hex(color)(`  ${prefix} ${displayName}`) +
    chalk.hex(CLI_COLORS.NEUTRAL)(scopeArrow(change))
  );
}

/**
 * The agent mirror of the line above, with two differences preserved from how this summary has
 * always read: there is no `[G] → [P]`-reads-as-addition arm — an agent that moves is a move —
 * and only the dual-scope arm carries the `(agent)` suffix, since a `~` line names no skill it
 * could be confused with.
 */
function formatAgentScopeChangeLine(
  agentName: AgentName,
  change: ScopeChange,
  dualScopeAgentTransitions: ReadonlySet<AgentName>,
): string {
  const agentSuffix = chalk.hex(CLI_COLORS.NEUTRAL)(" (agent)");
  if (dualScopeAgentTransitions.has(agentName)) {
    return formatDualScopeTransition(agentName, change.to) + agentSuffix;
  }

  return (
    chalk.hex(CLI_COLORS.WARNING)(`  ~ ${agentName}`) +
    chalk.hex(CLI_COLORS.NEUTRAL)(scopeArrow(change))
  );
}

/** The ` ([P] → [G])` half both lines above end with, in the tags the wizard writes scopes as. */
function scopeArrow(change: ScopeChange): string {
  return ` (${formatScopeTag(change.from)} \u2192 ${formatScopeTag(change.to)})`;
}

/**
 * The name this session's catalogue answers to — what a marketplace-dropped entry's removal
 * reason says the skill is not present in. The resolved marketplace where there is one,
 * otherwise the source string itself, which is what an installation pointed at a source that
 * never carried the skill has to be named by.
 */
function loadedSourceLabel(sourceResult: SourceLoadResult): string {
  return sourceResult.marketplace ?? sourceResult.sourceConfig.source;
}

/** @internal Re-exported for testing — the transform itself lives inside the gate. */
export { applyMigratedGlobalSources };

type EditContext = {
  installation: Installation;
  projectConfig: ProjectConfig | null;
  projectDir: string;
  sourceResult: SourceLoadResult;
  startupMessages: StartupMessage[];
  currentSkillIds: SkillId[];
};

/**
 * What this run is about to apply, and which producer said so.
 *
 * The two produce the same `WizardResultV2` and are applied by the same sequence — that is what
 * stops `edit` growing a second copy of its own pipeline. They differ in what has to happen
 * between the diff and the first mutation: a wizard result was authored keystroke by keystroke
 * and needs no permission, while a shared configuration arrived whole and destroys whatever it
 * left out, so its removals are shown and confirmed there.
 */
type EditSelection =
  | { producer: "wizard"; result: WizardResultV2 }
  | {
      producer: "shared";
      result: WizardResultV2;
      /** Statements naming what this run may not remove — rendered in the confirm. */
      kept: string[];
      /** Skills the configuration carries rather than names, written once it is approved. */
      carried: ExternalSkillInstall[];
    };

/** What a shared apply is confirmed against: one heading, the lists, and the prose under them. */
type SharedConfigPlan = {
  heading: string;
  sections: RemovalPlanSection[];
  statements: string[];
};

/** A removal set's two lists, whichever scope the entries in it were installed at. */
type RemovedEntries = { skills: SkillId[]; agents: AgentName[] };

/** The removal set split by the scope each entry was actually installed at. */
type RemovalsByScope = { here: RemovedEntries; global: RemovedEntries };

/** The entries this run is applying over, which is where a removal's scope is read from. */
type InstalledEntries = Pick<ProjectConfig, "skills" | "agents">;

/**
 * The plan INSIDE the global installation: the ordinary one, and deliberately nothing more.
 *
 * The person ran this at their home directory. The location IS the global scope, they chose it,
 * and that global is inherited by every project is what global means — so a second
 * acknowledgement restates a fact the directory already states, and a gate that fires everywhere
 * is one nobody is still reading by the time it matters.
 */
function globalScopePlan(changes: ConfigChanges, kept: string[]): SharedConfigPlan {
  const sections = removalSections(changes.removedSkills, changes.removedAgents);
  return { heading: planHeading(sections), sections, statements: kept };
}

/**
 * The plan INSIDE a project, where a removal can reach past the directory it was asked for in.
 *
 * A global install is one installation every registered project reads, so removing one here
 * changes projects the person confirming is not looking at. Those entries get their own section
 * and a statement counting and naming the projects the yes changes; everything else reads as it
 * always has. The split is on the entries' own scope rather than on wording, so the two confirms
 * stay two branches — one gate firing everywhere and explaining itself differently is how a gate
 * drifts into firing wrongly.
 */
function projectScopePlan(
  changes: ConfigChanges,
  kept: string[],
  installed: InstalledEntries,
  otherProjects: string[],
): SharedConfigPlan {
  const { here, global } = splitRemovalsByScope(changes, installed);
  const sections = [
    ...removalSections(here.skills, here.agents),
    ...globalRemovalSections(global.skills, global.agents),
  ];

  return {
    heading: planHeading(sections),
    sections,
    statements: [...globalReachStatement(global, otherProjects), ...kept],
  };
}

/** Which removals leave this project only, and which leave the machine. */
function splitRemovalsByScope(
  changes: ConfigChanges,
  installed: InstalledEntries,
): RemovalsByScope {
  const isGlobalSkill = (id: SkillId): boolean =>
    installed.skills.some((skill) => skill.id === id && isActiveAt(skill, "global"));
  const isGlobalAgent = (name: AgentName): boolean =>
    installed.agents.some((agent) => agent.name === name && isActiveAt(agent, "global"));

  const [globalSkills, projectSkills] = partition(changes.removedSkills, isGlobalSkill);
  const [globalAgents, projectAgents] = partition(changes.removedAgents, isGlobalAgent);

  return {
    here: { skills: projectSkills, agents: projectAgents },
    global: { skills: globalSkills, agents: globalAgents },
  };
}

/** The removals a shared configuration makes here, grouped as the plan prints them. */
function removalSections(skills: SkillId[], agents: AgentName[]): RemovalPlanSection[] {
  return [
    { label: SHARED_CONFIG_APPLY.SKILLS_HEADING, items: skills.map(skillLabel) },
    { label: SHARED_CONFIG_APPLY.AGENTS_HEADING, items: [...agents] },
  ].filter((section) => section.items.length > 0);
}

/** The same lists for entries that live at global scope, under headings that say so. */
function globalRemovalSections(skills: SkillId[], agents: AgentName[]): RemovalPlanSection[] {
  return [
    { label: SHARED_CONFIG_APPLY.GLOBAL_SKILLS_HEADING, items: skills.map(skillLabel) },
    { label: SHARED_CONFIG_APPLY.GLOBAL_AGENTS_HEADING, items: [...agents] },
  ].filter((section) => section.items.length > 0);
}

/** Who else a global removal lands on — printed only when there is one to land. */
function globalReachStatement(global: RemovedEntries, otherProjects: string[]): string[] {
  if (global.skills.length === 0 && global.agents.length === 0) return [];
  return [globallyInstalledRemoved(otherProjects)];
}

/**
 * The plan's opening line. A heading is a promise about the lines beneath it, so one promising
 * removals over an empty list would be a lie — a configuration that only adds says so instead,
 * and is still confirmed, because it is still applied whole.
 */
function planHeading(sections: RemovalPlanSection[]): string {
  if (sections.length === 0) return SHARED_CONFIG_APPLY.NOTHING_REMOVED;
  return SHARED_CONFIG_APPLY.PREVIEW_HEADING;
}

/** How a removal reads in the plan: the name the user picked it by, with the id behind it. */
function skillLabel(skillId: SkillId): string {
  const displayName = getSkillDisplayName(skillId);
  return displayName === skillId ? skillId : `${displayName} (${skillId})`;
}

/**
 * The plan's kept half, one statement per reason.
 *
 * Both reasons are disclosed rather than acted on, which is the point: no configuration ever
 * carried a skill written here, and an id this catalogue cannot place is one this run had an
 * instruction about and could not honour — so an apply that silently left them behind would
 * recreate exactly the defect the destructive ruling exists to kill, nobody able to tell why an
 * agent still carries a skill they never picked.
 */
function keptStatements(kept: KeptFromRoundTrip): string[] {
  return [...authorshipStatement(kept), ...catalogueStatement(kept)];
}

/** The ownership half, whose remedy is the wizard rather than another configuration. */
function authorshipStatement(kept: KeptFromRoundTrip): string[] {
  if (kept.authoredSkillIds.length === 0) return [];
  return [authoredHereKept(kept.authoredSkillIds)];
}

/** The catalogue's own limit, whose remedy is the catalogue rather than anything installed. */
function catalogueStatement(kept: KeptFromRoundTrip): string[] {
  if (kept.unplaceableSkillIds.length === 0) return [];
  return [unplaceableKept(kept.unplaceableSkillIds)];
}

/**
 * How much of what it can see a run owns — the word the merger takes, and the same word the
 * global config the project write commits is resolved under.
 *
 * At the home root, everything: the session loaded the whole global config, so an absent entry
 * was deselected. In a project the WIZARD owns only what the project owns, because the store
 * refuses to deselect a live global entry at all — an inherited row absent from its result is
 * one it never offered, not one anybody dropped. A CONFIRMED shared configuration is the other
 * case and the reason this is not simply `isHomeDirectory`: it states a whole roster, the plan
 * above named every global removal and every project that reaches, and somebody answered yes.
 */
function applyAuthority(producer: EditSelection["producer"], cwd: string): AuthoritativeScope {
  if (isHomeDirectory(cwd)) return "all";
  return producer === "shared" ? "all" : "owned";
}

export default class Edit extends BaseCommand {
  static summary = "Edit skills in the plugin";
  static description = "Modify the currently installed skills via interactive wizard";

  static examples = [
    {
      description: "Open the edit wizard",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Open this installation in the editor instead of the wizard",
      command: "<%= config.bin %> <%= command.id %> --ui",
    },
    {
      description: "Apply a configuration built in the editor, by its id",
      command: "<%= config.bin %> <%= command.id %> --from <id>",
    },
  ];

  static flags = {
    ui: Flags.boolean({
      description: "Edit this installation in the browser at agentsinc.sh instead of the wizard",
      default: false,
    }),
    from: Flags.string({
      description:
        "Apply a configuration shared from agentsinc.sh by its id, removing whatever it leaves out",
      helpValue: "<id>",
    }),
    [EDIT_PROJECT_SETUP_FLAG]: Flags.boolean({
      description: "Internal: this run continues an `init` project setup",
      default: false,
      hidden: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Edit);
    const cwd = process.cwd();

    // Before anything renders: a config that cannot be read is recreated, not edited, and
    // refusing here is what keeps the refusal clean — past this point the wizard has already
    // copied skills and installed plugins by the time a config read fails.
    await this.ensureConfigReadable(cwd);

    if (flags.ui && flags.from !== undefined) {
      this.error(SHARED_CONFIG_ONE_DIRECTION, { exit: EXIT_CODES.ERROR });
    }

    // The browser is the other editor, so it replaces the wizard rather than preceding it —
    // above the source load, which exists to fill screens this run will never paint.
    if (flags.ui) return this.openInEditor(cwd);

    // The inbound half is destructive, so it is confirmed — and a confirm nobody can answer must
    // never become a yes. Refusing here, above the fetch and above the catalogue load, is what
    // keeps a run that cannot finish from spending either.
    const payload =
      flags.from === undefined ? null : await this.fetchSharedConfigOrFail(flags.from);

    const context = await this.loadContextUnderSpinner();

    // Still before anything renders, one layer below the config itself: an entry whose skill
    // IS installed and whose metadata.yaml describes it no longer would otherwise be dropped
    // from config.ts on the way out, over a file this refusal asks to be repaired instead.
    await this.ensureSavedSkillsReadable(
      context.projectConfig?.skills ?? [],
      context.sourceResult.matrix,
      context.projectDir,
    );

    const selection = payload
      ? await this.selectionFromSharedConfig(payload, context, cwd)
      : await this.selectionFromWizard(context, cwd);
    if (!selection) this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });

    const { result } = selection;
    this.reportValidationErrors(result.validation);

    // Filter excluded entries ONCE — downstream methods receive only active entries
    const activeNewSkills = result.skills.filter((s) => !s.excluded);
    const activeNewAgents = result.agentConfigs.filter((a) => !a.excluded);
    const activeOldSkills = (context.projectConfig?.skills ?? []).filter((s) => !s.excluded);
    const activeOldAgents = (context.projectConfig?.agents ?? []).filter((a) => !a.excluded);

    const filteredResult: WizardResultV2 = {
      ...result,
      skills: activeNewSkills,
      agentConfigs: activeNewAgents,
    };
    const filteredOldConfig: ProjectConfig | null = context.projectConfig
      ? { ...context.projectConfig, skills: activeOldSkills, agents: activeOldAgents }
      : null;

    const changes = detectConfigChanges(filteredOldConfig, filteredResult, {
      newSkills: result.skills,
      oldSkills: context.projectConfig?.skills ?? [],
      newAgents: result.agentConfigs,
      oldAgents: context.projectConfig?.agents ?? [],
    });
    // `cc init` inside a project means "set this project up", so the project must be
    // materialised — `<project>/.claude-src/config.ts` + `config-types.ts` written and the
    // path registered in the global `projects[]` — even when the wizard produced no roster
    // change. At the home root there is no project to set up: the global install is what the
    // dashboard was shown for, so a no-change pass there stays an inspection, as does every
    // bare `cc edit`.
    const isProjectSetup = flags[EDIT_PROJECT_SETUP_FLAG] && !isHomeDirectory(cwd);

    // The gate, at the one point where the removals are known and none has been made: after the
    // diff, above every mutation, and above the no-change return — a configuration that carries
    // its own skills still has bytes to land when the roster is unchanged.
    if (selection.producer === "shared") {
      await this.confirmSharedConfigOrCancel(
        changes,
        selection.kept,
        { skills: activeOldSkills, agents: activeOldAgents },
        cwd,
      );
      await this.writeCarriedSkills(selection.carried);
    }

    // One word for both halves of the write, decided once from what was actually confirmed: the
    // merger reads it for the config ROW, and the gate reads it for the global config a project
    // write commits. Deriving it twice is how the row and the disk come to disagree.
    const authority = applyAuthority(selection.producer, cwd);

    if (!hasAnyChanges(changes)) {
      this.log(chalk.hex(CLI_COLORS.NEUTRAL)("No changes made."));
      if (!isProjectSetup) return;
      await this.writeConfigAndCompile(result, context, cwd, authority);
      this.logCompletionSummary(changes);
      return;
    }

    const removalReasons = await unresolvedSkillRemovalReasons(
      result.unresolvableSkillIds,
      activeOldSkills,
      context.projectDir,
      loadedSourceLabel(context.sourceResult),
    );
    this.logChangeSummary(
      changes,
      filteredResult.skills,
      filteredOldConfig?.skills ?? [],
      removalReasons,
    );
    const migratedSkillIds = await this.applyMigrations(
      changes,
      filteredResult,
      activeOldSkills,
      context,
      cwd,
    );
    await this.recordGlobalSourceMigrations(migratedSkillIds, filteredResult.skills, cwd, context);
    await this.applyScopeChanges(changes, filteredResult, context, cwd);
    await this.applySourceChanges(changes, activeOldSkills, cwd, migratedSkillIds);
    await this.applyPluginChanges(changes, filteredResult, activeOldSkills, context, cwd);
    await this.copyNewLocalSkills(changes, filteredResult, context, cwd);
    await this.removeDeletedLocalSkills(changes, activeOldSkills, cwd);
    await this.writeConfigAndCompile(result, context, cwd, authority);
    await this.cleanupStaleAgentFiles(changes, activeOldAgents, cwd);
    this.logCompletionSummary(changes);
  }

  /** The interactive producer: open the wizard on what is installed, return what was chosen. */
  private async selectionFromWizard(
    context: EditContext,
    cwd: string,
  ): Promise<EditSelection | null> {
    const result = await this.runEditWizard(context, cwd);
    if (!result) return null;

    return { producer: "wizard", result };
  }

  /**
   * The `--from <id>` producer: fetch, seat what the configuration carries, decode, and put back
   * what this run has no authority to remove.
   *
   * Everything a shared configuration says is a statement about the whole roster, so the apply
   * that follows is destructive — the project is made to MATCH it. Two exceptions come back into
   * the result: a skill written here, which the producer drops on the way out because
   * `forkedFrom` says the CLI never wrote it, and an id the configuration NAMES that this
   * catalogue cannot place, because a destructive apply removes on intent and never on its own
   * inability. Both are disclosed in the confirm rather than silently excused.
   *
   * A globally installed entry is NOT one of them. It is removable from here, and what its scope
   * changes is who the removal reaches — which the confirm names, rather than this putting the
   * entry back and calling the reach impossible.
   */
  private async selectionFromSharedConfig(
    payload: SeedPayload,
    context: EditContext,
    cwd: string,
  ): Promise<EditSelection> {
    const { matrix: sourceMatrix } = context.sourceResult;
    // Before the decode, because a skill the payload CARRIES answers to no catalogue: unseated,
    // its id is skipped like any other unknown one and its content is never read.
    const carried = this.registerExternalSkillsOrFail(payload, sourceMatrix, cwd);
    const { result, skippedSkillIds, skippedAgentNames } = this.decodeSeedOrFail(
      payload,
      sourceMatrix,
    );

    // The first moment this can be asked, and above everything this run would say or do: an
    // all-global configuration is exactly what a global installation is for, so only the decode
    // says whether THIS one has anywhere to be written here. `init --from` asks it at the same
    // point of the same value, and a run about to be refused must not first narrate its skips.
    this.refuseProjectScopedContentAtHome(result, cwd);

    if (skippedSkillIds.length > 0) this.warn(skippedUnknownSkills(skippedSkillIds));
    if (skippedAgentNames.length > 0) this.warn(skippedUnknownAgents(skippedAgentNames));

    const reconciled = reconcileSharedConfig({
      decoded: result,
      installed: context.projectConfig,
      authoredHere: await this.readAuthoredHere(context.projectConfig, cwd),
      // The ids the decode above could not place. They are the skips just reported, read as
      // what STAYS rather than as what did not arrive: the payload named them, so their absence
      // from the decode is this catalogue's limit and not an instruction to delete anything.
      unplaceable: new Set(skippedSkillIds),
    });

    return {
      producer: "shared",
      result: reconciled.result,
      kept: keptStatements(reconciled.kept),
      carried,
    };
  }

  /**
   * Which installed skills the round trip does not own, asked of the disk exactly as the
   * producing half asks it.
   *
   * Best-effort by nature and never fatal: the question is only ever asked to PROTECT a skill,
   * so a directory that cannot be read protects nothing and must not fail an apply. The
   * consequence of an unanswered question is that the entry is treated as the CLI's own, which
   * is what every other command already assumes about it.
   */
  private async readAuthoredHere(
    projectConfig: ProjectConfig | null,
    cwd: string,
  ): Promise<Set<SkillId>> {
    if (!projectConfig) return new Set();

    try {
      return await skillsAuthoredHere(projectConfig, cwd);
    } catch (error) {
      this.warn(`Could not tell which skills were written here: ${getErrorMessage(error)}`);
      return new Set();
    }
  }

  /**
   * The id, fetched — or the run refused before it is.
   *
   * The terminal question is answered first because nothing in the payload can change its
   * answer: an apply that cannot be confirmed is over before the store is asked, and a refusal
   * that had already spent a round trip would be describing work it never intended to do.
   */
  private async fetchSharedConfigOrFail(id: string): Promise<SeedPayload> {
    if (!process.stdin.isTTY) {
      this.error(sharedConfigNeedsTerminal(id), { exit: EXIT_CODES.ERROR });
    }

    this.log(`Fetching configuration ${id}...`);
    const fetched = await fetchSeedConfig(id);
    if (!fetched.ok) {
      this.error(fetched.error, { exit: EXIT_CODES.ERROR });
    }

    return fetched.payload;
  }

  /**
   * The decode refuses a payload the config model has nowhere to write (see `seedToWizardResult`).
   * That is a failure of this command, reported with this command's exit code rather than left to
   * surface as an unhandled throw.
   */
  private decodeSeedOrFail(payload: SeedPayload, sourceMatrix: MergedSkillsMatrix): SeedMapping {
    try {
      return seedToWizardResult(payload, sourceMatrix);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Seats the catalogue entries the payload carries with it, or refuses the run. The refusal is
   * `registerExternalSkills`' own — a carried skill asked for as a plugin, which no marketplace
   * serves — reported with this command's exit code for the same reason the decode's is.
   */
  private registerExternalSkillsOrFail(
    payload: SeedPayload,
    sourceMatrix: MergedSkillsMatrix,
    projectDir: string,
  ): ExternalSkillInstall[] {
    try {
      return registerExternalSkills(payload, sourceMatrix, projectDir);
    } catch (error) {
      this.handleError(error);
    }
  }

  /** Writes the skills the configuration brought with it, and says which they were. */
  private async writeCarriedSkills(carried: ExternalSkillInstall[]): Promise<void> {
    if (carried.length === 0) return;

    await writeExternalSkills(carried);
    this.log(carriedSkillsWritten(carried.map((skill) => skill.id)));
  }

  /**
   * Shows what applying this configuration takes away, and stops the run unless a person says
   * yes.
   *
   * The plan is built from the SAME `ConfigChanges` the apply below acts on, so what is approved
   * and what is removed are one value read twice. Its kept half is the other side of the same
   * honesty: nothing is refused over an entry this run cannot remove, and nothing is silent
   * about one either.
   *
   * WHICH plan is built is decided here and only here, on the directory the run was started in.
   * Inside the global installation the scope was chosen and is obvious, so the ordinary confirm
   * is the whole of the gate; inside a project a global removal reaches projects nobody here is
   * looking at, so it is shown apart and the reach is named.
   */
  private async confirmSharedConfigOrCancel(
    changes: ConfigChanges,
    kept: string[],
    installed: InstalledEntries,
    cwd: string,
  ): Promise<void> {
    const plan = isHomeDirectory(cwd)
      ? globalScopePlan(changes, kept)
      : projectScopePlan(changes, kept, installed, await this.otherRegisteredProjects(cwd));

    const outcome = await promptConfirm(({ onConfirm, onCancel }) => (
      <RemovalPlanConfirm
        heading={plan.heading}
        sections={plan.sections}
        statements={plan.statements}
        message={SHARED_CONFIG_APPLY.CONFIRM}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ));
    if (outcome === "confirmed") return;

    this.log("\nEdit cancelled");
    this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });
  }

  /**
   * Every registered project but this one — the blast radius a global removal actually has.
   *
   * Read from the GLOBAL config rather than from `context.projectConfig`: `projects[]` is the
   * registry the fan-out itself walks, and a project's own config never carries it, so taking
   * the list from anywhere else would let the confirm name a set the propagation does not.
   *
   * Best-effort by nature. The list exists to be DISCLOSED, so a home directory that cannot be
   * read leaves the disclosure counting nobody rather than failing an apply — and the statement
   * it produces then is the one that says no other project is registered.
   */
  private async otherRegisteredProjects(cwd: string): Promise<string[]> {
    try {
      const global = await loadProjectConfigFromDir(os.homedir());
      const here = normalizeProjectPath(cwd);
      return (global?.config.projects ?? []).filter((projectDir) => projectDir !== here);
    } catch (error) {
      this.warn(`Could not tell which projects share this install: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * The outbound half of the editor round trip: this installation, minted as a configuration
   * the editor opens, and handed to a browser.
   *
   * It is the same mint `share` performs — same reader, same mapping, same refusals, through
   * `seedPayloadForInstallation` — because an id is the whole of what either command produces
   * and two spellings of "the installation in this directory" would mint two different ids for
   * one project. What differs is only the ending: `share` reports the id, this opens it.
   *
   * Nothing on disk is touched. A configuration is read, not rewritten, so a run that changed
   * anything here would be editing the project on the way to offering to edit it.
   */
  private async openInEditor(projectDir: string): Promise<void> {
    const prepared = await seedPayloadForInstallation(projectDir);
    if (!prepared.ok) {
      this.error(prepared.error, { exit: EXIT_CODES.ERROR });
    }

    this.log(`Opening ${prepared.skills} skill(s) across ${prepared.agents} sub-agent(s)...`);

    const published = await publishSeedConfig(prepared.payload);
    if (!published.ok) {
      this.error(published.error, { exit: EXIT_CODES.ERROR });
    }

    await this.handToBrowser(published.id);
  }

  /**
   * The link, printed first and opened second.
   *
   * Printed first because it is the only part of this that works everywhere: over a pipe, in CI
   * and on a machine with no desktop session there is no browser to be anybody's, and a link
   * nobody can copy is the whole loss. Opening one is the convenience on top, so a failure to
   * open is a warning beside a link that still works rather than a failed command.
   *
   * `process.stdin.isTTY` is the same question `init`'s dashboard asks before it offers a
   * prompt — is there a person here — because that is exactly what "whose browser is this"
   * means.
   */
  private async handToBrowser(id: string): Promise<void> {
    this.logSuccess(`Shared as ${id}`);
    for (const destination of sharedConfigDestinations(id)) {
      this.log(destination);
    }

    if (!process.stdin.isTTY) return;

    const opened = await openUrl(editorConfigUrl(id));
    if (!opened.ok) this.warn(opened.error);
  }

  /**
   * The load below, behind a spinner that comes down whichever way the await ends.
   *
   * The cleanup is a `finally` because all three of `loadContext`'s refusals are raised
   * while this spinner is mounted, and oclif would otherwise paint its error under an Ink
   * tree still repainting over it. Never a `catch`: the throw reaches oclif untouched, or
   * both the error rendering and the pinned exit codes change with it.
   */
  private async loadContextUnderSpinner(): Promise<EditContext> {
    const { unmount, clear: clearSpinner } = render(
      <Spinner label={STATUS_MESSAGES.LOADING_SKILLS} />,
    );
    try {
      return await this.loadContext();
    } finally {
      clearSpinner();
      unmount();
    }
  }

  private async loadContext(): Promise<EditContext> {
    const detected = await detectProject();
    if (!detected) {
      this.error(ERROR_MESSAGES.NO_INSTALLATION, {
        exit: EXIT_CODES.ERROR,
      });
    }
    const { installation, config: projectConfig } = detected;

    // Use installation.projectDir for reads (loading config, discovering installed skills).
    // Use cwd for writes (config saves, plugin installs, scope migrations, recompilation output)
    // and for the global-scope check (determining whether editing from global context).
    const projectDir = installation.projectDir;

    let sourceResult: SourceLoadResult;
    let startupMessages: StartupMessage[] = [];
    try {
      // No source is named here: `edit` reads the one the installation stored.
      const loaded = await loadSource({ projectDir, captureStartupMessages: true });
      sourceResult = loaded.sourceResult;
      startupMessages = loaded.startupMessages;

      const sourceInfo = sourceResult.isLocal ? "local" : sourceResult.sourceConfig.sourceOrigin;
      startupMessages.push({
        level: "info",
        text: `Loaded ${Object.keys(matrix.skills).length} skills (${sourceInfo})`,
      });
    } catch (error) {
      this.handleError(error);
    }

    let currentSkillIds: SkillId[];
    try {
      const discoveredSkills = await discoverAllPluginSkills(projectDir);
      const pluginSkillIds = typedKeys(discoveredSkills);

      // Merge plugin-discovered skills with config skills (catches local skills and
      // global-scoped plugins that discoverAllPluginSkills doesn't find).
      // Exclude skills marked as excluded — they should not appear as selected in the build step.
      // They are still preserved in skillConfigs via installedSkillConfigs for info panel/confirm step.
      const excludedConfigIds = new Set(
        projectConfig?.skills.filter((s) => s.excluded).map((s) => s.id) ?? [],
      );
      const configSkillIds =
        projectConfig?.skills.filter((s) => !s.excluded).map((s) => s.id) ?? [];
      const filteredPluginSkillIds = pluginSkillIds.filter((id) => !excludedConfigIds.has(id));
      const mergedIds = new Set<SkillId>([...filteredPluginSkillIds, ...configSkillIds]);
      currentSkillIds = [...mergedIds];

      startupMessages.push({
        level: "info",
        text: `Found ${currentSkillIds.length} installed skills`,
      });
    } catch (error) {
      this.handleError(error);
    }

    return {
      installation,
      projectConfig,
      projectDir,
      sourceResult,
      startupMessages,
      currentSkillIds,
    };
  }

  private async runEditWizard(context: EditContext, cwd: string): Promise<WizardResultV2 | null> {
    const { projectConfig, currentSkillIds } = context;
    const selectedAgents = projectConfig?.agents && activeAgentNames(projectConfig.agents);

    return runWizardSession({
      hydrate: {
        initialStep: "build",
        ...(projectConfig?.selectedDomains !== undefined && {
          initialDomains: projectConfig.selectedDomains,
        }),
        ...(selectedAgents !== undefined && { initialAgents: selectedAgents }),
        installedSkillIds: currentSkillIds,
        ...(projectConfig?.skills !== undefined && { installedSkillConfigs: projectConfig.skills }),
        ...(projectConfig?.agents !== undefined && { installedAgentConfigs: projectConfig.agents }),
        isEditingFromGlobalScope: isHomeDirectory(cwd),
      },
      props: {
        version: this.config.version,
        initialAgents: selectedAgents,
        installedSkillIds: currentSkillIds,
        startupMessages: context.startupMessages,
      },
      onCancel: () => this.log("\nEdit cancelled"),
      clearTerminal: () => this.clearTerminal(),
    });
  }

  /**
   * Records, in the GLOBAL config, the install-mode migrations this run already performed
   * under `$HOME`.
   *
   * A project-context edit otherwise never writes global config (commit 403df46, "never
   * modify global config from project-level operations"), and `authoritativeScope: "owned"`
   * enforces that for the roster — an inherited global-active entry is read-only, so
   * `mergeGlobalConfigs` preserves it verbatim. That protection is correct for selection and
   * scope, but `executeMigration` resolves each skill's paths from ITS OWN scope: switching a
   * global-scoped skill's source has already copied it under `$HOME` (or deleted it) and
   * added/removed its user-scope plugin registration by the time the config is written.
   * Leaving the global config alone there protects nothing — it only makes the recorded
   * source contradict the filesystem and the plugin registry.
   *
   * So authority follows the work actually performed, and no further: only ids
   * `executeMigration` acted on this run are rewritten, and only their `source` field. Global
   * entries this session merely displayed, re-scoped or deselected are untouched, as are
   * `marketplace`, `stack`, `agents` and every other registered project's view of them.
   *
   * Driving a global-scope migration from a project directory is NOT a supported flow, and this
   * method is no longer the thing that permits it. The wizard now refuses it at source: the two
   * bulk install-mode keys are withdrawn, and `setInstallMode` ignores a project-context call
   * against a global slot the hydration snapshot owns — the same authority the Sources grid
   * already enforced by rendering that row inert. What still reaches here is the residue that
   * authority leaves legitimate: a mode change committed on the project half of a `[P][G]` pair
   * and then carried to global scope by a P->G collapse (`s`) in the same session. The entry is
   * the project's own to configure at the moment it is configured, and global at the moment it
   * is written — so the migration is real, and the global config must record it.
   *
   * Runs BEFORE `writeConfigAndCompile`, so the global config written here is the one
   * the wizard write reloads, keeps (existing wins in `mergeGlobalConfigs`) and inlines
   * into the project config — both files then tell the same story. That second write
   * classifies as a no-op against what this one left on disk, so the fan-out below
   * happens once.
   *
   * The migrated `source` decides the reference form a compiled agent emits, so every
   * OTHER registered project's config and agents are stale until this write fans out —
   * which is why it goes through the gate rather than straight to the file.
   */
  private async recordGlobalSourceMigrations(
    migratedSkillIds: Set<SkillId>,
    newSkills: SkillConfig[],
    cwd: string,
    context: EditContext,
  ): Promise<void> {
    // A global-context edit writes the whole global config from the wizard result already.
    if (isHomeDirectory(cwd)) return;

    const migratedSources = new Map(
      newSkills
        .filter((s) => migratedSkillIds.has(s.id) && isActiveAt(s, "global"))
        .map((s) => [s.id, s.origin] as const),
    );
    if (migratedSources.size === 0) return;

    try {
      const report = await mutateGlobal(
        { kind: "migrate-skill-sources", sources: migratedSources },
        {
          // The deps contract in config-gate/deps.ts declares
          // `() => Promise<MergedSkillsMatrix>`; this caller happens to have its
          // matrix in hand already.
          // eslint-disable-next-line @typescript-eslint/require-await -- deps contract
          loadMatrix: async () => context.sourceResult.matrix,
          loadAgents: async () => (await loadAgentDefs({ projectDir: cwd })).agents,
        },
      );
      this.reportPropagatedRecompile(report);
    } catch (error) {
      this.warn(`Could not record global origin change: ${getErrorMessage(error)}`);
    }
  }

  private logChangeSummary(
    changes: ConfigChanges,
    newSkills: SkillConfig[],
    oldSkills: SkillConfig[],
    removalReasons: ReadonlyMap<SkillId, string>,
  ): void {
    const {
      addedSkills,
      removedSkills,
      addedAgents,
      removedAgents,
      sourceChanges,
      scopeChanges,
      agentScopeChanges,
      dualScopeSkillTransitions,
      dualScopeAgentTransitions,
    } = changes;

    this.log(`\n${chalk.hex(CLI_COLORS.WHITE).bold("Changes:")}`);
    for (const skillId of addedSkills) {
      const scope = newSkills.find((s) => s.id === skillId)?.scope;
      const scopeLabel = scope ? ` ${formatScopeTag(scope)}` : "";
      this.log(
        chalk.hex(CLI_COLORS.SUCCESS)(`  + ${getSkillById(skillId).displayName}${scopeLabel}`),
      );
    }
    for (const skillId of removedSkills) {
      const scope = oldSkills.find((s) => s.id === skillId)?.scope;
      const scopeLabel = scope ? ` ${formatScopeTag(scope)}` : "";
      const reason = removalReasons.get(skillId);
      this.log(
        chalk.hex(CLI_COLORS.ERROR)(`  - ${getSkillDisplayName(skillId)}${scopeLabel}`) +
          (reason ? chalk.hex(CLI_COLORS.NEUTRAL)(` (${reason})`) : ""),
      );
    }
    for (const agentName of addedAgents) {
      this.log(
        chalk.hex(CLI_COLORS.SUCCESS)(`  + ${agentName}`) +
          chalk.hex(CLI_COLORS.NEUTRAL)(" (agent)"),
      );
    }
    for (const agentName of removedAgents) {
      this.log(
        chalk.hex(CLI_COLORS.ERROR)(`  - ${agentName}`) + chalk.hex(CLI_COLORS.NEUTRAL)(" (agent)"),
      );
    }
    for (const [skillId, change] of sourceChanges) {
      const displayName = getSkillDisplayName(skillId);
      const fromLabel = formatSourceDisplayName(change.from);
      const toLabel = formatSourceDisplayName(change.to);
      this.log(
        chalk.hex(CLI_COLORS.WARNING)(`  ~ ${displayName}`) +
          chalk.hex(CLI_COLORS.NEUTRAL)(` (${fromLabel} \u2192 ${toLabel})`),
      );
    }
    for (const [skillId, change] of scopeChanges) {
      this.log(formatSkillScopeChangeLine(skillId, change, dualScopeSkillTransitions));
    }
    for (const [agentName, change] of agentScopeChanges) {
      this.log(formatAgentScopeChangeLine(agentName, change, dualScopeAgentTransitions));
    }
    this.log("");
  }

  private async applyMigrations(
    _changes: ConfigChanges,
    filteredResult: WizardResultV2,
    activeOldSkills: SkillConfig[],
    context: EditContext,
    cwd: string,
  ): Promise<Set<SkillId>> {
    const migrationPlan = detectMigrations(activeOldSkills, filteredResult.skills);
    const migratedSkillIds = new Set([
      ...migrationPlan.toEject.map((m) => m.id),
      ...migrationPlan.toPlugin.map((m) => m.id),
    ]);
    if (migratedSkillIds.size === 0) return migratedSkillIds;

    if (migrationPlan.toEject.length > 0) {
      this.logModeSwitch(migrationPlan.toEject.length, INSTALL_MODE_DESCRIPTIONS.eject);
    }
    if (migrationPlan.toPlugin.length > 0) {
      this.logModeSwitch(migrationPlan.toPlugin.length, INSTALL_MODE_DESCRIPTIONS.plugin);
      // Installing a plugin needs the marketplace REGISTERED and up to date with the
      // Claude CLI — the same precondition `applyPluginChanges` and `applyScopeChanges`
      // establish. Without it `claude plugin install` rejects every ref against a stale
      // local copy. Runs before `executeMigration` so an unresolvable marketplace exits
      // while the ejected working copies are still intact. Eject-side plugin uninstalls
      // are diagnostic-only, so only plugin-install work demands this.
      await this.requireMarketplaceOrExit(context.sourceResult, "migrate skills to plugin mode");
      // The install itself happens inside `executeMigration`, which deletes each skill's
      // working copy the moment that skill's plugin is registered — so the banner is
      // announced here and the outcome reported below, through the same surface `init`
      // and the newly-added-skill path narrate an install with.
      this.announcePluginInstall();
    }

    const migrationResult = await executeMigration(migrationPlan, cwd, context.sourceResult);

    for (const warning of migrationResult.warnings) {
      this.warn(warning);
    }

    // The eject direction's own account of what it did. `executeMigration` copies each
    // skill before it attempts the plugin uninstall, so the count is the work that
    // landed; the uninstall is best-effort and diagnostic-only, and its successes stay
    // at verbose level while its failures are already in `warnings` above.
    if (migrationPlan.toEject.length > 0) {
      this.log(
        chalk.hex(CLI_COLORS.NEUTRAL)(localSkillsCopied(migrationResult.ejectedSkills.length)),
      );
    }

    // Reports what was installed and hard-errors on any failure: a migration whose
    // plugin could not be installed must not reach `recordGlobalSourceMigrations` or
    // `writeConfigAndCompile`, either of which would persist a marketplace `source`
    // for a skill with no plugin registration.
    if (migrationPlan.toPlugin.length > 0) {
      this.reportPluginInstalls(migrationResult.pluginInstalls);
    }

    return migratedSkillIds;
  }

  /** Names what this run is switching, in the words `init` describes an install mode with. */
  private logModeSwitch(count: number, modeDescription: string): void {
    this.log(chalk.hex(CLI_COLORS.NEUTRAL)(`Switching ${count} skill(s) to ${modeDescription}`));
  }

  private async applyScopeChanges(
    changes: ConfigChanges,
    filteredResult: WizardResultV2,
    context: EditContext,
    cwd: string,
  ): Promise<void> {
    const { scopeChanges } = changes;

    // Handle scope migrations (P->G or G->P) for eject-mode skills
    for (const [skillId, change] of scopeChanges) {
      const skillConfig = filteredResult.skills.find((s) => s.id === skillId);
      if (skillConfig?.origin === EJECT_SOURCE) {
        await migrateLocalSkillScope(skillId, change.from, cwd);
      }
    }

    // Plugin scope migrations require a marketplace.
    // Compute eligible migrations first; only resolve/demand marketplace when there are any.
    const hasPluginScopeChanges = [...scopeChanges.keys()].some((skillId) => {
      const skillConfig = filteredResult.skills.find((s) => s.id === skillId);
      return skillConfig && skillConfig.origin !== EJECT_SOURCE;
    });
    if (!hasPluginScopeChanges) return;

    const marketplace = await this.requireMarketplaceOrExit(
      context.sourceResult,
      "migrate plugin skill scopes",
    );

    const pluginScopeResult = await migratePluginSkillScopes(
      scopeChanges,
      filteredResult.skills,
      marketplace,
      cwd,
    );
    for (const item of pluginScopeResult.failed) {
      this.warn(`Failed to migrate plugin scope for ${item.id}: ${item.error}`);
    }
  }

  private async applySourceChanges(
    changes: ConfigChanges,
    activeOldSkills: SkillConfig[],
    cwd: string,
    migratedSkillIds: Set<SkillId>,
  ): Promise<void> {
    const { sourceChanges } = changes;

    // Handle remaining non-migration source changes (e.g., marketplace A -> marketplace B)
    for (const [skillId, change] of sourceChanges) {
      // Skip skills already handled by mode migration
      if (migratedSkillIds.has(skillId)) {
        continue;
      }
      if (change.from === EJECT_SOURCE) {
        const oldSkill = activeOldSkills.find((s) => s.id === skillId);
        const deleteDir = installBaseDir(cwd, oldSkill?.scope);
        await deleteLocalSkill(deleteDir, skillId);
      }
    }
  }

  private async applyPluginChanges(
    changes: ConfigChanges,
    filteredResult: WizardResultV2,
    activeOldSkills: SkillConfig[],
    context: EditContext,
    cwd: string,
  ): Promise<void> {
    const { addedSkills, removedSkills } = changes;

    // Compute plugin-intent lists per-skill (ungated) — per-skill `source` drives install mode.
    const addedPluginSkills = filteredResult.skills.filter(
      (s) => addedSkills.includes(s.id) && s.origin !== EJECT_SOURCE,
    );
    const removedPluginSkills = removedSkills.filter(
      (id) => activeOldSkills.find((s) => s.id === id)?.origin !== EJECT_SOURCE,
    );

    if (addedPluginSkills.length === 0 && removedPluginSkills.length === 0) return;

    const marketplace = await this.requireMarketplaceOrExit(
      context.sourceResult,
      "install or uninstall plugin skills",
    );

    if (addedPluginSkills.length > 0) {
      await this.installPluginSkillsReported(
        addedPluginSkills,
        marketplace,
        cwd,
        context.sourceResult.matrix,
      );
    }

    if (removedPluginSkills.length > 0) {
      const uninstallResult = await uninstallPluginSkills(
        removedPluginSkills,
        activeOldSkills,
        marketplace,
        cwd,
      );
      if (uninstallResult.uninstalled.length > 0) {
        this.log(
          chalk.hex(CLI_COLORS.NEUTRAL)(`Removed ${uninstallResult.uninstalled.length} plugin(s)`),
        );
      }
      for (const item of uninstallResult.failed) {
        this.warn(`Failed to uninstall plugin ${item.id}: ${item.error}`);
      }
    }
  }

  private async copyNewLocalSkills(
    changes: ConfigChanges,
    filteredResult: WizardResultV2,
    context: EditContext,
    cwd: string,
  ): Promise<void> {
    const { addedSkills } = changes;

    // Copy newly added local-source skills to .claude/skills/ (split by scope)
    const addedLocalSkills = filteredResult.skills.filter(
      (s) => addedSkills.includes(s.id) && s.origin === EJECT_SOURCE,
    );

    if (addedLocalSkills.length > 0) {
      const copyResult = await copyLocalSkills(addedLocalSkills, cwd, context.sourceResult);
      this.log(chalk.hex(CLI_COLORS.NEUTRAL)(localSkillsCopied(copyResult.totalCopied)));
    }
  }

  private async removeDeletedLocalSkills(
    changes: ConfigChanges,
    activeOldSkills: SkillConfig[],
    cwd: string,
  ): Promise<void> {
    const { removedSkills } = changes;

    // A fully-deselected eject-mode skill is a genuine uninstall — its copied directory under
    // .claude/skills/<id>/ must be removed from the scope it was installed at (D-233). Plugin
    // removals are handled by applyPluginChanges; source-change (eject->marketplace) deletions by
    // applySourceChanges. deleteLocalSkill is a no-op when the directory is absent.
    for (const skillId of removedSkills) {
      const oldSkill = activeOldSkills.find((s) => s.id === skillId);
      if (oldSkill?.origin !== EJECT_SOURCE) continue;

      const deleteDir = installBaseDir(cwd, oldSkill.scope);
      await deleteLocalSkill(deleteDir, skillId);
    }
  }

  private async writeConfigAndCompile(
    result: WizardResultV2,
    context: EditContext,
    cwd: string,
    authority: AuthoritativeScope,
  ): Promise<void> {
    // Load agent definitions — needed for both config-types.ts and recompilation
    let agentDefsResult: AgentDefs;
    try {
      agentDefsResult = await loadAgentDefs({});
    } catch (error) {
      this.handleError(error);
    }

    // Persist wizard result to config.ts and config-types.ts (split by scope when in project context)
    let configResult: ConfigWriteResult | undefined;
    try {
      configResult = await writeProjectConfig({
        wizardResult: result,
        sourceResult: context.sourceResult,
        projectDir: cwd,
        agents: agentDefsResult.agents,
        // A full `cc edit` pass is authoritative over the roster it owns, so deselected entries
        // are removed rather than union-preserved (D-233 Scenario C). `applyAuthority` decides
        // how much that is from the producer and the directory, and hands the same word to the
        // merger and to the global config the project branch of the gate commits.
        authoritativeScope: authority,
      });
    } catch (error) {
      this.warn(`Could not update config: ${getErrorMessage(error)}`);
    }

    if (configResult) {
      this.reportUnassignedSkills(configResult.config);
    }

    try {
      const agentScopeMap = activeAgentScopeMap(result.agentConfigs);
      const { allSkills } = await discoverInstalledSkills(cwd);
      const compilationResult = await compileAgentsAllScopes({
        projectDir: cwd,
        sourcePath: agentDefsResult.sourcePath,
        skills: allSkills,
        agentScopeMap,
      });

      const { compiled, rewritten, failed, warnings } = compilationResult;
      const summary = recompileSummary(
        rewritten.length,
        compiled.length - rewritten.length,
        RECOMPILE_SUBJECT,
      );

      if (failed.length > 0) {
        this.log(
          chalk.hex(CLI_COLORS.NEUTRAL)(summary) +
            chalk.hex(CLI_COLORS.WARNING)(` (${failed.length} failed)`),
        );
        for (const warning of warnings) {
          this.warn(warning);
        }
      } else if (compiled.length > 0) {
        this.log(chalk.hex(CLI_COLORS.NEUTRAL)(summary));
      } else {
        this.log(chalk.hex(CLI_COLORS.NEUTRAL)(INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE));
      }
    } catch (error) {
      this.warn(`Agent recompilation failed: ${getErrorMessage(error)}`);
      this.log(`You can manually recompile with '${CLI_INVOKE_COMMAND} compile'.`);
    }

    if (configResult) {
      this.reportPropagatedRecompile(configResult.propagation);
    }
  }

  private async cleanupStaleAgentFiles(
    changes: ConfigChanges,
    oldAgents: AgentScopeConfig[],
    cwd: string,
  ): Promise<void> {
    for (const removal of planStaleAgentRemovals(changes, oldAgents, cwd)) {
      const { failed } = await removeCompiledAgents(removal);

      for (const { name, error } of failed) {
        const agentPath = path.join(removal.agentsDir, `${name}.md`);
        this.warn(`Could not remove agent file ${agentPath}: ${error}`);
      }
    }
  }

  private logCompletionSummary(_changes: ConfigChanges): void {
    this.log(`\n${chalk.hex(CLI_COLORS.SUCCESS)("\u2713 Done")}\n`);
  }
}

/** @internal Exported for testing */
export type ConfigChanges = {
  addedSkills: SkillId[];
  removedSkills: SkillId[];
  addedAgents: AgentName[];
  removedAgents: AgentName[];
  sourceChanges: Map<SkillId, { from: string; to: string }>;
  scopeChanges: Map<SkillId, ScopeChange>;
  agentScopeChanges: Map<AgentName, ScopeChange>;
  /**
   * Skill ids whose `scopeChanges` entry is a dual-scope add/remove — the project
   * half of a `[P][G]` pair was toggled while the global half persists — NOT a true
   * single-entry migration. The disk-side scope work still flows through
   * `scopeChanges`; this set only steers the completion-summary display so a
   * dual-scope addition is not misreported as a `[G] → [P]` migration.
   */
  dualScopeSkillTransitions: Set<SkillId>;
  /** Agent equivalent of `dualScopeSkillTransitions`. */
  dualScopeAgentTransitions: Set<AgentName>;
};

/** Full (tombstone-inclusive) entry lists used to classify dual-scope transitions. */
type FullScopeEntries = {
  newSkills: SkillConfig[];
  oldSkills: SkillConfig[];
  newAgents: AgentScopeConfig[];
  oldAgents: AgentScopeConfig[];
};

/**
 * @internal Exported for testing
 *
 * `oldConfig` / `wizardResult` carry the ACTIVE (tombstone-filtered) entries used
 * for add/remove/source/scope diffing. `fullEntries`, when provided, carries the
 * unfiltered lists (including excluded tombstones) used ONLY to tell a genuine
 * scope migration apart from a dual-scope add/remove. When omitted, every scope
 * change is treated as a migration (the pre-dual-scope behaviour).
 */
export function detectConfigChanges(
  oldConfig: ProjectConfig | null,
  wizardResult: WizardResultV2,
  fullEntries?: FullScopeEntries,
): ConfigChanges {
  const oldSkillIds = oldConfig?.skills.map((s) => s.id) ?? [];
  const newSkillIds = wizardResult.skills.map((s) => s.id);
  const oldAgentNames = oldConfig?.agents.map((a) => a.name) ?? [];
  const newAgentNames = wizardResult.agentConfigs.map((a) => a.name);

  const oldSkillsById = indexBy(oldConfig?.skills ?? [], (s) => s.id);
  const oldAgentsByName = indexBy(oldConfig?.agents ?? [], (a) => a.name);

  const scopeChanges = detectPropertyChanges(
    wizardResult.skills,
    oldSkillsById,
    (s) => s.id,
    (s) => s.scope,
  );
  const agentScopeChanges = detectPropertyChanges(
    wizardResult.agentConfigs,
    oldAgentsByName,
    (a) => a.name,
    (a) => a.scope,
  );

  return {
    addedSkills: difference(newSkillIds, oldSkillIds),
    removedSkills: difference(oldSkillIds, newSkillIds),
    addedAgents: difference(newAgentNames, oldAgentNames),
    removedAgents: difference(oldAgentNames, newAgentNames),
    sourceChanges: detectPropertyChanges(
      wizardResult.skills,
      oldSkillsById,
      (s) => s.id,
      (s) => s.origin,
    ),
    scopeChanges,
    agentScopeChanges,
    dualScopeSkillTransitions: detectDualScopeTransitions(
      scopeChanges,
      fullEntries?.newSkills ?? [],
      fullEntries?.oldSkills ?? [],
      (s) => s.id,
    ),
    dualScopeAgentTransitions: detectDualScopeTransitions(
      agentScopeChanges,
      fullEntries?.newAgents ?? [],
      fullEntries?.oldAgents ?? [],
      (a) => a.name,
    ),
  };
}

function detectPropertyChanges<T, K extends string, V>(
  newItems: T[],
  oldByKey: Record<string, T>,
  getKey: (item: T) => K,
  getValue: (item: T) => V,
): Map<K, { from: V; to: V }> {
  const changes = new Map<K, { from: V; to: V }>();
  for (const item of newItems) {
    const key = getKey(item);
    const old = oldByKey[key];
    if (old && getValue(old) !== getValue(item)) {
      changes.set(key, { from: getValue(old), to: getValue(item) });
    }
  }
  return changes;
}

/**
 * A scope change is a dual-scope transition (not a migration) when the canonical
 * dual-scope tombstone — an excluded global entry — sits alongside it:
 *  - G→P add: the NEW state keeps a global tombstone, so the global install
 *    survives and the project half was merely added.
 *  - P→G remove: the OLD state held a global tombstone, so the pair was already
 *    dual-scope and the project half was merely removed.
 * Either way the item occupied both scopes, so `[X] → [Y]` would misdescribe it.
 */
function detectDualScopeTransitions<
  K extends string,
  T extends { scope: SkillScope; excluded?: boolean },
>(scopeChanges: Map<K, ScopeChange>, fullNew: T[], fullOld: T[], getKey: (item: T) => K): Set<K> {
  const hasGlobalTombstone = (items: T[], key: K): boolean =>
    items.some((item) => getKey(item) === key && item.scope === "global" && item.excluded === true);

  const result = new Set<K>();
  for (const [key, change] of scopeChanges) {
    if (change.from === "global" && change.to === "project" && hasGlobalTombstone(fullNew, key)) {
      result.add(key);
    } else if (
      change.from === "project" &&
      change.to === "global" &&
      hasGlobalTombstone(fullOld, key)
    ) {
      result.add(key);
    }
  }
  return result;
}

type StaleAgent = { name: AgentName; scope: SkillScope };

/** Every scope a stale compiled agent can be sitting at. */
const STALE_AGENT_SCOPES = ["project", "global"] as const satisfies readonly SkillScope[];

/** The scope a deselected agent was installed at, for one absent from the old roster. */
const UNRECORDED_AGENT_SCOPE: SkillScope = "project";

function installedScope(name: AgentName, oldAgents: AgentScopeConfig[]): SkillScope {
  return oldAgents.find((agent) => agent.name === name)?.scope ?? UNRECORDED_AGENT_SCOPE;
}

/**
 * The compiled files an edit leaves stale, one removal per scope directory that
 * holds any: the project copy a P→G move superseded, plus every deselected agent
 * at the scope it was installed at.
 *
 * G→P moves are absent deliberately — that direction is an override, so the global
 * installation stays untouched and the project copy shadows it. A scope with
 * nothing to remove is absent too: only a directory this edit actually removed
 * from is a directory this edit may tidy.
 */
function planStaleAgentRemovals(
  changes: ConfigChanges,
  oldAgents: AgentScopeConfig[],
  cwd: string,
): RemoveCompiledAgentsOptions[] {
  const supersededByGlobal = [...changes.agentScopeChanges]
    .filter(([, change]) => change.from !== "global")
    .map(([name]): StaleAgent => ({ name, scope: "project" }));

  const deselected = changes.removedAgents.map((name): StaleAgent => ({
    name,
    scope: installedScope(name, oldAgents),
  }));

  const stale = [...supersededByGlobal, ...deselected];
  const removalAtScope = (scope: SkillScope): RemoveCompiledAgentsOptions => ({
    agentsDir: resolveInstallPaths(cwd, scope).agentsDir,
    agents: stale.filter((agent) => agent.scope === scope).map((agent) => agent.name),
  });

  return STALE_AGENT_SCOPES.map(removalAtScope).filter((removal) => removal.agents.length > 0);
}

function hasAnyChanges(changes: ConfigChanges): boolean {
  return (
    changes.addedSkills.length > 0 ||
    changes.removedSkills.length > 0 ||
    changes.addedAgents.length > 0 ||
    changes.removedAgents.length > 0 ||
    changes.sourceChanges.size > 0 ||
    changes.scopeChanges.size > 0 ||
    changes.agentScopeChanges.size > 0
  );
}

/** @internal Exported for testing */
export type PluginScopeMigrationResult = {
  migrated: SkillId[];
  failed: Array<{ id: SkillId; error: string }>;
};

/** @internal Exported for testing */
export async function migratePluginSkillScopes(
  scopeChanges: Map<SkillId, ScopeChange>,
  skills: Pick<SkillConfig, "id" | "origin">[],
  marketplace: string,
  projectDir: string,
): Promise<PluginScopeMigrationResult> {
  const migrated: SkillId[] = [];
  const failed: PluginScopeMigrationResult["failed"] = [];

  for (const [skillId, change] of scopeChanges) {
    const skillConfig = skills.find((s) => s.id === skillId);
    if (!skillConfig || skillConfig.origin === EJECT_SOURCE) {
      continue;
    }

    const newPluginScope = toClaudePluginScope(change.to);
    const pluginRef = buildMarketplacePluginRef(skillId, marketplace);

    try {
      // global→project: keep the global registration, just add project scope.
      // The global plugin must remain for other projects.
      // project→global: uninstall the project-scope registration, install global.
      if (change.from === "project") {
        await claudePluginUninstall(pluginRef, "project", projectDir);
      }
      await claudePluginInstall(pluginRef, newPluginScope, projectDir);
      migrated.push(skillId);
    } catch (error) {
      failed.push({ id: skillId, error: getErrorMessage(error) });
    }
  }

  return { migrated, failed };
}
