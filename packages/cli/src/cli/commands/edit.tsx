import path from "path";

import chalk from "chalk";
import { Flags } from "@oclif/core";

import { difference, indexBy, partition } from "remeda";

import { BaseCommand } from "../base-command.js";
import { type WizardResultV2 } from "../components/wizard/wizard.js";
import { runWizardSession } from "../components/wizard/run-wizard-session.js";
import {
  CLI_INVOKE_COMMAND,
  CLI_COLORS,
  EDIT_PROJECT_SETUP_FLAG,
  EDIT_PROJECT_SETUP_MARKETPLACE_FLAG,
  EJECT_SOURCE,
  editorConfigUrl,
  formatSourceDisplayName,
} from "../consts.js";
import {
  detectProject,
  loadSource,
  sayCapturedWarnings,
  copyLocalSkills,
  uninstallPluginSkills,
  loadAgentDefs,
  type AgentDefs,
  writeProjectConfig,
  type ConfigWriteResult,
  compileAgentsAllScopes,
  compileProjectScope,
  discoverInstalledSkills,
  removeCompiledAgents,
  type RemoveCompiledAgentsOptions,
} from "../lib/operations/index.js";
import { awaitUnderSpinner } from "../components/common/spinner.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import {
  type EjectCopyResult,
  type Installation,
  detectMigrations,
  ejectCopyFailureError,
  executeMigration,
  holdsItsOwnInstallation,
  isHomeDirectory,
  resolveInstallPaths,
  INSTALL_MODE_DESCRIPTIONS,
} from "../lib/installation/index.js";
import {
  applyMigratedGlobalSources,
  movedGlobalAgentInputs,
  mutateGlobal,
  type GateReport,
} from "../lib/config-gate/index.js";
import { matrix, getSkillById, getSkillDisplayName } from "../lib/matrix/matrix-provider";
import { type AuthoritativeScope } from "../lib/configuration/index.js";
import {
  activeAgentNames,
  activeAgentScopeMap,
  isActiveAt,
  isGlobalTombstone,
} from "../lib/configuration/scope-predicates.js";
import type { SourceLoadResult } from "../lib/loading/index.js";
import { discoverAllPluginSkills, buildMarketplacePluginRef } from "../lib/plugins/index.js";
import {
  deleteLocalSkill,
  foldLocalSkillIntoGlobal,
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
  carriedSkillsThatDiffer,
  registerExternalSkills,
  writeExternalSkills,
  type ExternalSkillInstall,
} from "../lib/seed/external-skills.js";
import { seedToWizardResult, type SeedMapping } from "../lib/seed/seed-to-wizard.js";
import {
  arrivalLines,
  arrivalsByScope,
  notInstalledGlobally,
  readInstalledGlobal,
  reconcileSharedConfig,
  restoreInstalledGlobal,
  sameAssignments,
  skillLabel,
  withUnplaceableAssignees,
  type Arrivals,
  type HeldGlobal,
  type KeptFromRoundTrip,
  type UnassignedRow,
} from "../lib/seed/seed-apply.js";
import {
  RemovalPlanConfirm,
  type RemovalPlanSection,
} from "../components/common/removal-plan-confirm.js";
import { promptConfirm } from "../components/common/prompt-confirm.js";
import { hostAt } from "../lib/hosts/host-for.js";
import { hostCompileNotices } from "../lib/hosts/host-compile-notices.js";
import { unofferablePlacementsFound } from "../lib/hosts/configured-placements.js";
import { providerInUse } from "../lib/installation/install-layout.js";
import {
  providerFlag,
  providerNamedBy,
  refuseAnAmbiguousInstallation,
} from "../lib/installation/provider-flag.js";
import { openUrl } from "../utils/open-url.js";
import { plural } from "../utils/string.js";
import { getErrorMessage } from "../utils/errors.js";
import { type StartupMessage } from "../utils/logger.js";
import {
  INCOMPLETE_WORK_RECOVERY,
  ERROR_MESSAGES,
  INFO_MESSAGES,
  SHARED_CONFIG_APPLY,
  STATUS_MESSAGES,
  agentsNotCompiled,
  applySharedConfigHere,
  authoredHereKept,
  carriedSkillsWritten,
  keptAsInstalledGlobally,
  keptUnassigned,
  localSkillsCopied,
  nothingInstalledToApplyTo,
  projectCopyRemoved,
  recompileSummary,
  sharedConfigDestinations,
  sharedConfigNeedsTerminal,
  skippedUnknownAgents,
  skippedUnknownSkills,
  unplaceableKept,
  wizardNeedsTerminal,
} from "../utils/messages.js";
import { formatScopeTag } from "../lib/wizard/index.js";
import { typedKeys } from "../utils/typed-object.js";
import type { SeedPayload } from "@workspace/matrix/seed";

type ScopeChange = { from: SkillScope; to: SkillScope };

/** `edit` recompiles every scope it owns in one pass, so its summary has no scope word. */
const RECOMPILE_SUBJECT = "agent";

/** A `[P][G]` pair's project half toggled: an arrow line would claim the global install moved. */
function formatDualScopeTransition(displayName: string, to: SkillScope): string {
  const isAdd = to === "project";
  const prefix = isAdd ? "+" : "-";
  const color = isAdd ? CLI_COLORS.SUCCESS : CLI_COLORS.ERROR;
  return chalk.hex(color)(`  ${prefix} ${displayName} [P]`);
}

/** A genuine `[G] → [P]` reads as an addition: the skill arrives in this project. */
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

/** Unlike a skill, a moved agent is always a move, and only the dual-scope arm says `(agent)`. */
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

function scopeArrow(change: ScopeChange): string {
  return ` (${formatScopeTag(change.from)} \u2192 ${formatScopeTag(change.to)})`;
}

/** Prints both values: a retune leaves nothing on disk to compare against. */
function formatValueChangeLine(subject: string, change: ValueChange, kind: string): string {
  return (
    chalk.hex(CLI_COLORS.WARNING)(`  ~ ${subject}`) +
    chalk.hex(CLI_COLORS.NEUTRAL)(` (${kind}: ${change.from} \u2192 ${change.to})`)
  );
}

/** The resolved marketplace, or the source string when there is none. */
function loadedSourceLabel(sourceResult: SourceLoadResult): string {
  return sourceResult.marketplace ?? sourceResult.sourceConfig.source;
}

/** @internal Re-exported for testing — the transform itself lives inside the gate. */
export { applyMigratedGlobalSources };

