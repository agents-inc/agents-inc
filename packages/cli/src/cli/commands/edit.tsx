import os from "os";
import path from "path";

import chalk from "chalk";
import { Flags } from "@oclif/core";

import { difference, indexBy, partition, unique } from "remeda";

import { BaseCommand } from "../base-command.js";
import type { InstallSelection } from "@workspace/compile/seed-to-config";
import {
  CLI_INVOKE_COMMAND,
  CLI_COLORS,
  EDITOR_ADDRESS,
  EJECT_SOURCE,
  editorConfigUrl,
  formatSourceDisplayName,
  type Provider,
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
  type CompilationResult,
  discoverInstalledSkills,
  removeCompiledAgents,
  type RemoveCompiledAgentsOptions,
} from "../lib/operations/index.js";
import { awaitUnderSpinner } from "../components/common/spinner.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import {
  type EjectCopyResult,
  type Installation,
  type MigrationPlan,
  detectMigrations,
  ejectCopyFailureError,
  executeMigration,
  holdsItsOwnInstallation,
  isHomeDirectory,
  resolveInstallPaths,
  INSTALL_MODE_DESCRIPTIONS,
} from "../lib/installation/index.js";
import {
  movedGlobalAgentInputs,
  projectsAFanOutReaches,
  type GateReport,
} from "../lib/config-gate/index.js";
import {
  copyingBesideGlobalPlugins,
  installingBesideGlobalCopies,
  keepsGlobalInstall,
  type SkillMigration,
} from "../lib/installation/mode-migrator.js";
import {
  getSkillById,
  getSkillDisplayName,
  getSkillEntryDisplayName,
} from "../lib/matrix/matrix-provider";
import { type AuthoritativeScope, loadProjectConfig } from "../lib/configuration/index.js";
import {
  activeAgentScopeMap,
  isActiveAt,
  isGlobalTombstone,
} from "../lib/configuration/scope-predicates.js";
import { stoppingOnARefusal, type SourceLoadResult } from "../lib/loading/index.js";
import { buildMarketplacePluginRef } from "../lib/plugins/index.js";
import { deleteLocalSkill, migrateLocalSkillScope } from "../lib/skills/index.js";
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
  editorPayloadForInstallation,
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
import { seedToInstallSelection, type SeedMapping } from "../lib/seed/seed-to-selection.js";
import {
  installsAtHome,
  joinedStatement,
  notInstalledGlobally,
  readInstalledGlobal,
  reconcileSharedConfig,
  restoreInstalledGlobal,
  sameAssignments,
  type HeldGlobal,
  type InstalledGlobal,
  type KeptFromRoundTrip,
  type ReconciledSharedConfig,
  type UnassignedRow,
} from "../lib/seed/seed-apply.js";
import { Confirm } from "../components/common/confirm.js";
import { promptConfirm } from "../components/common/prompt-confirm.js";
import { summaryPanelBlock, type SummaryPanelProps } from "../components/common/summary-panel.js";
import { hostAt } from "../lib/hosts/host-for.js";
import { hostCompileNotices } from "../lib/hosts/host-compile-notices.js";
import { unofferablePlacementsFound } from "../lib/hosts/configured-placements.js";
import { chooseProviderForThisRun, providerInUse } from "../lib/installation/install-layout.js";
import {
  installationToName,
  providerFlag,
  providerNamedBy,
  refuseAnAmbiguousInstallation,
} from "../lib/installation/provider-flag.js";
import { initProviderToNameAt, providerToNameAt } from "../lib/installation/provider-to-name.js";
import { openUrl } from "../utils/open-url.js";
import { getErrorMessage } from "../utils/errors.js";
import { inertLine } from "../utils/string.js";
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
  editorSkillMetadataUnusableError,
  keptAsInstalledGlobally,
  keptUnassigned,
  localSkillsCopied,
  nothingInstalledToApplyTo,
  recompileSummary,
  registeredProjectsRecompiled,
  sharedConfigDestinations,
  sharedConfigNeedsTerminal,
  subAgentChanged,
  unplaceableKept,
} from "../utils/messages.js";
import {
  agentChangesAmong,
  formatScopeTag,
  type AgentChange,
} from "../lib/configuration/scope-diff.js";
import type { SeedPayload } from "@workspace/matrix/seed";

type ScopeChange = { from: SkillScope; to: SkillScope };

/** `edit` recompiles every scope it owns in one pass, so its summary has no scope word. */
const RECOMPILE_SUBJECT = "agent";

const CHANGE_MARKER_COLORS = {
  "+": CLI_COLORS.SUCCESS,
  "-": CLI_COLORS.ERROR,
  "~": CLI_COLORS.WARNING,
} as const;

type ChangeMarker = keyof typeof CHANGE_MARKER_COLORS;

const AGENT_DETAIL = " (agent)";

/** The marker and subject take the marker's colour; the detail after them is neutral. */
function changeLine(marker: ChangeMarker, subject: string, detail?: string): string {
  const head = chalk.hex(CHANGE_MARKER_COLORS[marker])(`  ${marker} ${subject}`);
  return detail === undefined ? head : head + chalk.hex(CLI_COLORS.NEUTRAL)(detail);
}

/** A `[P][G]` pair's project half toggled: an arrow line would claim the global install moved. */
function dualScopeTransitionLine(subject: string, to: SkillScope, detail?: string): string {
  return changeLine(to === "project" ? "+" : "-", `${subject} [P]`, detail);
}

/** A genuine `[G] → [P]` reads as an addition: the skill arrives in this project. */
function formatSkillScopeChangeLine(
  skillId: SkillId,
  change: ScopeChange,
  dualScopeSkillTransitions: ReadonlySet<SkillId>,
): string {
  const displayName = getSkillDisplayName(skillId);
  if (dualScopeSkillTransitions.has(skillId)) {
    return dualScopeTransitionLine(displayName, change.to);
  }

  const isGlobalToProject = change.from === "global" && change.to === "project";
  return changeLine(isGlobalToProject ? "+" : "~", displayName, scopeArrow(change));
}

/** Unlike a skill, a moved agent is always a move, and only the dual-scope arm says `(agent)`. */
function formatAgentScopeChangeLine(
  agentName: AgentName,
  change: ScopeChange,
  dualScopeAgentTransitions: ReadonlySet<AgentName>,
): string {
  if (dualScopeAgentTransitions.has(agentName)) {
    return dualScopeTransitionLine(agentName, change.to, AGENT_DETAIL);
  }

  return changeLine("~", agentName, scopeArrow(change));
}

function scopeArrow(change: ScopeChange): string {
  return ` (${formatScopeTag(change.from)} \u2192 ${formatScopeTag(change.to)})`;
}

/** Prints both values: a retune leaves nothing on disk to compare against. */
function formatValueChangeLine(subject: string, change: ValueChange, kind: string): string {
  return changeLine("~", subject, ` (${kind}: ${change.from} \u2192 ${change.to})`);
}

function sourceChangeLine(skillId: SkillId, change: ValueChange): string {
  const from = formatSourceDisplayName(change.from);
  const to = formatSourceDisplayName(change.to);
  return changeLine("~", getSkillDisplayName(skillId), ` (${from} \u2192 ${to})`);
}

/** Named by the entry it removes: its marketplace may no longer offer the skill. */
function removedSkillLine(skillId: SkillId, oldSkills: SkillConfig[]): string {
  const removed = installedEntryOf(skillId, oldSkills);
  return changeLine("-", `${getSkillEntryDisplayName(removed)} ${formatScopeTag(removed.scope)}`);
}

/** A removed id is drawn from these very entries, so a miss is a bug, never a skill to skip. */
function installedEntryOf(skillId: SkillId, oldSkills: SkillConfig[]): SkillConfig {
  const entry = oldSkills.find((s) => s.id === skillId);
  if (entry === undefined) throw new Error(`Removed skill '${skillId}' has no installed entry`);
  return entry;
}

/** Empty for an id the list does not hold. */
function scopeLabelOf(skillId: SkillId, skills: SkillConfig[]): string {
  const skill = skills.find((s) => s.id === skillId);
  return skill === undefined ? "" : ` ${formatScopeTag(skill.scope)}`;
}

/**
 * A retune, a re-assignment, rows joining a held global sub-agent and rewritten files move no
 * entry, so each needs its own line or the run reads as a no-op.
 */
function changeSummaryLines(
  changes: AppliedChanges,
  newSkills: SkillConfig[],
  oldSkills: SkillConfig[],
): string[] {
  const addedSkill = (id: SkillId): string =>
    changeLine("+", `${inertLine(getSkillById(id).displayName)}${scopeLabelOf(id, newSkills)}`);
  const joinedGlobalDetail = ` ${formatScopeTag("global")} (agent: skills added)`;

  return [
    ...changes.addedSkills.map(addedSkill),
    ...changes.removedSkills.map((id) => removedSkillLine(id, oldSkills)),
    ...changes.addedAgents.map((name) => changeLine("+", name, AGENT_DETAIL)),
    ...changes.removedAgents.map((name) => changeLine("-", name, AGENT_DETAIL)),
    ...[...changes.sourceChanges].map(([id, change]) => sourceChangeLine(id, change)),
    ...[...changes.scopeChanges].map(([id, change]) =>
      formatSkillScopeChangeLine(id, change, changes.dualScopeSkillTransitions),
    ),
    ...[...changes.agentScopeChanges].map(([name, change]) =>
      formatAgentScopeChangeLine(name, change, changes.dualScopeAgentTransitions),
    ),
    ...[...changes.tuningChanges].map(([name, change]) =>
      formatValueChangeLine(name, change, "agent"),
    ),
    ...changes.reassignedAgents.map((name) => changeLine("~", name, " (agent: skills reassigned)")),
    ...changes.joinedGlobalAgents.map((name) => changeLine("~", name, joinedGlobalDetail)),
    ...changes.rewrittenSkills.map((id) =>
      changeLine("~", getSkillDisplayName(id), " (skill: files rewritten)"),
    ),
  ];
}

type EditContext = {
  installation: Installation;
  projectConfig: ProjectConfig | null;
  sourceResult: SourceLoadResult;
  startupMessages: StartupMessage[];
};

/** The one directory an `edit` run acts on, decided once and handed to every layer. */
type EditRoot = {
  dir: string;
  isGlobal: boolean;
};

/**
 * The installation `detectProject` found is the only root with a config, so the only one this run
 * may write to.
 */
function resolveEditRoot(installation: Installation): EditRoot {
  const dir = installation.projectDir;
  return { dir, isGlobal: isHomeDirectory(dir) };
}

type EditSelection = {
  result: InstallSelection;
  /**
   * Statements naming what this run may not remove, and the held global sub-agents it adds to —
   * rendered in the confirm.
   */
  kept: string[];
  /** Skills the configuration carries rather than names, written once it is approved. */
  carried: ExternalSkillInstall[];
  /** From a project, the held global sub-agents an arriving skill's row joins. */
  joinedGlobalAgents: AgentName[];
  /** The global config itself, read from a project; `null` at home or with no global install. */
  installedGlobal: InstalledGlobal | null;
};

/**
 * What the question shows: the panel, a line for each sub-agent it marks `~`, and what the run
 * keeps or reaches beyond the panel.
 */
type SharedConfigPlan = {
  panel: SummaryPanelProps;
  changedAgents: AgentChange[];
  statements: string[];
};

/** Entries whose project copy an apply deletes. */
type ProjectCopies = { skillIds: SkillId[]; agentNames: AgentName[] };

/** A genuine move, not a collapsed pair: the copy goes from the project, the entry lives on. */
function movedToGlobal(changes: ConfigChanges): ProjectCopies {
  const skillMoves = [...scopeMovesOf(changes)].filter(([, change]) => change.to === "global");
  const agentMoves = [...changes.agentScopeChanges].filter(
    ([name, change]) => change.to === "global" && !changes.dualScopeAgentTransitions.has(name),
  );

  return {
    skillIds: skillMoves.map(([id]) => id),
    agentNames: agentMoves.map(([name]) => name),
  };
}

/**
 * Sub-agents that keep their slot and still change: retuned, their rows moved, or a held global one
 * a row joins. One that arrives or leaves is the panel's `+` or `-` already. From a project a
 * global one is measured against the global config: the project's holds none of its rows, and its
 * copy of the entry can be out of date.
 */