type EditContext = {
  installation: Installation;
  projectConfig: ProjectConfig | null;
  /** The detected installation's root — where this run READS its saved skills from. */
  projectDir: string;
  sourceResult: SourceLoadResult;
  startupMessages: StartupMessage[];
  currentSkillIds: SkillId[];
  /** What `init --marketplace` named for the project setup this run continues. */
  setupMarketplace?: string;
};

/** The one directory an `edit` run acts on, decided once and handed to every layer. */
type EditRoot = {
  /** Where this run writes, registers plugins and compiles into. */
  dir: string;
  /** {@link EditRoot.dir} IS the global installation: no project scope to offer. */
  isGlobal: boolean;
  /** Materialise {@link EditRoot.dir} as a project even with nothing to change. */
  isProjectSetup: boolean;
};

/**
 * The installation `detectProject` found is the only root with a config, so the only one this run
 * may write to. `--project-setup` (`cc init` here) declares this directory the one being set up.
 */
function resolveEditRoot(
  installation: Installation,
  cwd: string,
  setupRequested: boolean,
): EditRoot {
  const dir = setupRequested ? cwd : installation.projectDir;
  const isGlobal = isHomeDirectory(dir);
  return { dir, isGlobal, isProjectSetup: setupRequested && !isGlobal };
}

/**
 * Both producers yield one `WizardResultV2`, applied by one sequence. A shared configuration
 * destroys whatever it leaves out, so its removals are confirmed first.
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

type SharedConfigPlan = {
  heading: string;
  sections: RemovalPlanSection[];
  statements: string[];
};

/**
 * From a project the global install is restored before the diff (`restoreInstalledGlobal`), so
 * every listed removal is the project's own; a `[P][G]` pair's id survives at global scope and is
 * not listed.
 */
function sharedConfigPlan(changes: ConfigChanges, kept: string[]): SharedConfigPlan {
  const dropped = droppedProjectHalves(changes);
  const skillLines = [
    ...changes.removedSkills.map(skillLabel),
    ...dropped.skillIds.map(droppedSkillLine),
  ];
  const agentLines = [...changes.removedAgents, ...dropped.agentNames.map(projectCopyRemoved)];

  const sections = removalSections(skillLines, agentLines);
  return { heading: planHeading(sections), sections, statements: kept };
}

function droppedSkillLine(skillId: SkillId): string {
  return projectCopyRemoved(skillLabel(skillId));
}

function removalSections(skills: string[], agents: string[]): RemovalPlanSection[] {
  return [
    { label: SHARED_CONFIG_APPLY.SKILLS_HEADING, items: skills },
    { label: SHARED_CONFIG_APPLY.AGENTS_HEADING, items: agents },
  ].filter((section) => section.items.length > 0);
}

type DroppedHalves = { skillIds: SkillId[]; agentNames: AgentName[] };

/**
 * The diff records these as project-to-global scope changes, since the id survives at global
 * scope. A pair `s` folded is excluded: its copy moves rather than goes.
 */
function droppedProjectHalves(changes: ConfigChanges): DroppedHalves {
  const droppedSkills = changes.collapsedPairs.filter((pair) => !pair.folded);
  const droppedAgents = [...changes.agentScopeChanges].filter(
    ([name, change]) => change.to === "global" && changes.dualScopeAgentTransitions.has(name),
  );

  return {
    skillIds: droppedSkills.map(({ projectHalf }) => projectHalf.id),
    agentNames: droppedAgents.map(([name]) => name),
  };
}

/** A configuration that only adds says so, and is still confirmed: it is applied whole. */
function planHeading(sections: RemovalPlanSection[]): string {
  if (sections.length === 0) return SHARED_CONFIG_APPLY.NOTHING_REMOVED;
  return SHARED_CONFIG_APPLY.PREVIEW_HEADING;
}

/**
 * From a project a shared configuration holds the global install as installed, so the global pass
 * runs only when the write added something global sub-agents derive from. The wizard keeps both:
 * a mode switch it carried to global scope is recorded before this write.
 */
function compilesGlobalScope(
  producer: EditSelection["producer"],
  editRoot: EditRoot,
  written: GateReport,
): boolean {
  if (editRoot.isGlobal || producer === "wizard") return true;
  return movedGlobalAgentInputs(written);
}

/**
 * Adds sub-agents whose skill rows change while the roster does not, which
 * {@link detectConfigChanges} cannot see.
 */
type PlannedChanges = ConfigChanges & { reassignedAgents: AgentName[] };

/** Adds carried skills already installed here whose files the apply rewrote. */
type AppliedChanges = PlannedChanges & { rewrittenSkills: SkillId[] };

/**
 * Only a producer that states rows has any: the wizard leaves `assignedStack` undefined. In a
 * project only the project's own sub-agents count; a global one keeps its installed rows
 * (`restoreInstalledGlobal`). A sub-agent already counted as added is not counted twice.
 */
function withReassignments(
  changes: ConfigChanges,
  result: WizardResultV2,
  installedStack: ProjectConfig["stack"],
  editRoot: EditRoot,
): PlannedChanges {
  const { assignedStack } = result;
  if (assignedStack === undefined) return { ...changes, reassignedAgents: [] };

  const ownedHere = (agent: AgentScopeConfig): boolean =>
    editRoot.isGlobal || isActiveAt(agent, "project");
  const countedAsAdded = (agent: AgentScopeConfig): boolean =>
    changes.addedAgents.includes(agent.name);
  const rowsMoved = (agent: AgentScopeConfig): boolean =>
    !sameAssignments(assignedStack[agent.name], installedStack?.[agent.name]);

  const reassigned = result.agentConfigs.filter(
    (agent) => ownedHere(agent) && !countedAsAdded(agent) && rowsMoved(agent),
  );
  return { ...changes, reassignedAgents: reassigned.map((agent) => agent.name) };
}

/**
 * What the apply adds or changes, by landing scope. Excludes what is already installed as stated,
 * and the global copy a dropped project half leaves, which the plan lists as a removal.
 */
function applyArrivals(changes: PlannedChanges, result: WizardResultV2): Arrivals {
  const changedSkills = new Set<SkillId>([
    ...changes.addedSkills,
    ...changes.sourceChanges.keys(),
    ...changes.scopeChanges.keys(),
  ]);
  const changedAgents = new Set<AgentName>([
    ...changes.addedAgents,
    ...changes.agentScopeChanges.keys(),
    ...changes.tuningChanges.keys(),
    ...changes.reassignedAgents,
  ]);
  const dropped = droppedProjectHalves(changes);
  const skillArrives = (skill: SkillConfig): boolean =>
    changedSkills.has(skill.id) && !dropped.skillIds.includes(skill.id);
  const agentArrives = (agent: AgentScopeConfig): boolean =>
    changedAgents.has(agent.name) && !dropped.agentNames.includes(agent.name);

  return arrivalsByScope(
    result.skills.filter(skillArrives),
    result.agentConfigs.filter(agentArrives),
  );
}