function changedSubAgents(
  changes: PlannedChanges,
  { result, installedGlobal }: EditSelection,
  projectConfig: ProjectConfig | null,
): AgentChange[] {
  if (projectConfig === null) return [];

  const arrivingOrLeaving = new Set<AgentName>([
    ...changes.addedAgents,
    ...changes.removedAgents,
    ...changes.agentScopeChanges.keys(),
  ]);
  const changed = unique([
    ...changes.reassignedAgents,
    ...changes.tuningChanges.keys(),
    ...changes.joinedGlobalAgents,
  ]).filter((name) => !arrivingOrLeaving.has(name));
  const after = { agents: result.agentConfigs, skills: result.skills, stack: result.assignedStack };
  if (installedGlobal === null) return agentChangesAmong(changed, projectConfig, after);

  const [heldGlobal, ownedHere] = partition(changed, (name) => isHeldGlobally(name, result));
  return [
    ...agentChangesAmong(ownedHere, projectConfig, after),
    ...agentChangesAmong(heldGlobal, installedGlobal, after).filter(changesAnything),
  ];
}

function isHeldGlobally(name: AgentName, result: InstallSelection): boolean {
  return result.agentConfigs.some((agent) => agent.name === name && isActiveAt(agent, "global"));
}

/** A held global sub-agent only gains: one the global config finds unchanged is as installed. */
function changesAnything({ gains, loses, settings }: AgentChange): boolean {
  return gains.length > 0 || loses.length > 0 || settings.length > 0;
}

/**
 * Written over in place, the user's own edits with them: carried skills whose files change, and
 * the ejected copies a switch to plugins deletes. One already named as moving is not named again.
 */
function overwrittenSkillIds(changes: AppliedChanges, active: ActiveEntries): SkillId[] {
  const leaving = new Set(movedToGlobal(changes).skillIds);
  const switched = ejectedCopiesSwitchedToPlugins(migrationPlanOf(changes, active));
  return unique([...changes.rewrittenSkills, ...switched]).filter((id) => !leaving.has(id));
}

/** A copy beside a global install it keeps is not deleted (`keepsGlobalInstall`). */
function ejectedCopiesSwitchedToPlugins(plan: MigrationPlan): SkillId[] {
  return plan.toPlugin.filter((migration) => !keepsGlobalInstall(migration)).map(({ id }) => id);
}

/** Measured against each collapsed pair's global install: the only one a collapse can switch. */
function migrationPlanOf(changes: ConfigChanges, active: ActiveEntries): MigrationPlan {
  return detectMigrations(
    withMaskedGlobalsRestored(active.oldSkills, changes.collapsedPairs),
    active.selection.skills,
  );
}

/** Only carried skills whose files would change: identical bytes written again change nothing. */
async function carriedThatChange(carried: ExternalSkillInstall[]): Promise<ExternalSkillInstall[]> {
  const changing = new Set(await carriedSkillsThatDiffer(carried));
  return carried.filter((skill) => changing.has(skill.id));
}

/** A carried skill new here is an addition, already counted; the rest are rewritten in place. */
function withRewrittenCarried(
  planned: PlannedChanges,
  carriedToWrite: ExternalSkillInstall[],
): AppliedChanges {
  const writtenIds = carriedToWrite.map((skill) => skill.id);
  return { ...planned, rewrittenSkills: difference(writtenIds, skillsNewHere(planned)) };
}

/**
 * From a project a shared configuration holds the global install as installed, so the global pass
 * runs only when the write added something global sub-agents derive from.
 */
function compilesGlobalScope(editRoot: EditRoot, written: GateReport): boolean {
  return editRoot.isGlobal || movedGlobalAgentInputs(written);
}

/**
 * Adds sub-agents whose skill rows change while the roster does not, which
 * {@link detectConfigChanges} cannot see.
 */
type ReassignedChanges = ConfigChanges & { reassignedAgents: AgentName[] };

/** Adds the held global sub-agents a project run adds rows to (`HeldGlobal.joined`). */
type PlannedChanges = ReassignedChanges & { joinedGlobalAgents: AgentName[] };

/** Adds carried skills already installed here whose files the apply rewrites. */
type AppliedChanges = PlannedChanges & { rewrittenSkills: SkillId[] };

/**
 * In a project only the project's own sub-agents count; a global one keeps its installed rows and
 * gains only an arriving skill's (`restoreInstalledGlobal`), which `HeldGlobal.joined` names. A
 * sub-agent already counted as added, or whose project copy arrives beside the global one, is not
 * counted twice.
 */
function withReassignments(
  changes: ConfigChanges,
  result: InstallSelection,
  installedStack: ProjectConfig["stack"],
  editRoot: EditRoot,
): ReassignedChanges {
  const { assignedStack } = result;
  const arrivingCopies = arrivingProjectHalves(
    changes.agentScopeChanges,
    changes.dualScopeAgentTransitions,
  );

  const ownedHere = (agent: AgentScopeConfig): boolean =>
    editRoot.isGlobal || isActiveAt(agent, "project");
  const countedAsAdded = (agent: AgentScopeConfig): boolean =>
    changes.addedAgents.includes(agent.name) || arrivingCopies.has(agent.name);
  const rowsMoved = (agent: AgentScopeConfig): boolean =>
    !sameAssignments(assignedStack[agent.name], installedStack?.[agent.name]);

  const reassigned = result.agentConfigs.filter(
    (agent) => ownedHere(agent) && !countedAsAdded(agent) && rowsMoved(agent),
  );
  return { ...changes, reassignedAgents: reassigned.map((agent) => agent.name) };
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

/** The run from home that changes what a project run keeps, where home would take it. */
type RunFromHome = { id: string | undefined; provider: Provider | undefined };

/** What the confirm says the run keeps, and the held global sub-agents it adds to. */
function keptOnApply(
  reconciled: ReconciledSharedConfig,
  held: HeldGlobal,
  revisedCarried: SkillId[],
  runFromHome: RunFromHome,
): string[] {
  return [
    ...keptStatements(reconciled.kept),
    ...unassignedStatement(reconciled.unassigned),
    ...joinedStatement(held),
    ...keptAsInstalledStatement(held, revisedCarried, runFromHome),
  ];
}

function keptAsInstalledStatement(
  held: HeldGlobal,
  revisedCarried: SkillId[],
  runFromHome: RunFromHome,
): string[] {
  const skillIds = [...held.keptAsInstalled.skillIds, ...revisedCarried];
  const { agentNames } = held.keptAsInstalled;
  if (skillIds.length === 0 && agentNames.length === 0) return [];
  return [keptAsInstalledGlobally(skillIds, agentNames, runFromHome.id, runFromHome.provider)];
}

/** From a project, a shared configuration only adds to the global install. */
function applyAuthority(editRoot: EditRoot): AuthoritativeScope {
  return editRoot.isGlobal ? "all" : "owned";
}

/** Both sides of the diff as installed: no excluded entry, and no global install left out. */
type ActiveEntries = {
  selection: InstallSelection;
  oldConfig: ProjectConfig | null;
  oldSkills: SkillConfig[];
  oldAgents: AgentScopeConfig[];
};

function activeEntriesOf(
  result: InstallSelection,
  projectConfig: ProjectConfig | null,
  installedGlobal: InstalledGlobal | null,
): ActiveEntries {
  const installedSkills = projectConfig?.skills ?? [];
  const oldSkills = [
    ...installedSkills.filter((s) => !s.excluded),
    ...globalInstallsHiddenHere(installedSkills, installedGlobal),
  ];
  const oldAgents = (projectConfig?.agents ?? []).filter((a) => !a.excluded);

  return {
    selection: {
      ...result,
      skills: result.skills.filter((s) => !s.excluded),
      agentConfigs: result.agentConfigs.filter((a) => !a.excluded),
    },
    oldConfig: projectConfig ? { ...projectConfig, skills: oldSkills, agents: oldAgents } : null,
    oldSkills,
    oldAgents,
  };
}

/**
 * Masked here by the project's own skill in a one-pick category, yet still installed, and held as
 * installed by the selection (`restoreInstalledGlobal`): left off the old side, it reads as added
 * on every run. A mask beside the project's own copy of the skill is a `[P][G]` pair instead.
 */
function globalInstallsHiddenHere(
  installedSkills: SkillConfig[],
  installedGlobal: InstalledGlobal | null,
): SkillConfig[] {
  if (installedGlobal === null) return [];

  const activeIds = new Set(installedSkills.filter((s) => !s.excluded).map((s) => s.id));
  const hiddenIds = new Set(
    installedSkills.filter((s) => isGlobalTombstone(s) && !activeIds.has(s.id)).map((s) => s.id),
  );
  return installedGlobal.skills.filter((s) => hiddenIds.has(s.id) && isActiveAt(s, "global"));
}

function planChanges(
  selection: EditSelection,
  active: ActiveEntries,
  projectConfig: ProjectConfig | null,
  editRoot: EditRoot,
): PlannedChanges {
  const keptInstalled = globalHalvesKeptInstalled(selection.installedGlobal);
  const changes = detectConfigChanges(active.oldConfig, active.selection, {
    newSkills: [...selection.result.skills, ...keptInstalled.skills],
    oldSkills: projectConfig?.skills ?? [],
    newAgents: [...selection.result.agentConfigs, ...keptInstalled.agents],
    oldAgents: projectConfig?.agents ?? [],
  });

  return {
    ...withReassignments(changes, active.selection, projectConfig?.stack, editRoot),
    joinedGlobalAgents: selection.joinedGlobalAgents,
  };
}

export default class Edit extends BaseCommand {
  static summary = "Open this installation in the editor, or apply a configuration with --from";
  static description = `Open this installation in ${EDITOR_ADDRESS}, or apply a configuration built there with --from`;

  static examples = [
    {
      description: "Open this installation in the editor",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Apply a configuration built in the editor, by its id",
      command: "<%= config.bin %> <%= command.id %> --from <id>",
    },
    {
      description: "Look at a shared configuration without applying it",
      command: "<%= config.bin %> <%= command.id %> --ui --from <id>",
    },
  ];

  static flags = {
    ui: Flags.boolean({
      description: `Open ${EDITOR_ADDRESS} on this installation, or on the id --from names without applying it — what a bare edit does`,
      default: false,
    }),
    from: Flags.string({
      description:
        "Apply a configuration shared from agentsinc.sh by its id, removing whatever it leaves out — from a project, only the project's own entries",
      helpValue: "<id>",
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
    const namedProvider = providerNamedBy(flags.provider);

    // Above every installation check: opening a shared id needs no local state.
    if (flags.ui && flags.from !== undefined) {
      return this.openSharedInEditor(flags.from, cwd, namedProvider);
    }

    // Before anything is copied or installed.
    await refuseAnAmbiguousInstallation(cwd, "edit", namedProvider, (message) =>
      this.error(message, { exit: EXIT_CODES.INVALID_ARGS }),
    );

    // Before anything renders: an unreadable config is recreated, not edited.
    await this.ensureConfigReadable(cwd);
    await this.refuseUnofferablePlacements(cwd);

    // A bare `edit` is `edit --ui`, and needs no source load.
    if (flags.from === undefined) return this.openInEditor(cwd);

    return this.applySharedConfig(flags.from, namedProvider);
  }

  private async applySharedConfig(id: string, namedProvider: Provider | undefined): Promise<void> {
    const payload = await this.fetchSharedConfigOrFail(id, namedProvider);
    const context = await this.loadContextUnderSpinner();
    const editRoot = resolveEditRoot(context.installation);

    // A skill whose metadata.yaml no longer describes it would be dropped from config.ts.
    await this.ensureSavedSkillsReadable(
      context.projectConfig?.skills ?? [],
      context.sourceResult.matrix,
      editRoot.dir,
    );

    const selection = await this.selectionFromSharedConfig(id, payload, context, editRoot);
    this.reportValidationErrors(selection.result.validation);

    const active = activeEntriesOf(
      selection.result,
      context.projectConfig,
      selection.installedGlobal,
    );
    const planned = planChanges(selection, active, context.projectConfig, editRoot);
    // Before asking: a rewrite is named in the plan, and a run that changes nothing asks nothing.
    const carriedToWrite = await carriedThatChange(selection.carried);
    const changes = withRewrittenCarried(planned, carriedToWrite);

    if (!hasAnyChanges(changes)) return this.sayNothingChanged(selection.kept);

    this.refuseWithoutATerminal(id, namedProvider, editRoot);
    const plan = await this.planToConfirm(changes, active, selection, context, editRoot);
    await this.confirmSharedConfigOrCancel(plan);
    await this.writeCarriedSkills(carriedToWrite);
    await this.applyApprovedChanges(changes, active, selection.result, context, editRoot);
  }

  private async applyApprovedChanges(
    changes: AppliedChanges,
    active: ActiveEntries,
    result: InstallSelection,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<void> {
    const { selection: activeSelection, oldSkills, oldAgents } = active;
    this.logChangeSummary(changes, activeSelection.skills, oldSkills);
    const migrationPlan = migrationPlanOf(changes, active);
    await this.applyMigrations(migrationPlan, context, editRoot);
    await this.applyScopeChanges(migrationPlan.scopeChanges, context, editRoot);
    await this.applyCollapsedPairs(changes, context, editRoot);
    await this.applyPluginChanges(changes, activeSelection, oldSkills, context, editRoot);
    await this.copyNewLocalSkills(changes, activeSelection, context, editRoot);
    await this.removeDeletedLocalSkills(changes, oldSkills, editRoot);
    // Unfiltered: the config records the excluded entries too.
    await this.writeConfigAndCompile(result, context, editRoot);
    await this.cleanupStaleAgentFiles(changes, oldAgents, editRoot);
    await this.reportWhatThisHostCannotCarry(editRoot);
    this.logCompletionSummary();
  }

  /**
   * A shared configuration applies destructively, except for a skill written here (`forkedFrom`)
   * and an id this catalogue cannot place — both disclosed in the confirm. From a project the
   * global install is only added to.
   */
  private async selectionFromSharedConfig(
    id: string,
    payload: SeedPayload,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<EditSelection> {
    const { matrix: sourceMatrix } = context.sourceResult;
    // Before the decode: a carried skill answers to no catalogue until it is seated.
    const carried = this.registerExternalSkillsOrFail(payload, sourceMatrix, editRoot.dir);
    const mapping = this.decodeSeedOrFail(payload, sourceMatrix);
    const { result } = mapping;

    // Before any skip is narrated; `init --from` asks the same at the same point.
    this.refuseProjectScopedContentAtHome(result, editRoot.dir, true);

    const reconciled = await this.reconcileWithInstallation(mapping, context, editRoot);
    const installedGlobal = editRoot.isGlobal ? null : await readInstalledGlobal(editRoot.dir);
    const held = restoreInstalledGlobal(reconciled.result, installedGlobal);
    const arrivingCarried = notInstalledGlobally(carried, held);

    await this.refuseSharedConfigBeforeAsking(
      held.result,
      arrivingCarried,
      editRoot.dir,
      context.sourceResult,
    );

    // Held globally, so not written from a project; named in the plan instead.
    const revisedGlobally = await carriedSkillsThatDiffer(difference(carried, arrivingCarried));

    sayCapturedWarnings(context.startupMessages);
    this.warnOfSkippedEntries(mapping);

    const runFromHome = {
      id: installsAtHome(result) ? id : undefined,
      provider: providerToNameAt(os.homedir(), providerInUse(editRoot.dir)),
    };

    return {
      result: held.result,
      kept: keptOnApply(reconciled, held, revisedGlobally, runFromHome),
      carried: arrivingCarried,
      joinedGlobalAgents: held.joined.map(({ agentName }) => agentName),
      installedGlobal,
    };
  }

  /** Ids the decode could not place stay: a catalogue limit is not an instruction to delete. */
  private async reconcileWithInstallation(
    { result, skippedSkillIds }: SeedMapping,
    { projectConfig }: EditContext,
    editRoot: EditRoot,
  ): Promise<ReconciledSharedConfig> {
    return reconcileSharedConfig({
      decoded: result,
      installed: projectConfig,
      authoredHere: await this.readAuthoredHere(projectConfig, editRoot.dir),
      unplaceable: new Set(skippedSkillIds),
    });
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

  /** Refuses an empty directory before spending a round trip. */
  private async fetchSharedConfigOrFail(
    id: string,
    namedProvider: Provider | undefined,
  ): Promise<SeedPayload> {
    if (!(await detectProject())) {
      this.error(nothingInstalledToApplyTo(id, namedProvider), { exit: EXIT_CODES.ERROR });
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
      return seedToInstallSelection(payload, sourceMatrix);
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

  private async writeCarriedSkills(carried: ExternalSkillInstall[]): Promise<void> {
    if (carried.length === 0) return;

    await writeExternalSkills(carried);
    this.log(carriedSkillsWritten(carried.map((skill) => skill.id)));
  }

  /**
   * A destructive apply nobody can confirm must never become a yes. Asked only of a run that changes
   * something: one that changes nothing needs no one to confirm it.
   */
  private refuseWithoutATerminal(
    id: string,
    namedProvider: Provider | undefined,
    editRoot: EditRoot,
  ): void {
    if (process.stdin.isTTY) return;

    const initProvider =
      namedProvider ?? initProviderToNameAt(editRoot.dir, providerInUse(editRoot.dir));
    this.error(sharedConfigNeedsTerminal(id, namedProvider, initProvider), {
      exit: EXIT_CODES.ERROR,
    });
  }

  /** The panel of what the run changes, then what it keeps and what else it recompiles. */
  private async planToConfirm(
    changes: AppliedChanges,
    active: ActiveEntries,
    selection: EditSelection,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<SharedConfigPlan> {
    const { projectConfig } = context;
    const changedAgents = changedSubAgents(changes, selection, projectConfig);
    const reachedProjects = await this.registeredProjectsStatement(changes, context, editRoot);

    return {
      panel: {
        skillConfigs: selection.result.skills,
        agentConfigs: selection.result.agentConfigs,
        installedSkillConfigs: projectConfig?.skills ?? null,
        installedAgentConfigs: projectConfig?.agents ?? null,
        isInitMode: false,
        overwrittenSkillIds: new Set(overwrittenSkillIds(changes, active)),
        changedAgentNames: new Set(changedAgents.map(({ name }) => name)),
        stackName: await this.stackNameOf(selection.result.selectedStackId, context.sourceResult),
      },
      changedAgents,
      statements: [...selection.kept, ...reachedProjects],
    };
  }

  /** Nothing to confirm; what the run keeps still says why nothing changed. */
  private sayNothingChanged(kept: string[]): void {
    for (const statement of kept) {
      this.log(statement);
    }
    this.log(chalk.hex(CLI_COLORS.NEUTRAL)(INFO_MESSAGES.NO_CHANGES_MADE));
  }

  /**
   * At home every registered project inlines the global config, so a change to it rewrites each
   * one the fan-out reaches. Rewritten carried files alone leave the config as it was.
   */
  private async registeredProjectsStatement(
    changes: AppliedChanges,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<string[]> {
    if (!editRoot.isGlobal || !changesTheConfig(changes)) return [];

    const reached = await projectsAFanOutReaches(
      context.projectConfig?.projects ?? [],
      providerInUse(editRoot.dir),
    );
    return reached.length === 0 ? [] : [registeredProjectsRecompiled(reached)];
  }

  private async confirmSharedConfigOrCancel(plan: SharedConfigPlan): Promise<void> {
    const lines = summaryPanelBlock(
      plan.panel,
      plan.changedAgents.map(subAgentChanged),
      plan.statements,
    );
    for (const line of lines) {
      this.log(line);
    }

    const outcome = await promptConfirm(({ onConfirm, onCancel }) => (
      <Confirm message={SHARED_CONFIG_APPLY.CONFIRM} onConfirm={onConfirm} onCancel={onCancel} />
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

  /** Mints what `share` mints, marked when made in a project. Touches nothing on disk. */
  private async openInEditor(projectDir: string): Promise<void> {
    await this.ensureInstalledSkillsReadable(projectDir);

    const prepared = await editorPayloadForInstallation(projectDir);
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
   * The payload reads every ejected skill's metadata.yaml for its provenance, and no catalogue is
   * loaded here to resolve a skill around it, so every installed entry is asked about — not only
   * those a catalogue lacks, as `edit --from` asks. The config read is the one the payload reads.
   */
  private async ensureInstalledSkillsReadable(projectDir: string): Promise<void> {
    const loaded = await loadProjectConfig(projectDir);
    // Nothing installed is `editorPayloadForInstallation`'s to report.
    if (!loaded) return;

    await this.refuseUnusableSavedSkillMetadata(
      loaded.config.skills,
      projectDir,
      editorSkillMetadataUnusableError,
    );
  }

  /**
   * Opens an id rather than applying it; `--from` without `--ui` is the destructive apply. A named
   * provider is committed first, as `init` does, so "installed here" means that installation.
   */
  private async openSharedInEditor(
    id: string,
    cwd: string,
    namedProvider: Provider | undefined,
  ): Promise<void> {
    if (namedProvider !== undefined) chooseProviderForThisRun(namedProvider);
    const url = editorConfigUrl(id);
    const installedHere = await holdsItsOwnInstallation(cwd);
    const provider = installedHere ? await installationToName(cwd, namedProvider) : namedProvider;

    this.log(`Open it at ${url}`);
    this.log(applySharedConfigHere(id, installedHere, provider));

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

  private async loadContextUnderSpinner(): Promise<EditContext> {
    return awaitUnderSpinner(STATUS_MESSAGES.LOADING_SKILLS, () => this.loadContext());
  }

  private async loadContext(): Promise<EditContext> {
    const detected = await detectProject();
    if (!detected) {
      this.error(ERROR_MESSAGES.NO_INSTALLATION, {
        exit: EXIT_CODES.ERROR,
      });
    }
    const { installation, config: projectConfig } = detected;

    try {
      const { sourceResult, startupMessages } = await stoppingOnARefusal(() =>
        loadSource({ projectDir: installation.projectDir, captureStartupMessages: true }),
      );
      return { installation, projectConfig, sourceResult, startupMessages };
    } catch (error) {
      this.handleError(error);
    }
  }

  private logChangeSummary(
    changes: AppliedChanges,
    newSkills: SkillConfig[],
    oldSkills: SkillConfig[],
  ): void {
    this.log(`\n${chalk.hex(CLI_COLORS.WHITE).bold("Changes:")}`);
    for (const line of changeSummaryLines(changes, newSkills, oldSkills)) {
      this.log(line);
    }
    this.log("");
  }

  private async applyMigrations(
    migrationPlan: MigrationPlan,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<void> {
    if (migrationPlan.toEject.length === 0 && migrationPlan.toPlugin.length === 0) return;

    this.announceMigrations(migrationPlan);
    if (migrationPlan.toPlugin.length > 0) {
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

  /**
   * One line per kind, each counting its own: a mode switch, then a skill added in the project
   * beside the global install it keeps (`keepsGlobalInstall` decides both the keep and the line).
   */
  private announceMigrations(plan: MigrationPlan): void {
    const [copiesBesideGlobalPlugin, switchesToEject] = partition(plan.toEject, keepsGlobalInstall);
    const [installsBesideGlobalCopy, switchesToPlugin] = partition(
      plan.toPlugin,
      keepsGlobalInstall,
    );

    if (switchesToEject.length > 0) {
      this.logModeSwitch(switchesToEject.length, INSTALL_MODE_DESCRIPTIONS.eject);
    }
    if (copiesBesideGlobalPlugin.length > 0) {
      this.logCopiesBesideGlobalPlugins(copiesBesideGlobalPlugin.length);
    }
    if (switchesToPlugin.length > 0) {
      this.logModeSwitch(switchesToPlugin.length, INSTALL_MODE_DESCRIPTIONS.plugin);
    }
    if (installsBesideGlobalCopy.length > 0) {
      this.logInstallsBesideGlobalCopies(installsBesideGlobalCopy.length);
    }
  }

  private logModeSwitch(count: number, modeDescription: string): void {
    this.log(chalk.hex(CLI_COLORS.NEUTRAL)(`Switching ${count} skill(s) to ${modeDescription}`));
  }

  private logCopiesBesideGlobalPlugins(count: number): void {
    this.log(chalk.hex(CLI_COLORS.NEUTRAL)(copyingBesideGlobalPlugins(count)));
  }

  private logInstallsBesideGlobalCopies(count: number): void {
    this.log(chalk.hex(CLI_COLORS.NEUTRAL)(installingBesideGlobalCopies(count)));
  }

  /**
   * Only moves that keep their mode: a switch lands at its new scope ({@link applyMigrations}). A
   * collapsed `[P][G]` pair is not a move: its project half is dropped ({@link applyCollapsedPairs}).
   */
  private async applyScopeChanges(
    scopeMoves: SkillMigration[],
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<void> {
    const [copyMoves, pluginMoves] = partition(
      scopeMoves,
      (move) => move.newSource === EJECT_SOURCE,
    );
    await moveEjectedSkillCopies(copyMoves, editRoot.dir);

    if (pluginMoves.length === 0) return;

    const marketplace = await this.requireMarketplaceOrExit(
      context.sourceResult,
      "migrate plugin skill scopes",
      hostAt(editRoot.dir),
    );

    const pluginScopeResult = await migratePluginSkillScopes(
      pluginMoves,
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
   * Each project half is removed at project scope only. The global install's mode is
   * {@link applyMigrations}' to change. The uninstall is diagnostic, as every one here is.
   */
  private async applyCollapsedPairs(
    changes: ConfigChanges,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<void> {
    const [ejectedHalves, pluginHalves] = partition(
      changes.collapsedPairs.map(({ projectHalf }) => projectHalf),
      (half) => half.origin === EJECT_SOURCE,
    );

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

    await this.uninstallPluginSkillsReported(
      pluginHalves.map((half) => half.id),
      pluginHalves,
      marketplace,
      editRoot.dir,
    );
  }

  private async uninstallPluginSkillsReported(
    skillIds: SkillId[],
    oldSkills: SkillConfig[],
    marketplace: string,
    projectDir: string,
  ): Promise<void> {
    const { uninstalled, failed } = await uninstallPluginSkills(
      skillIds,
      oldSkills,
      marketplace,
      projectDir,
    );
    if (uninstalled.length > 0) {
      this.log(chalk.hex(CLI_COLORS.NEUTRAL)(`Removed ${uninstalled.length} plugin(s)`));
    }
    for (const item of failed) {
      this.warn(`Failed to uninstall plugin ${item.id}: ${item.error}`);
    }
  }

  private async applyPluginChanges(
    changes: ConfigChanges,
    filteredResult: InstallSelection,
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
      await this.uninstallPluginSkillsReported(
        removedPluginSkills,
        activeOldSkills,
        marketplace,
        editRoot.dir,
      );
    }
  }

  private async copyNewLocalSkills(
    changes: ConfigChanges,
    filteredResult: InstallSelection,
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

    // A deselected eject skill is uninstalled at its scope; plugin removals belong to
    // applyPluginChanges.
    for (const skillId of removedSkills) {
      const oldSkill = activeOldSkills.find((s) => s.id === skillId);
      if (oldSkill?.origin !== EJECT_SOURCE) continue;

      await deleteLocalSkill(editRoot.dir, skillId, oldSkill.scope);
    }
  }

  private async writeConfigAndCompile(
    result: InstallSelection,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<void> {
    const agentDefs = await this.loadAgentDefsOrFail();
    const configResult = await this.writeConfigOrFail(result, context, editRoot, agentDefs);
    this.reportUnassignedSkills(configResult.config, result.skills);
    await this.recompileAgents(result, editRoot, configResult.propagation, agentDefs.sourcePath);
    this.reportFanOut(configResult.propagation);
  }

  private async loadAgentDefsOrFail(): Promise<AgentDefs> {
    try {
      return await loadAgentDefs();
    } catch (error) {
      this.handleError(error);
    }
  }

  /** Fatal: every mutation has landed and config.ts is their only record. */
  private async writeConfigOrFail(
    result: InstallSelection,
    context: EditContext,
    editRoot: EditRoot,
    agentDefs: AgentDefs,
  ): Promise<ConfigWriteResult> {
    try {
      return await writeProjectConfig({
        selection: result,
        sourceResult: context.sourceResult,
        projectDir: editRoot.dir,
        agentDefs,
        authoritativeScope: applyAuthority(editRoot),
      });
    } catch (error) {
      this.error(`Could not update config: ${getErrorMessage(error)}`, {
        exit: EXIT_CODES.ERROR,
      });
    }
  }

  private async recompileAgents(
    result: InstallSelection,
    editRoot: EditRoot,
    propagation: GateReport,
    sourcePath: string,
  ): Promise<void> {
    try {
      const agentScopeMap = activeAgentScopeMap(result.agentConfigs);
      const { allSkills } = await discoverInstalledSkills(editRoot.dir);
      const compile = compilesGlobalScope(editRoot, propagation)
        ? compileAgentsAllScopes
        : compileProjectScope;
      const compilation = await compile({
        projectDir: editRoot.dir,
        sourcePath,
        skills: allSkills,
        agentScopeMap,
      });
      this.reportRecompile(compilation);
    } catch (error) {
      // The config already landed; a failed recompile must not end in silence.
      this.reportIncompleteWork(
        `Agent recompilation failed: ${getErrorMessage(error)}`,
        INCOMPLETE_WORK_RECOVERY.RECOMPILE,
      );
      this.log(`You can manually recompile with '${CLI_INVOKE_COMMAND} compile'.`);
    }
  }

  private reportRecompile({ compiled, rewritten, failed, warnings }: CompilationResult): void {
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

  private logCompletionSummary(): void {
    if (this.hasIncompleteWork) return;

    this.log(`\n${chalk.hex(CLI_COLORS.SUCCESS)("\u2713 Done")}\n`);
  }
}

type ConfigChanges = {
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
   * The `[P][G]` pairs this edit collapsed, as they stood before it. The project's own install is
   * dropped, so `sourceChanges` and the mode migrations measure a collapsed skill against
   * `maskedGlobal`.
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
  /** The project's own install: the half the collapse drops. */
  projectHalf: SkillConfig;
  /** The global install the project half masked, as its tombstone recorded it. */
  maskedGlobal: SkillConfig;
};

/** Full (tombstone-inclusive) entry lists used to classify dual-scope transitions. */
type FullScopeEntries = {
  newSkills: SkillConfig[];
  oldSkills: SkillConfig[];
  newAgents: AgentScopeConfig[];
  oldAgents: AgentScopeConfig[];
};

/**
 * `fullEntries` carries the tombstone-inclusive lists, used only to tell a scope migration from a
 * dual-scope add/remove.
 */
function detectConfigChanges(
  oldConfig: ProjectConfig | null,
  selection: InstallSelection,
  fullEntries: FullScopeEntries,
): ConfigChanges {
  const oldSkillIds = oldConfig?.skills.map((s) => s.id) ?? [];
  const newSkillIds = selection.skills.map((s) => s.id);
  const oldAgentNames = oldConfig?.agents.map((a) => a.name) ?? [];
  const newAgentNames = selection.agentConfigs.map((a) => a.name);

  const oldSkillsById = indexBy(oldConfig?.skills ?? [], (s) => s.id);
  const oldAgentsByName = indexBy(oldConfig?.agents ?? [], (a) => a.name);

  const scopeChanges = detectPropertyChanges(
    selection.skills,
    oldSkillsById,
    (s) => s.id,
    (s) => s.scope,
  );
  const agentScopeChanges = detectPropertyChanges(
    selection.agentConfigs,
    oldAgentsByName,
    (a) => a.name,
    (a) => a.scope,
  );
  const dualScopeSkillTransitions = detectDualScopeTransitions(
    scopeChanges,
    fullEntries.newSkills,
    fullEntries.oldSkills,
    (s) => s.id,
  );
  const collapsedPairs = collapsedPairsOf(
    scopeChanges,
    dualScopeSkillTransitions,
    fullEntries.oldSkills,
  );
  const dualScopeAgentTransitions = detectDualScopeTransitions(
    agentScopeChanges,
    fullEntries.newAgents,
    fullEntries.oldAgents,
    (a) => a.name,
  );
  const arrivingSkills = arrivingProjectHalves(scopeChanges, dualScopeSkillTransitions);

  return {
    addedSkills: difference(newSkillIds, oldSkillIds),
    removedSkills: difference(oldSkillIds, newSkillIds),
    addedAgents: difference(newAgentNames, oldAgentNames),
    removedAgents: difference(oldAgentNames, newAgentNames),
    sourceChanges: withoutKeys(
      detectPropertyChanges(
        selection.skills,
        indexBy(withMaskedGlobalsRestored(oldConfig?.skills ?? [], collapsedPairs), (s) => s.id),
        (s) => s.id,
        (s) => s.origin,
      ),
      arrivingSkills,
    ),
    scopeChanges,
    agentScopeChanges,
    dualScopeSkillTransitions,
    collapsedPairs,
    dualScopeAgentTransitions,
    // Either half of a pair is measured against the other install, which this edit never retunes.
    tuningChanges: withoutKeys(
      detectPropertyChanges(selection.agentConfigs, oldAgentsByName, (a) => a.name, describeTuning),
      dualScopeAgentTransitions,
    ),
  };
}

/** Added, or a project copy arriving beside the global install: files written, not rewritten. */
function skillsNewHere(changes: ConfigChanges): SkillId[] {
  return [
    ...changes.addedSkills,
    ...arrivingProjectHalves(changes.scopeChanges, changes.dualScopeSkillTransitions),
  ];
}

/**
 * The `[P][G]` pairs this edit opens: the project's own copy arrives beside the global install,
 * so the diff, which measures it against that install, records a change nothing made.
 */
function arrivingProjectHalves<K extends string>(
  scopeChanges: ReadonlyMap<K, ScopeChange>,
  dualScopeTransitions: ReadonlySet<K>,
): Set<K> {
  const arriving = [...scopeChanges].filter(
    ([key, change]) => change.to === "project" && dualScopeTransitions.has(key),
  );
  return new Set(arriving.map(([key]) => key));
}

function withoutKeys<K, V>(changes: ReadonlyMap<K, V>, keys: ReadonlySet<K>): Map<K, V> {
  return new Map([...changes].filter(([key]) => !keys.has(key)));
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
 * The global install's entries as the tombstones a project half arriving beside one leaves: the
 * write masks the global entry rather than moving it (`reconcileProjectSplitAgainstGlobal`). No
 * decoded selection carries these, so without them a project add over a global install reads as
 * the global install moving. Only a key that moves from global to project is looked up in them.
 */
function globalHalvesKeptInstalled(installedGlobal: InstalledGlobal | null): {
  skills: SkillConfig[];
  agents: AgentScopeConfig[];
} {
  if (installedGlobal === null) return { skills: [], agents: [] };

  return {
    skills: installedGlobal.skills.map(asTombstone),
    agents: installedGlobal.agents.map(asTombstone),
  };
}

function asTombstone<T extends { excluded?: boolean }>(entry: T): T {
  return { ...entry, excluded: true };
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
    items.some((item) => getKey(item) === key && isGlobalTombstone(item));
  const isDualScope = ([key, { from, to }]: [K, ScopeChange]): boolean =>
    (from === "global" && to === "project" && hasGlobalTombstone(fullNew, key)) ||
    (from === "project" && to === "global" && hasGlobalTombstone(fullOld, key));

  return new Set([...scopeChanges].filter(isDualScope).map(([key]) => key));
}

/** P→G dual-scope transitions as the pairs they collapsed, read from the old state. */
function collapsedPairsOf(
  scopeChanges: Map<SkillId, ScopeChange>,
  dualScopeSkillTransitions: ReadonlySet<SkillId>,
  fullOldSkills: SkillConfig[],
): CollapsedPair[] {
  return [...scopeChanges]
    .filter(([id, change]) => change.to === "global" && dualScopeSkillTransitions.has(id))
    .map(([id]) => ({
      projectHalf: oldHalfOf(fullOldSkills, id, (skill) => isActiveAt(skill, "project")),
      maskedGlobal: oldHalfOf(fullOldSkills, id, isGlobalTombstone),
    }));
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

async function moveEjectedSkillCopies(
  copyMoves: SkillMigration[],
  projectDir: string,
): Promise<void> {
  for (const move of copyMoves) {
    await migrateLocalSkillScope(move.id, move.oldScope, projectDir);
  }
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
  return changes.rewrittenSkills.length > 0 || changesTheConfig(changes);
}

/** Every change but rewritten carried files, which leave config.ts as it was. */
function changesTheConfig(changes: PlannedChanges): boolean {
  return (
    changes.reassignedAgents.length > 0 ||
    changes.joinedGlobalAgents.length > 0 ||
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

type PluginScopeMigrationResult = {
  failed: Array<{ id: SkillId; error: string }>;
};

async function migratePluginSkillScopes(
  pluginMoves: SkillMigration[],
  marketplace: string,
  projectDir: string,
): Promise<PluginScopeMigrationResult> {
  const host = hostAt(projectDir);
  const failed: PluginScopeMigrationResult["failed"] = [];

  for (const move of pluginMoves) {
    const pluginRef = buildMarketplacePluginRef(move.id, marketplace);

    try {
      // global→project keeps the global registration, which other projects still use.
      if (move.oldScope === "project") {
        await host.uninstallPlugin(pluginRef, "project", projectDir);
      }
      await host.installPlugin(pluginRef, move.newScope, projectDir);
    } catch (error) {
      failed.push({ id: move.id, error: getErrorMessage(error) });
    }
  }

  return { failed };
}