/** Disclosed rather than acted on, so nobody is left wondering why an agent kept a skill. */
function keptStatements(kept: KeptFromRoundTrip): string[] {
  return [...authorshipStatement(kept), ...catalogueStatement(kept)];
}

function authorshipStatement(kept: KeptFromRoundTrip): string[] {
  if (kept.authoredSkillIds.length === 0) return [];
  return [authoredHereKept(kept.authoredSkillIds)];
}

function catalogueStatement(kept: KeptFromRoundTrip): string[] {
  if (kept.unplaceableSkillIds.length === 0) return [];
  return [unplaceableKept(kept.unplaceableSkillIds)];
}

function unassignedStatement(unassigned: UnassignedRow[]): string[] {
  if (unassigned.length === 0) return [];
  return [
    unassigned
      .map(({ skillId, agentName, category }) => keptUnassigned(skillId, agentName, category))
      .join("\n"),
  ];
}

function keptAsInstalledStatement(held: HeldGlobal, revisedCarried: SkillId[]): string[] {
  const skillIds = [...held.keptAsInstalled.skillIds, ...revisedCarried];
  const { agentNames } = held.keptAsInstalled;
  if (skillIds.length === 0 && agentNames.length === 0) return [];
  return [keptAsInstalledGlobally(skillIds, agentNames)];
}

/**
 * At the home root the run owns everything it loaded. In a project it owns only the project's
 * entries: the wizard cannot deselect a live global entry, and a shared configuration only adds to
 * the global install from a project (owner ruling 2026-10-02).
 */
function applyAuthority(editRoot: EditRoot): AuthoritativeScope {
  return editRoot.isGlobal ? "all" : "owned";
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
      description:
        "Open agentsinc.sh/editor instead of the wizard — the id --from names, or this installation",
      default: false,
    }),
    from: Flags.string({
      description:
        "Apply a configuration shared from agentsinc.sh by its id, removing whatever it leaves out — from a project, only the project's own entries",
      helpValue: "<id>",
    }),
    [EDIT_PROJECT_SETUP_FLAG]: Flags.boolean({
      description: "Internal: this run continues an `init` project setup",
      default: false,
      hidden: true,
    }),
    [EDIT_PROJECT_SETUP_MARKETPLACE_FLAG]: Flags.string({
      description: "Internal: the marketplace `init --marketplace` named for that project setup",
      hidden: true,
      dependsOn: [EDIT_PROJECT_SETUP_FLAG],
    }),
    provider: providerFlag(),
  };

  /** The exit code is decided once, after every path through `applyEdit`. */
  async run(): Promise<void> {
    await this.applyEdit();
    this.exitIfWorkIncomplete();
  }

  private async applyEdit(): Promise<void> {
    const { flags } = await this.parse(Edit);
    const cwd = process.cwd();

    // Above every installation check: opening a shared id needs no local state (owner ruling
    // 2026-08-24, pinned by `edit-ui-from.e2e.test.ts`).
    if (flags.ui && flags.from !== undefined) return this.openSharedInEditor(flags.from, cwd);

    // Before the wizard copies or installs anything.
    await refuseAnAmbiguousInstallation(cwd, "edit", providerNamedBy(flags.provider), (message) =>
      this.error(message, { exit: EXIT_CODES.INVALID_ARGS }),
    );

    // Before anything renders: an unreadable config is recreated, not edited.
    await this.ensureConfigReadable(cwd);
    await this.refuseUnofferablePlacements(cwd);

    // Replaces the wizard, so it runs above the source load.
    if (flags.ui) return this.openInEditor(cwd);

    // A destructive apply nobody can confirm must never become a yes; refused before the fetch.
    const payload =
      flags.from === undefined ? null : await this.fetchSharedConfigOrFail(flags.from);

    const context = await this.loadContextUnderSpinner(flags[EDIT_PROJECT_SETUP_MARKETPLACE_FLAG]);

    const editRoot = resolveEditRoot(context.installation, cwd, flags[EDIT_PROJECT_SETUP_FLAG]);

    // A skill whose metadata.yaml no longer describes it would be dropped from config.ts.
    await this.ensureSavedSkillsReadable(
      context.projectConfig?.skills ?? [],
      context.sourceResult.matrix,
      context.projectDir,
    );

    const selection = payload
      ? await this.selectionFromSharedConfig(payload, context, editRoot)
      : await this.selectionFromWizard(context, editRoot);
    if (!selection) this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });

    const { result } = selection;
    this.reportValidationErrors(result.validation);

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

    const planned = withReassignments(
      detectConfigChanges(filteredOldConfig, filteredResult, {
        newSkills: result.skills,
        oldSkills: context.projectConfig?.skills ?? [],
        newAgents: result.agentConfigs,
        oldAgents: context.projectConfig?.agents ?? [],
      }),
      filteredResult,
      context.projectConfig?.stack,
      editRoot,
    );
    // After the diff, above every mutation and the no-change return: carried skills may still have
    // bytes to land when the roster is unchanged.
    const rewritten =
      selection.producer === "shared"
        ? await this.confirmAndWriteCarried(selection, planned, filteredResult)
        : [];
    const changes: AppliedChanges = {
      ...planned,
      rewrittenSkills: difference(rewritten, planned.addedSkills),
    };

    // One authority for the merger's config row and the global config the gate commits.
    const authority = applyAuthority(editRoot);

    if (!hasAnyChanges(changes)) {
      this.log(chalk.hex(CLI_COLORS.NEUTRAL)("No changes made."));
      // `cc init` in a project materialises it (config pair written, path registered) even with no
      // change; a bare `cc edit`, or a home-root setup, stays an inspection.
      if (!editRoot.isProjectSetup) return;
      await this.writeConfigAndCompile(result, context, editRoot, authority, selection.producer);
      await this.reportWhatThisHostCannotCarry(editRoot);
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
      editRoot,
    );
    await this.recordGlobalSourceMigrations(
      migratedSkillIds,
      filteredResult.skills,
      editRoot,
      context,
    );
    await this.applyScopeChanges(changes, filteredResult, context, editRoot);
    await this.applyCollapsedPairs(changes, filteredResult, context, editRoot);
    await this.applySourceChanges(changes, activeOldSkills, editRoot, migratedSkillIds);
    await this.applyPluginChanges(changes, filteredResult, activeOldSkills, context, editRoot);
    await this.copyNewLocalSkills(changes, filteredResult, context, editRoot);
    await this.removeDeletedLocalSkills(changes, activeOldSkills, editRoot);
    await this.writeConfigAndCompile(result, context, editRoot, authority, selection.producer);
    await this.cleanupStaleAgentFiles(changes, activeOldAgents, editRoot);
    await this.reportWhatThisHostCannotCarry(editRoot);
    this.logCompletionSummary(changes);
  }

  private async selectionFromWizard(
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<EditSelection | null> {
    // The installation refusals above work over a pipe; the mount is the first thing needing a TTY.
    if (!process.stdin.isTTY) {
      this.error(wizardNeedsTerminal("edit"), { exit: EXIT_CODES.ERROR });
    }

    const result = await this.runEditWizard(context, editRoot);
    if (!result) return null;

    return { producer: "wizard", result };
  }

  /**
   * A shared configuration applies destructively, except for a skill written here (`forkedFrom`)
   * and an id this catalogue cannot place — both disclosed in the confirm. From a project the
   * global install is only added to (owner ruling 2026-10-02): entries the configuration omits or
   * states otherwise are held as installed, and only what it lacks arrives.
   */
  private async selectionFromSharedConfig(
    payload: SeedPayload,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<EditSelection> {
    const { matrix: sourceMatrix } = context.sourceResult;
    // Before the decode: a carried skill answers to no catalogue until it is seated.
    const carried = this.registerExternalSkillsOrFail(payload, sourceMatrix, editRoot.dir);
    const { result, skippedSkillIds, skippedAgentNames } = this.decodeSeedOrFail(
      payload,
      sourceMatrix,
    );

    // Before any skip is narrated; `init --from` asks the same at the same point.
    this.refuseProjectScopedContentAtHome(result, editRoot.dir);

    // Ids the decode could not place stay, as does a sub-agent only they carried in: a catalogue
    // limit is not an instruction to delete.
    const unplaceable = new Set(skippedSkillIds);
    const reconciled = reconcileSharedConfig({
      decoded: withUnplaceableAssignees(result, context.projectConfig, payload, unplaceable),
      installed: context.projectConfig,
      authoredHere: await this.readAuthoredHere(context.projectConfig, editRoot.dir),
      unplaceable,
    });
    const held = restoreInstalledGlobal(
      reconciled.result,
      editRoot.isGlobal ? null : await readInstalledGlobal(editRoot.dir),
    );
    const arrivingCarried = notInstalledGlobally(carried, held);

    await this.refuseSharedConfigBeforeAsking(
      held.result,
      arrivingCarried,
      editRoot.dir,
      context.sourceResult,
    );

    // Held globally, so not written from a project; named in the plan instead.
    const heldGlobally = difference(carried, arrivingCarried);
    const revisedGlobally = await carriedSkillsThatDiffer(heldGlobally);

    // Warnings the load buffered for a wizard this run never mounts.
    sayCapturedWarnings(context.startupMessages);
    if (skippedSkillIds.length > 0) this.warn(skippedUnknownSkills(skippedSkillIds));
    if (skippedAgentNames.length > 0) this.warn(skippedUnknownAgents(skippedAgentNames));

    return {
      producer: "shared",
      result: held.result,
      kept: [
        ...keptStatements(reconciled.kept),
        ...unassignedStatement(reconciled.unassigned),
        ...keptAsInstalledStatement(held, revisedGlobally),
      ],
      carried: arrivingCarried,
    };
  }

  /** Best-effort: an unreadable directory protects nothing and must not fail an apply. */
  private async readAuthoredHere(
    projectConfig: ProjectConfig | null,
    editRoot: string,
  ): Promise<Set<SkillId>> {
    if (!projectConfig) return new Set();

    try {
      return await skillsAuthoredHere(projectConfig, editRoot);
    } catch (error) {
      this.warn(`Could not tell which skills were written here: ${getErrorMessage(error)}`);
      return new Set();
    }
  }

  /** Refuses an empty directory or a missing terminal before spending a round trip. */
  private async fetchSharedConfigOrFail(id: string): Promise<SeedPayload> {
    if (!(await detectProject())) {
      this.error(nothingInstalledToApplyTo(id), { exit: EXIT_CODES.ERROR });
    }
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

  private decodeSeedOrFail(payload: SeedPayload, sourceMatrix: MergedSkillsMatrix): SeedMapping {
    try {
      return seedToWizardResult(payload, sourceMatrix);
    } catch (error) {
      this.handleError(error);
    }
  }

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

  private async confirmAndWriteCarried(
    selection: Extract<EditSelection, { producer: "shared" }>,
    planned: PlannedChanges,
    result: WizardResultV2,
  ): Promise<SkillId[]> {
    await this.confirmSharedConfigOrCancel(planned, selection.kept, applyArrivals(planned, result));
    return this.writeCarriedSkills(selection.carried);
  }

  private async writeCarriedSkills(carried: ExternalSkillInstall[]): Promise<SkillId[]> {
    if (carried.length === 0) return [];

    const rewritten = await writeExternalSkills(carried);
    this.log(carriedSkillsWritten(carried.map((skill) => skill.id)));
    return rewritten;
  }

  /**
   * The plan and the apply read the same `ConfigChanges`, so what is approved is what is removed.
   * The arrivals print above it, so the question covers the whole of what a yes does.
   */
  private async confirmSharedConfigOrCancel(
    changes: ConfigChanges,
    kept: string[],
    arrivals: Arrivals,
  ): Promise<void> {
    const plan = sharedConfigPlan(changes, kept);
    for (const line of arrivalLines(arrivals)) {
      this.log(line);
    }

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

  /** `edit` rewrites the file, so it must not let a user curate a roster no command acts on. */
  private async refuseUnofferablePlacements(cwd: string): Promise<void> {
    const [finding] = await unofferablePlacementsFound(cwd);
    if (finding !== undefined) this.error(finding, { exit: EXIT_CODES.ERROR });
  }

  /**
   * Mints through `seedPayloadForInstallation`, as `share` does, so one project has one id. Touches
   * nothing on disk.
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

  /** Opens an id rather than applying it; `--from` without `--ui` is the destructive apply. */
  private async openSharedInEditor(id: string, cwd: string): Promise<void> {
    const url = editorConfigUrl(id);

    this.log(`Open it at ${url}`);
    this.log(applySharedConfigHere(id, await holdsItsOwnInstallation(cwd)));

    if (!process.stdin.isTTY) return;

    const opened = await openUrl(url);
    if (!opened.ok) this.warn(opened.error);
  }

  /** The link prints first: it works over a pipe, in CI and with no desktop. Opening is extra. */
  private async handToBrowser(id: string): Promise<void> {
    this.logSuccess(`Shared as ${id}`);
    for (const destination of sharedConfigDestinations(id)) {
      this.log(destination);
    }

    if (!process.stdin.isTTY) return;

    const opened = await openUrl(editorConfigUrl(id));
    if (!opened.ok) this.warn(opened.error);
  }

  private async loadContextUnderSpinner(setupMarketplace?: string): Promise<EditContext> {
    return awaitUnderSpinner(STATUS_MESSAGES.LOADING_SKILLS, () =>
      this.loadContext(setupMarketplace),
    );
  }

  private async loadContext(setupMarketplace?: string): Promise<EditContext> {
    const detected = await detectProject();
    if (!detected) {
      this.error(ERROR_MESSAGES.NO_INSTALLATION, {
        exit: EXIT_CODES.ERROR,
      });
    }
    const { installation, config: projectConfig } = detected;

    // The installation's own root, which this run READS; writes go to `EditRoot.dir`.
    const projectDir = installation.projectDir;

    let sourceResult: SourceLoadResult;
    let startupMessages: StartupMessage[] = [];
    try {
      const loaded = await loadSource({
        projectDir,
        ...(setupMarketplace !== undefined && { sourceFlag: setupMarketplace }),
        captureStartupMessages: true,
      });
      sourceResult = loaded.sourceResult;
      startupMessages = loaded.startupMessages;

      const sourceInfo = sourceResult.isLocal ? "local" : sourceResult.sourceConfig.sourceOrigin;
      startupMessages.push({
        level: "info",
        text: `Loaded ${plural(Object.keys(matrix.skills).length, "skill")} (${sourceInfo})`,
      });
    } catch (error) {
      this.handleError(error);
    }

    let currentSkillIds: SkillId[];
    try {
      const discoveredSkills = await discoverAllPluginSkills(projectDir);
      const pluginSkillIds = typedKeys(discoveredSkills);

      // Config skills catch local and global-scoped plugin skills discoverAllPluginSkills misses.
      // Excluded entries stay out of the selection; installedSkillConfigs still carries them.
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
        text: `Found ${plural(currentSkillIds.length, "installed skill")}`,
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
      ...(setupMarketplace !== undefined &&
        sourceResult.marketplace !== undefined && { setupMarketplace: sourceResult.marketplace }),
    };
  }

  private async runEditWizard(
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<WizardResultV2 | null> {
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
        isEditingFromGlobalScope: editRoot.isGlobal,
        ...(context.setupMarketplace !== undefined && {
          setupMarketplace: context.setupMarketplace,
        }),
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
   * Records in the GLOBAL config the install-mode migrations this run already performed under
   * `$HOME`, and only their `origin`: `executeMigration` resolves paths from each skill's own
   * scope, so leaving the record alone would contradict the disk and the plugin registry. The
   * reachable case is a mode change on a `[P][G]` pair's project half, carried to global by `s`.
   * Runs before `writeConfigAndCompile`, through the gate so every other project is refreshed.
   */
  private async recordGlobalSourceMigrations(
    migratedSkillIds: Set<SkillId>,
    newSkills: SkillConfig[],
    editRoot: EditRoot,
    context: EditContext,
  ): Promise<void> {
    // The wizard write already covers the global config.
    if (editRoot.isGlobal) return;

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
          // config-gate/deps.ts declares `loadMatrix` async; the matrix is already in hand.
          // eslint-disable-next-line @typescript-eslint/require-await -- deps contract
          loadMatrix: async () => context.sourceResult.matrix,
          loadAgents: async () => (await loadAgentDefs()).agents,
        },
      );
      this.reportFanOut(report);
    } catch (error) {
      // The migration happened; only its record failed, so disk and global config now disagree.
      this.reportIncompleteWork(
        `Could not record global origin change: ${getErrorMessage(error)}`,
        INCOMPLETE_WORK_RECOVERY.INSPECT_INSTALLATION,
      );
    }
  }

  private logChangeSummary(
    changes: AppliedChanges,
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
      tuningChanges,
      reassignedAgents,
      rewrittenSkills,
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
    // A retune moves no file, so it needs its own line or the run reads as a no-op.
    for (const [agentName, change] of tuningChanges) {
      this.log(formatValueChangeLine(agentName, change, "agent"));
    }
    // Neither does a re-assignment.
    for (const agentName of reassignedAgents) {
      this.log(
        chalk.hex(CLI_COLORS.WARNING)(`  ~ ${agentName}`) +
          chalk.hex(CLI_COLORS.NEUTRAL)(" (agent: skills reassigned)"),
      );
    }
    for (const skillId of rewrittenSkills) {
      this.log(
        chalk.hex(CLI_COLORS.WARNING)(`  ~ ${getSkillDisplayName(skillId)}`) +
          chalk.hex(CLI_COLORS.NEUTRAL)(" (skill: files rewritten)"),
      );
    }
    this.log("");
  }

  private async applyMigrations(
    changes: ConfigChanges,
    filteredResult: WizardResultV2,
    activeOldSkills: SkillConfig[],
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<Set<SkillId>> {
    const migrationPlan = detectMigrations(
      withMaskedGlobalsRestored(activeOldSkills, changes.collapsedPairs),
      filteredResult.skills,
    );
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
      // `claude plugin install` needs the marketplace registered and current. Before
      // `executeMigration`, so an unresolvable marketplace exits with the ejected copies intact.
      await this.requireMarketplaceOrExit(
        context.sourceResult,
        "migrate skills to plugin mode",
        hostAt(editRoot.dir),
      );
      // `executeMigration` installs, deleting each working copy as its plugin registers, so the
      // banner is announced here.
      this.announcePluginInstall();
    }

    const migrationResult = await executeMigration(
      migrationPlan,
      editRoot.dir,
      context.sourceResult,
    );

    for (const warning of migrationResult.warnings) {
      this.warn(warning);
    }

    // Hard-errors before anything records `origin: "eject"` for a skill with no copy on disk.
    if (migrationPlan.toEject.length > 0) {
      this.reportEjectCopies(migrationResult.ejectCopies);
    }

    // Hard-errors before anything records a marketplace `origin` for an unregistered skill.
    if (migrationPlan.toPlugin.length > 0) {
      this.reportPluginInstalls(migrationResult.pluginInstalls);
    }

    return migratedSkillIds;
  }

  /**
   * Mirrors `BaseCommand.reportPluginInstalls` for the plugin→eject half. The count line names no
   * destination: copies split between the project and $HOME by each skill's scope.
   */
  private reportEjectCopies(result: EjectCopyResult): void {
    for (const item of result.failed) {
      this.warn(`Failed to copy ${item.id} for eject: ${item.error}`);
    }
    if (result.failed.length > 0) {
      this.error(ejectCopyFailureError(result.failed.length), { exit: EXIT_CODES.ERROR });
    }
    this.log(chalk.hex(CLI_COLORS.NEUTRAL)(localSkillsCopied(result.copied.length)));
  }

  private logModeSwitch(count: number, modeDescription: string): void {
    this.log(chalk.hex(CLI_COLORS.NEUTRAL)(`Switching ${count} skill(s) to ${modeDescription}`));
  }

  /**
   * A collapsed `[P][G]` pair is not a move: its project half is dropped or folded
   * ({@link applyCollapsedPairs}).
   */
  private async applyScopeChanges(
    changes: ConfigChanges,
    filteredResult: WizardResultV2,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<void> {
    const scopeChanges = scopeMovesOf(changes);

    for (const [skillId, change] of scopeChanges) {
      const skillConfig = filteredResult.skills.find((s) => s.id === skillId);
      if (skillConfig?.origin === EJECT_SOURCE) {
        await migrateLocalSkillScope(skillId, change.from, editRoot.dir);
      }
    }

    // Only resolve the marketplace when a plugin scope migration exists.
    const hasPluginScopeChanges = [...scopeChanges.keys()].some((skillId) => {
      const skillConfig = filteredResult.skills.find((s) => s.id === skillId);
      return skillConfig && skillConfig.origin !== EJECT_SOURCE;
    });
    if (!hasPluginScopeChanges) return;

    const marketplace = await this.requireMarketplaceOrExit(
      context.sourceResult,
      "migrate plugin skill scopes",
      hostAt(editRoot.dir),
    );

    const pluginScopeResult = await migratePluginSkillScopes(
      scopeChanges,
      filteredResult.skills,
      marketplace,
      editRoot.dir,
    );
    // A migration installs at the new scope, so unlike an uninstall a failure is not diagnostic:
    // the skill is registered at neither scope.
    for (const item of pluginScopeResult.failed) {
      this.reportIncompleteWork(
        `Failed to migrate plugin scope for ${item.id}: ${item.error}`,
        INCOMPLETE_WORK_RECOVERY.INSPECT_INSTALLATION,
      );
    }
  }

  /**
   * A Local half `s` folded into a Local global install moves there, replacing the global copy.
   * Every other half is removed at project scope only. The global install's mode is
   * {@link applyMigrations}' to change. The uninstall is diagnostic, as every one here is.
   */
  private async applyCollapsedPairs(
    changes: ConfigChanges,
    filteredResult: WizardResultV2,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<void> {
    const [foldedCopies, removedPairs] = partition(changes.collapsedPairs, (pair) =>
      foldsItsCopyIntoGlobal(pair, filteredResult.skills),
    );
    const [ejectedHalves, pluginHalves] = partition(
      removedPairs.map(({ projectHalf }) => projectHalf),
      (half) => half.origin === EJECT_SOURCE,
    );

    for (const { projectHalf } of foldedCopies) {
      await foldLocalSkillIntoGlobal(editRoot.dir, projectHalf.id);
    }
    for (const half of ejectedHalves) {
      await deleteLocalSkill(editRoot.dir, half.id, half.scope);
    }
    await this.uninstallProjectPluginHalves(
      pluginHalves,
      context.sourceResult.marketplace,
      editRoot,
    );
  }

  private async uninstallProjectPluginHalves(
    pluginHalves: SkillConfig[],
    marketplace: string | undefined,
    editRoot: EditRoot,
  ): Promise<void> {
    if (pluginHalves.length === 0) return;
    if (marketplace === undefined) {
      for (const half of pluginHalves) {
        this.warn(`Could not uninstall this project's plugin for ${half.id}: no marketplace`);
      }
      return;
    }

    const uninstallResult = await uninstallPluginSkills(
      pluginHalves.map((half) => half.id),
      pluginHalves,
      marketplace,
      editRoot.dir,
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

  private async applySourceChanges(
    changes: ConfigChanges,
    activeOldSkills: SkillConfig[],
    editRoot: EditRoot,
    migratedSkillIds: Set<SkillId>,
  ): Promise<void> {
    const { sourceChanges } = changes;

    // Non-migration source changes, e.g. marketplace A -> marketplace B.
    for (const [skillId, change] of sourceChanges) {
      if (migratedSkillIds.has(skillId)) {
        continue;
      }
      if (change.from === EJECT_SOURCE) {
        const oldSkill = activeOldSkills.find((s) => s.id === skillId);
        await deleteLocalSkill(editRoot.dir, skillId, oldSkill?.scope);
      }
    }
  }

  private async applyPluginChanges(
    changes: ConfigChanges,
    filteredResult: WizardResultV2,
    activeOldSkills: SkillConfig[],
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<void> {
    const { addedSkills, removedSkills } = changes;

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
      hostAt(editRoot.dir),
    );

    if (addedPluginSkills.length > 0) {
      await this.installPluginSkillsReported(
        addedPluginSkills,
        marketplace,
        editRoot.dir,
        context.sourceResult.matrix,
      );
    }

    if (removedPluginSkills.length > 0) {
      const uninstallResult = await uninstallPluginSkills(
        removedPluginSkills,
        activeOldSkills,
        marketplace,
        editRoot.dir,
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
    editRoot: EditRoot,
  ): Promise<void> {
    const { addedSkills } = changes;

    const addedLocalSkills = filteredResult.skills.filter(
      (s) => addedSkills.includes(s.id) && s.origin === EJECT_SOURCE,
    );

    if (addedLocalSkills.length > 0) {
      const copyResult = await copyLocalSkills(
        addedLocalSkills,
        editRoot.dir,
        context.sourceResult,
      );
      this.log(chalk.hex(CLI_COLORS.NEUTRAL)(localSkillsCopied(copyResult.totalCopied)));
    }
  }

  private async removeDeletedLocalSkills(
    changes: ConfigChanges,
    activeOldSkills: SkillConfig[],
    editRoot: EditRoot,
  ): Promise<void> {
    const { removedSkills } = changes;

    // A deselected eject skill is uninstalled at its scope; plugin removals and eject->marketplace
    // deletions belong to applyPluginChanges and applySourceChanges.
    for (const skillId of removedSkills) {
      const oldSkill = activeOldSkills.find((s) => s.id === skillId);
      if (oldSkill?.origin !== EJECT_SOURCE) continue;

      await deleteLocalSkill(editRoot.dir, skillId, oldSkill.scope);
    }
  }

  private async writeConfigAndCompile(
    result: WizardResultV2,
    context: EditContext,
    editRoot: EditRoot,
    authority: AuthoritativeScope,
    producer: EditSelection["producer"],
  ): Promise<void> {
    let agentDefsResult: AgentDefs;
    try {
      agentDefsResult = await loadAgentDefs();
    } catch (error) {
      this.handleError(error);
    }

    // A failed write is fatal: every mutation has landed and config.ts is their only record.
    let configResult: ConfigWriteResult;
    try {
      configResult = await writeProjectConfig({
        wizardResult: result,
        sourceResult: context.sourceResult,
        projectDir: editRoot.dir,
        agentDefs: agentDefsResult,
        authoritativeScope: authority,
      });
    } catch (error) {
      this.error(`Could not update config: ${getErrorMessage(error)}`, {
        exit: EXIT_CODES.ERROR,
      });
    }

    this.reportUnassignedSkills(configResult.config, result.skills);

    try {
      const agentScopeMap = activeAgentScopeMap(result.agentConfigs);
      const { allSkills } = await discoverInstalledSkills(editRoot.dir);
      const compile = compilesGlobalScope(producer, editRoot, configResult.propagation)
        ? compileAgentsAllScopes
        : compileProjectScope;
      const compilationResult = await compile({
        projectDir: editRoot.dir,
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
        // Off `failed`: `warnings` also carries non-failures.
        this.recordIncompleteWork(agentsNotCompiled(failed), INCOMPLETE_WORK_RECOVERY.RECOMPILE);
      } else if (compiled.length > 0) {
        this.log(chalk.hex(CLI_COLORS.NEUTRAL)(summary));
      } else {
        this.log(chalk.hex(CLI_COLORS.NEUTRAL)(INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE));
      }
    } catch (error) {
      // The config already landed; a failed recompile must not end in silence.
      this.reportIncompleteWork(
        `Agent recompilation failed: ${getErrorMessage(error)}`,
        INCOMPLETE_WORK_RECOVERY.RECOMPILE,
      );
      this.log(`You can manually recompile with '${CLI_INVOKE_COMMAND} compile'.`);
    }

    this.reportFanOut(configResult.propagation);
  }

  private async cleanupStaleAgentFiles(
    changes: ConfigChanges,
    oldAgents: AgentScopeConfig[],
    editRoot: EditRoot,
  ): Promise<void> {
    for (const removal of planStaleAgentRemovals(changes, oldAgents, editRoot.dir)) {
      const { failed } = await removeCompiledAgents(removal);

      // A compiled sub-agent left behind is still loaded by Claude Code.
      for (const { name, error } of failed) {
        const agentPath = path.join(removal.agentsDir, `${name}.md`);
        this.reportIncompleteWork(
          `Could not remove agent file ${agentPath}: ${error}`,
          INCOMPLETE_WORK_RECOVERY.DELETE_AGENT_FILE,
        );
      }
    }
  }

  /**
   * The host notices `init` and `compile` print ({@link hostCompileNotices}), after
   * {@link cleanupStaleAgentFiles} so a deleted file is not counted. Skipped on a run that owes
   * work, whose tree may not be readable.
   */
  private async reportWhatThisHostCannotCarry(editRoot: EditRoot): Promise<void> {
    if (this.hasIncompleteWork) return;

    for (const notice of await hostCompileNotices(providerInUse(editRoot.dir), editRoot.dir)) {
      this.log(notice);
    }
  }

  private logCompletionSummary(_changes: ConfigChanges): void {
    if (this.hasIncompleteWork) return;

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
  /** Dual-scope add/removes in `scopeChanges`, which the summary must not report as migrations. */
  dualScopeSkillTransitions: Set<SkillId>;
  /**
   * The `[P][G]` pairs this edit collapsed, as they stood before it. SPACE drops the project's own
   * install; `s` folds it into the global install. The config cannot tell them apart, so
   * `sourceChanges` and the mode migrations measure a collapsed skill against `maskedGlobal`.
   */
  collapsedPairs: CollapsedPair[];
  /** Agent equivalent of `dualScopeSkillTransitions`. */
  dualScopeAgentTransitions: Set<AgentName>;
  /** Retuned sub-agents (model, effort) with an unchanged roster: nothing moves, yet it changed. */
  tuningChanges: Map<AgentName, ValueChange>;
};

type ValueChange = { from: string; to: string };

/** A collapsed `[P][G]` pair, as the config held it before the edit. */
type CollapsedPair = {
  /** The project's own install: the half the collapse drops or folds. */
  projectHalf: SkillConfig;
  /** The global install the project half masked, as its tombstone recorded it. */
  maskedGlobal: SkillConfig;
  /** Whether `s` folded the half into the global install, rather than SPACE dropping it. */
  folded: boolean;
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
 * `fullEntries` carries the tombstone-inclusive lists, used only to tell a scope migration from a
 * dual-scope add/remove; without it every scope change is a migration.
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
  const dualScopeSkillTransitions = detectDualScopeTransitions(
    scopeChanges,
    fullEntries?.newSkills ?? [],
    fullEntries?.oldSkills ?? [],
    (s) => s.id,
  );
  const collapsedPairs = collapsedPairsOf(
    scopeChanges,
    dualScopeSkillTransitions,
    fullEntries?.oldSkills ?? [],
    wizardResult.foldedSkillIds ?? [],
  );

  return {
    addedSkills: difference(newSkillIds, oldSkillIds),
    removedSkills: difference(oldSkillIds, newSkillIds),
    addedAgents: difference(newAgentNames, oldAgentNames),
    removedAgents: difference(oldAgentNames, newAgentNames),
    sourceChanges: detectPropertyChanges(
      wizardResult.skills,
      indexBy(withMaskedGlobalsRestored(oldConfig?.skills ?? [], collapsedPairs), (s) => s.id),
      (s) => s.id,
      (s) => s.origin,
    ),
    scopeChanges,
    agentScopeChanges,
    dualScopeSkillTransitions,
    collapsedPairs,
    dualScopeAgentTransitions: detectDualScopeTransitions(
      agentScopeChanges,
      fullEntries?.newAgents ?? [],
      fullEntries?.oldAgents ?? [],
      (a) => a.name,
    ),
    tuningChanges: detectPropertyChanges(
      wizardResult.agentConfigs,
      oldAgentsByName,
      (a) => a.name,
      describeTuning,
    ),
  };
}

const RESTING_TUNING = "defaults";

/** Compared as a sentence, so the diff sees no change the summary has no words for. */
function describeTuning(agent: AgentScopeConfig): string {
  const settings = [
    agent.model === undefined ? undefined : `model ${agent.model}`,
    agent.codexModel === undefined ? undefined : `codex model ${agent.codexModel}`,
    agent.effort === undefined ? undefined : `effort ${agent.effort}`,
  ].filter((setting) => setting !== undefined);

  return settings.length === 0 ? RESTING_TUNING : settings.join(", ");
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
 * A dual-scope transition, not a migration, when a global tombstone sits beside the change: G→P
 * keeps one in the new state, P→G had one in the old.
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

/** P→G dual-scope transitions as the pairs they collapsed, read from the old state. */
function collapsedPairsOf(
  scopeChanges: Map<SkillId, ScopeChange>,
  dualScopeSkillTransitions: ReadonlySet<SkillId>,
  fullOldSkills: SkillConfig[],
  foldedSkillIds: readonly SkillId[],
): CollapsedPair[] {
  return [...scopeChanges]
    .filter(([id, change]) => change.to === "global" && dualScopeSkillTransitions.has(id))
    .map(([id]) => ({
      projectHalf: oldHalfOf(fullOldSkills, id, (skill) => isActiveAt(skill, "project")),
      maskedGlobal: oldHalfOf(fullOldSkills, id, isGlobalTombstone),
      folded: foldedSkillIds.includes(id),
    }));
}

/** `s` folded a Local half into a Local global entry; a fold into a plugin installs it instead. */
function foldsItsCopyIntoGlobal(pair: CollapsedPair, newSkills: SkillConfig[]): boolean {
  const { projectHalf, folded } = pair;
  const globalEntry = newSkills.find(
    (skill) => skill.id === projectHalf.id && isActiveAt(skill, "global"),
  );
  return folded && projectHalf.origin === EJECT_SOURCE && globalEntry?.origin === EJECT_SOURCE;
}

/** Present by construction, so a miss is a defect. */
function oldHalfOf(
  fullOldSkills: SkillConfig[],
  id: SkillId,
  isHalf: (skill: SkillConfig) => boolean,
): SkillConfig {
  const half = fullOldSkills.find((skill) => skill.id === id && isHalf(skill));
  if (half === undefined) {
    throw new Error(`The config before this edit holds no such half of the pair for '${id}'`);
  }
  return half;
}

/**
 * The pre-edit roster with each collapsed pair's project half replaced by the global install it
 * masked: the only install whose mode a collapse can change.
 */
function withMaskedGlobalsRestored(
  oldSkills: SkillConfig[],
  collapsedPairs: CollapsedPair[],
): SkillConfig[] {
  const maskedById = indexBy(
    collapsedPairs.map(({ maskedGlobal }) => maskedGlobal),
    (skill) => skill.id,
  );
  return oldSkills.map((skill) => {
    const masked = maskedById[skill.id];
    if (masked === undefined || skill.scope !== "project") return skill;
    return installRecordedBy(masked);
  });
}

function installRecordedBy(tombstone: SkillConfig): SkillConfig {
  const { excluded: _masked, ...install } = tombstone;
  return install;
}

/** Excludes collapsed pairs, whose global install stays where it is. */
function scopeMovesOf(changes: ConfigChanges): Map<SkillId, ScopeChange> {
  const collapsed = new Set(changes.collapsedPairs.map(({ projectHalf }) => projectHalf.id));
  return new Map([...changes.scopeChanges].filter(([id]) => !collapsed.has(id)));
}

type StaleAgent = { name: AgentName; scope: SkillScope };

const STALE_AGENT_SCOPES = ["project", "global"] as const satisfies readonly SkillScope[];

/** For a deselected agent absent from the old roster. */
const UNRECORDED_AGENT_SCOPE: SkillScope = "project";

function installedScope(name: AgentName, oldAgents: AgentScopeConfig[]): SkillScope {
  return oldAgents.find((agent) => agent.name === name)?.scope ?? UNRECORDED_AGENT_SCOPE;
}

/**
 * The project copy a P→G move superseded, plus every deselected agent at its installed scope. G→P
 * is an override, so the global install stays. Only scopes this edit removed from are tidied.
 */
function planStaleAgentRemovals(
  changes: ConfigChanges,
  oldAgents: AgentScopeConfig[],
  editRoot: string,
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
    agentsDir: resolveInstallPaths(editRoot, scope).agentsDir,
    agents: stale.filter((agent) => agent.scope === scope).map((agent) => agent.name),
  });

  return STALE_AGENT_SCOPES.map(removalAtScope).filter((removal) => removal.agents.length > 0);
}

function hasAnyChanges(changes: AppliedChanges): boolean {
  return (
    changes.reassignedAgents.length > 0 ||
    changes.rewrittenSkills.length > 0 ||
    changes.addedSkills.length > 0 ||
    changes.removedSkills.length > 0 ||
    changes.addedAgents.length > 0 ||
    changes.removedAgents.length > 0 ||
    changes.sourceChanges.size > 0 ||
    changes.scopeChanges.size > 0 ||
    changes.agentScopeChanges.size > 0 ||
    changes.tuningChanges.size > 0
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
  const host = hostAt(projectDir);
  const migrated: SkillId[] = [];
  const failed: PluginScopeMigrationResult["failed"] = [];

  for (const [skillId, change] of scopeChanges) {
    const skillConfig = skills.find((s) => s.id === skillId);
    if (!skillConfig || skillConfig.origin === EJECT_SOURCE) {
      continue;
    }

    const pluginRef = buildMarketplacePluginRef(skillId, marketplace);

    try {
      // global→project: keep the global registration, just add project scope.
      // The global plugin must remain for other projects.
      // project→global: uninstall the project-scope registration, install global.
      if (change.from === "project") {
        await host.uninstallPlugin(pluginRef, "project", projectDir);
      }
      await host.installPlugin(pluginRef, change.to, projectDir);
      migrated.push(skillId);
    } catch (error) {
      failed.push({ id: skillId, error: getErrorMessage(error) });
    }
  }

  return { migrated, failed };
}
