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

/** A scope transition (`from` → `to`) for a re-scoped skill or agent. */
type ScopeChange = { from: SkillScope; to: SkillScope };

/**
 * The noun `edit`'s recompile summary counts in, singular as `recompileSummary` takes it. `edit`
 * recompiles every scope this context owns in one pass, so it has no scope word to qualify with —
 * `compile`, which runs one scope at a time, does.
 */
const RECOMPILE_SUBJECT = "agent";

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
 * A `~ subject (kind: before \u2192 after)` line, for the changes that rewrite a setting rather than
 * move a file.
 *
 * Both halves are spelled out rather than only the new one: a retune leaves nothing on disk for
 * the person reading this to compare against, so the line is the only account there is of what it
 * replaced.
 */
function formatValueChangeLine(subject: string, change: ValueChange, kind: string): string {
  return (
    chalk.hex(CLI_COLORS.WARNING)(`  ~ ${subject}`) +
    chalk.hex(CLI_COLORS.NEUTRAL)(` (${kind}: ${change.from} \u2192 ${change.to})`)
  );
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
  /** The detected installation's root — where this run READS its saved skills from. */
  projectDir: string;
  sourceResult: SourceLoadResult;
  startupMessages: StartupMessage[];
  currentSkillIds: SkillId[];
  /**
   * The name of the marketplace `init --marketplace` named for the project setup this run
   * continues. Absent on every other run, where the marketplace is the one the installation stored.
   */
  setupMarketplace?: string;
};

/**
 * The one directory an `edit` run acts on, and everything every layer needs to know about it.
 *
 * Six layers used to answer "am I editing the global installation?" for themselves, three of
 * them off the working directory, and they disagreed the moment the command was started
 * outside an install. Passing this value instead of a bare path is what makes them one
 * answer: a layer that wants a different one has to reach past the parameter it was handed.
 */
type EditRoot = {
  /** Where this run writes, registers plugins and compiles into. */
  dir: string;
  /**
   * True when {@link EditRoot.dir} IS the global installation, so there is no project scope to
   * offer.
   */
  isGlobal: boolean;
  /**
   * True when this run must materialise {@link EditRoot.dir} as a project even with nothing to
   * change.
   */
  isProjectSetup: boolean;
};

/**
 * Which installation this run is editing, decided once.
 *
 * `edit` names no directory. It edits the installation `detectProject` found, and that
 * installation's root is the only root that HAS a config to edit — so it is the only root
 * this run may write to. Reading the working directory instead made a project out of
 * whichever directory the command was started in: over a global-only install the wizard
 * offered the project/global scope toggle for a project that did not exist, and saving
 * wrote a config pair into an unrelated checkout.
 *
 * `--project-setup` is an instance of that rule rather than an exception to it. It means the
 * user ran `cc init` HERE, which declares this directory the installation being set up, so
 * the config this run writes is what makes the claim true. At the home root there is nothing
 * to set up and both spellings name the same directory anyway, which is why the flag alone
 * picks the root and the resolved criterion decides whether anything is materialised.
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

/**
 * The plan a shared apply is confirmed against: what it removes, and what stays and why.
 *
 * It is one plan wherever the run was started. Inside the global installation the removals are
 * global ones, and the person chose that scope by running the command there. Inside a project
 * the global install is put back whole before the diff (see `restoreInstalledGlobal`), so every
 * removal listed is the project's own and nothing reaches past it — including the project's half
 * of a `[P][G]` pair, whose id survives at global scope and so is not in the removed lists.
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

/** A dropped project half of a skill, as the plan prints it. */
function droppedSkillLine(skillId: SkillId): string {
  return projectCopyRemoved(skillLabel(skillId));
}

/** The removals a shared configuration makes here, grouped as the plan prints them. */
function removalSections(skills: string[], agents: string[]): RemovalPlanSection[] {
  return [
    { label: SHARED_CONFIG_APPLY.SKILLS_HEADING, items: skills },
    { label: SHARED_CONFIG_APPLY.AGENTS_HEADING, items: agents },
  ].filter((section) => section.items.length > 0);
}

/** The project halves of `[P][G]` pairs a run drops. */
type DroppedHalves = { skillIds: SkillId[]; agentNames: AgentName[] };

/**
 * The `[P][G]` pairs whose project half this run drops, leaving the global install's copy to take
 * over. The diff records each as a project-to-global scope change rather than a removal, because
 * the id survives at global scope. A pair `s` folded is not one: its copy moves rather than goes.
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

/**
 * The plan's opening line. A heading is a promise about the lines beneath it, so one promising
 * removals over an empty list would be a lie — a configuration that only adds says so instead,
 * and is still confirmed, because it is still applied whole.
 */
function planHeading(sections: RemovalPlanSection[]): string {
  if (sections.length === 0) return SHARED_CONFIG_APPLY.NOTHING_REMOVED;
  return SHARED_CONFIG_APPLY.PREVIEW_HEADING;
}

/**
 * Whether this run's compile covers the global install as well as the project.
 *
 * A shared configuration applied from a project holds the global install as installed, so the
 * global pass is owed only when the write added something the global sub-agents derive from. Run
 * anyway, it would write nothing but the drift between the global config and its compiled files —
 * a missing or hand-edited agent — which no project run was asked to repair. The wizard keeps
 * both passes: a mode switch it carries to global scope is recorded before this write, so the
 * write alone cannot say whether the global agents moved.
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
 * The diff a run plans: the roster's, plus the sub-agents whose skill rows change while the roster
 * does not — a change {@link detectConfigChanges} has no field for, because it diffs entries and a
 * re-assignment adds or removes none.
 */
type PlannedChanges = ConfigChanges & { reassignedAgents: AgentName[] };

/**
 * The diff an apply acts on: the plan, plus the carried skills already installed here whose files
 * the apply rewrote with different bytes — the other change no config entry records.
 */
type AppliedChanges = PlannedChanges & { rewrittenSkills: SkillId[] };

/**
 * The diff, with the sub-agents this run owns whose rows the result changes. Only a producer that
 * states rows has any: the wizard leaves `assignedStack` undefined and the ownership rules derive
 * the stack, while a shared configuration states every row it means.
 *
 * In a project that is the project's own sub-agents only — a global one keeps every row it is
 * installed with (see `restoreInstalledGlobal`), and gains one only beside a skill the diff already
 * counts as added. A sub-agent the diff already counts as added is not counted twice.
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
 * What the apply adds or changes, by the scope each entry lands at — the two lists printed above
 * the confirm. Not the whole configuration: what is already installed as the configuration states
 * it is not arriving anywhere, and neither is the global copy a dropped project half leaves — the
 * plan lists that drop as a removal.
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

/** The kept skills that lose a slot to the configuration's own skill, one bare line each. */
function unassignedStatement(unassigned: UnassignedRow[]): string[] {
  if (unassigned.length === 0) return [];
  return [
    unassigned
      .map(({ skillId, agentName, category }) => keptUnassigned(skillId, agentName, category))
      .join("\n"),
  ];
}

/**
 * The global entries a project run holds as installed though the configuration differs — with
 * the carried skills whose global copy reads otherwise than the configuration's, which no config
 * entry can show.
 */
function keptAsInstalledStatement(held: HeldGlobal, revisedCarried: SkillId[]): string[] {
  const skillIds = [...held.keptAsInstalled.skillIds, ...revisedCarried];
  const { agentNames } = held.keptAsInstalled;
  if (skillIds.length === 0 && agentNames.length === 0) return [];
  return [keptAsInstalledGlobally(skillIds, agentNames)];
}

/**
 * How much of what it can see a run owns — the word the merger takes, and the same word the
 * global config the project write commits is resolved under.
 *
 * At the home root, everything: the session loaded the whole global config, so an absent entry
 * was deselected. In a project, only what the project owns, whichever producer said so. The
 * wizard's store refuses to deselect a live global entry at all, and a shared configuration only
 * ADDS to the global install from a project (owner ruling 2026-10-02) — so an inherited row absent
 * from either result is one nobody dropped, and the global config is added to, never matched.
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

  /**
   * The command in two statements: do the work, then answer for it.
   *
   * `applyEdit` owns every path through the edit and returns however it likes; the exit code is
   * decided once, here, after the last of them. Deciding it inside `applyEdit` would mean
   * deciding it at each of that method's three endings, and an ending added later would inherit
   * the exit-0 default silently — which is the defect this pair exists to close.
   */
  async run(): Promise<void> {
    await this.applyEdit();
    this.exitIfWorkIncomplete();
  }

  private async applyEdit(): Promise<void> {
    const { flags } = await this.parse(Edit);
    const cwd = process.cwd();

    // ABOVE `ensureConfigReadable`, and above `edit`'s own requirement that something be installed
    // here at all. Opening an id somebody shared needs no local state — no config, no catalogue,
    // no marketplace — so a directory's condition cannot decide whether you may look at it, and
    // the id already IS a stored configuration so nothing is minted either. That exemption is the
    // owner's ruling of 2026-08-24 rather than an oversight, and `edit-ui-from.e2e.test.ts` is
    // what says so: `edit` refuses an empty directory on every other path.
    if (flags.ui && flags.from !== undefined) return this.openSharedInEditor(flags.from, cwd);

    // Beside the config-readability refusal and for the same reason: past this point the wizard
    // has copied skills and installed plugins, so a run that cannot tell WHICH installation it is
    // editing has to stop while the answer still costs nothing.
    await refuseAnAmbiguousInstallation(cwd, "edit", providerNamedBy(flags.provider), (message) =>
      this.error(message, { exit: EXIT_CODES.INVALID_ARGS }),
    );

    // Before anything renders: a config that cannot be read is recreated, not edited, and
    // refusing here is what keeps the refusal clean — past this point the wizard has already
    // copied skills and installed plugins by the time a config read fails.
    await this.ensureConfigReadable(cwd);
    await this.refuseUnofferablePlacements(cwd);

    // The browser is the other editor, so it replaces the wizard rather than preceding it —
    // above the source load, which exists to fill screens this run will never paint.
    if (flags.ui) return this.openInEditor(cwd);

    // The inbound half is destructive, so it is confirmed — and a confirm nobody can answer must
    // never become a yes. Refusing here, above the fetch and above the catalogue load, is what
    // keeps a run that cannot finish from spending either.
    const payload =
      flags.from === undefined ? null : await this.fetchSharedConfigOrFail(flags.from);

    const context = await this.loadContextUnderSpinner(flags[EDIT_PROJECT_SETUP_MARKETPLACE_FLAG]);

    // Which installation this run is editing, resolved once and read by every layer below.
    const editRoot = resolveEditRoot(context.installation, cwd, flags[EDIT_PROJECT_SETUP_FLAG]);

    // Still before anything renders, one layer below the config itself: an entry whose skill
    // IS installed and whose metadata.yaml describes it no longer would otherwise be dropped
    // from config.ts on the way out, over a file this refusal asks to be repaired instead.
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
    // The gate, at the one point where the removals are known and none has been made: after the
    // diff, above every mutation, and above the no-change return — a configuration that carries
    // its own skills still has bytes to land when the roster is unchanged.
    const rewritten =
      selection.producer === "shared"
        ? await this.confirmAndWriteCarried(selection, planned, filteredResult)
        : [];
    const changes: AppliedChanges = {
      ...planned,
      rewrittenSkills: difference(rewritten, planned.addedSkills),
    };

    // One word for both halves of the write, decided once from where the run is: the merger reads
    // it for the config ROW, and the gate reads it for the global config a project write commits.
    // Deriving it twice is how the row and the disk come to disagree.
    const authority = applyAuthority(editRoot);

    if (!hasAnyChanges(changes)) {
      this.log(chalk.hex(CLI_COLORS.NEUTRAL)("No changes made."));
      // `cc init` inside a project means "set this project up", so the project must be
      // materialised — the project's `config.ts` + `config-types.ts` written and the
      // path registered in the global `projects[]` — even when the wizard produced no roster
      // change. At the home root there is no project to set up: the global install is what the
      // dashboard was shown for, so a no-change pass there stays an inspection, as does every
      // bare `cc edit`.
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

  /** The interactive producer: open the wizard on what is installed, return what was chosen. */
  private async selectionFromWizard(
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<EditSelection | null> {
    // Here rather than above the load: every refusal about the installation — there is none, its
    // config will not load, a saved skill's metadata.yaml no longer describes it — still speaks for
    // itself over a pipe, and the mount below is the first thing that needs a terminal.
    if (!process.stdin.isTTY) {
      this.error(wizardNeedsTerminal("edit"), { exit: EXIT_CODES.ERROR });
    }

    const result = await this.runEditWizard(context, editRoot);
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
   * From a project the global install comes back too, whole: it is one installation every project
   * on the machine reads, so a project run only ADDS to it (owner ruling 2026-10-02). Every global
   * entry the configuration leaves out is put back as installed, every one it states otherwise is
   * held as installed and named in the confirm, and only the global entries the global install
   * lacks arrive — a skill with its rows, on a global sub-agent already there too. At the home
   * directory the run IS the global install, so nothing is held there.
   */
  private async selectionFromSharedConfig(
    payload: SeedPayload,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<EditSelection> {
    const { matrix: sourceMatrix } = context.sourceResult;
    // Before the decode, because a skill the payload CARRIES answers to no catalogue: unseated,
    // its id is skipped like any other unknown one and its content is never read.
    const carried = this.registerExternalSkillsOrFail(payload, sourceMatrix, editRoot.dir);
    const { result, skippedSkillIds, skippedAgentNames } = this.decodeSeedOrFail(
      payload,
      sourceMatrix,
    );

    // The first moment this can be asked, and above everything this run would say or do: an
    // all-global configuration is exactly what a global installation is for, so only the decode
    // says whether THIS one has anywhere to be written here. `init --from` asks it at the same
    // point of the same value, and a run about to be refused must not first narrate its skips.
    this.refuseProjectScopedContentAtHome(result, editRoot.dir);

    // The ids the decode above could not place. They are the skips reported below, read as what
    // STAYS rather than as what did not arrive: the payload named them, so their absence from the
    // decode is this catalogue's limit and not an instruction to delete anything — and neither is
    // the absence of a sub-agent only they carried in.
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

    // The last refusals, asked of what the apply would install and write, and above the skips,
    // the plan and the question for the reason the location refusal is above the skips.
    await this.refuseSharedConfigBeforeAsking(
      held.result,
      arrivingCarried,
      editRoot.dir,
      context.sourceResult,
    );

    // A carried skill the global install already holds is not written from a project, so a
    // revision of it does not arrive — and is named in the plan rather than dropped in silence.
    const heldGlobally = difference(carried, arrivingCarried);
    const revisedGlobally = await carriedSkillsThatDiffer(heldGlobally);

    // What the load held back for a wizard this run never mounts, above the skips it may explain.
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

  /**
   * The id, fetched — or the run refused before it is.
   *
   * Two questions are answered first, because nothing in the payload can change either answer:
   * an apply with nothing to apply to, or that cannot be confirmed, is over before the store is
   * asked, and a refusal that had already spent a round trip would be describing work it never
   * intended to do. Whether anything is installed comes before the terminal: the terminal
   * refusal's way on is this same command from a terminal, which in a folder with nothing
   * installed would only refuse again.
   */
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
   * Seats the catalogue entries the payload carries with it, or refuses the run. The refusals are
   * `registerExternalSkills`' own — a carried skill asked for as a plugin, which no marketplace
   * serves, and a carried skill claiming an id the loaded catalogue already owns, whose bytes would
   * be written over that catalogue's own copy — reported with this command's exit code for the same
   * reason the decode's is.
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

  /**
   * Confirms a shared configuration, then writes the skills it brought with it — answering with
   * those whose files now read differently.
   */
  private async confirmAndWriteCarried(
    selection: Extract<EditSelection, { producer: "shared" }>,
    planned: PlannedChanges,
    result: WizardResultV2,
  ): Promise<SkillId[]> {
    await this.confirmSharedConfigOrCancel(planned, selection.kept, applyArrivals(planned, result));
    return this.writeCarriedSkills(selection.carried);
  }

  /** Writes the skills the configuration brought with it, and says which they were. */
  private async writeCarriedSkills(carried: ExternalSkillInstall[]): Promise<SkillId[]> {
    if (carried.length === 0) return [];

    const rewritten = await writeExternalSkills(carried);
    this.log(carriedSkillsWritten(carried.map((skill) => skill.id)));
    return rewritten;
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
   * Above it go the two lists every `--from` install prints — what the apply adds or changes in
   * this project, and in the global install — so the question is asked about the whole of what a
   * yes does, not only about what it takes away.
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

  /**
   * Refuses a configuration whose own host cannot place what it asks for, before the wizard runs.
   *
   * `compile` asks the same question of the same roster and `update` asks it too. `edit` is the
   * command that REWRITES the file, so letting it through would mean a user curating a
   * configuration no command will act on — and then saving it back, with the unofferable row
   * carried forward because nothing on the edit path had any reason to drop it.
   */
  private async refuseUnofferablePlacements(cwd: string): Promise<void> {
    const [finding] = await unofferablePlacementsFound(cwd);
    if (finding !== undefined) this.error(finding, { exit: EXIT_CODES.ERROR });
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
   * An id somebody shared, opened rather than applied.
   *
   * The counterpart of `openInEditor` above and deliberately not a variant of it: that one MINTS,
   * because an installation is not yet a configuration the store holds. An id already is one, so
   * there is nothing to publish, and no way for this to fail except the browser refusing to launch
   * — which is a warning beside a link that still works.
   *
   * `--from` without `--ui` remains the destructive apply. Looking and applying are the two
   * things a recipient can do with an id, and this is the one that changes nothing.
   */
  private async openSharedInEditor(id: string, cwd: string): Promise<void> {
    const url = editorConfigUrl(id);

    this.log(`Open it at ${url}`);
    this.log(applySharedConfigHere(id, await holdsItsOwnInstallation(cwd)));

    if (!process.stdin.isTTY) return;

    const opened = await openUrl(url);
    if (!opened.ok) this.warn(opened.error);
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
   * The load below, behind a spinner that comes down whichever way the await ends — all
   * three of `loadContext`'s refusals are raised while it is mounted.
   */
  private async loadContextUnderSpinner(setupMarketplace?: string): Promise<EditContext> {
    return awaitUnderSpinner(STATUS_MESSAGES.LOADING_SKILLS, () =>
      this.loadContext(setupMarketplace),
    );
  }

  /**
   * @param setupMarketplace - What `init --marketplace` named for the project setup this run
   *   continues. Absent, the catalogue is the one the installation stored.
   */
  private async loadContext(setupMarketplace?: string): Promise<EditContext> {
    const detected = await detectProject();
    if (!detected) {
      this.error(ERROR_MESSAGES.NO_INSTALLATION, {
        exit: EXIT_CODES.ERROR,
      });
    }
    const { installation, config: projectConfig } = detected;

    // The detected installation's own root, which is what this run READS: the source it stored,
    // and the plugins registered against it. Every WRITE goes to `EditRoot.dir` instead, and the
    // two are the same directory unless `--project-setup` is promoting this one to a project.
    const projectDir = installation.projectDir;

    let sourceResult: SourceLoadResult;
    let startupMessages: StartupMessage[] = [];
    try {
      // `edit` reads the marketplace the installation stored, unless this run is the project setup
      // an `init --marketplace` routed here — a new installation, made from what that named.
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
   * `executeMigration` acted on this run are rewritten, and only their `origin` field. Global
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
   * The migrated `origin` decides the reference form a compiled agent emits, so every
   * OTHER registered project's config and agents are stale until this write fans out —
   * which is why it goes through the gate rather than straight to the file.
   */
  private async recordGlobalSourceMigrations(
    migratedSkillIds: Set<SkillId>,
    newSkills: SkillConfig[],
    editRoot: EditRoot,
    context: EditContext,
  ): Promise<void> {
    // A global-context edit writes the whole global config from the wizard result already.
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
          // The deps contract in config-gate/deps.ts declares
          // `() => Promise<MergedSkillsMatrix>`; this caller happens to have its
          // matrix in hand already.
          // eslint-disable-next-line @typescript-eslint/require-await -- deps contract
          loadMatrix: async () => context.sourceResult.matrix,
          loadAgents: async () => (await loadAgentDefs()).agents,
        },
      );
      this.reportFanOut(report);
    } catch (error) {
      // The migration itself already happened — the skill has been copied under $HOME or had
      // its user-scope registration moved. Only the record of it failed, so the disk and the
      // global config now describe different installations and nothing downstream will notice.
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
    // A retune moves no file, so without a line of its own it is a run that reports a heading and
    // nothing under it — which reads as the command having found nothing to do.
    for (const [agentName, change] of tuningChanges) {
      this.log(formatValueChangeLine(agentName, change, "agent"));
    }
    // A re-assignment moves no file either, and is the whole of a configuration that only gives a
    // sub-agent different skills.
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
      // Installing a plugin needs the marketplace REGISTERED and up to date with the
      // Claude CLI — the same precondition `applyPluginChanges` and `applyScopeChanges`
      // establish. Without it `claude plugin install` rejects every ref against a stale
      // local copy. Runs before `executeMigration` so an unresolvable marketplace exits
      // while the ejected working copies are still intact. Eject-side plugin uninstalls
      // are diagnostic-only, so only plugin-install work demands this.
      await this.requireMarketplaceOrExit(
        context.sourceResult,
        "migrate skills to plugin mode",
        hostAt(editRoot.dir),
      );
      // The install itself happens inside `executeMigration`, which deletes each skill's
      // working copy the moment that skill's plugin is registered — so the banner is
      // announced here and the outcome reported below, through the same surface `init`
      // and the newly-added-skill path narrate an install with.
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

    // Reports what was copied and hard-errors on any failure, for the reason the plugin
    // direction does below: a skill whose local copy could not be written must not reach
    // `recordGlobalSourceMigrations` or `writeConfigAndCompile`, either of which would
    // persist `origin: "eject"` for a skill that has no copy on disk.
    if (migrationPlan.toEject.length > 0) {
      this.reportEjectCopies(migrationResult.ejectCopies);
    }

    // Reports what was installed and hard-errors on any failure: a migration whose
    // plugin could not be installed must not reach `recordGlobalSourceMigrations` or
    // `writeConfigAndCompile`, either of which would persist a marketplace `origin`
    // for a skill with no plugin registration.
    if (migrationPlan.toPlugin.length > 0) {
      this.reportPluginInstalls(migrationResult.pluginInstalls);
    }

    return migratedSkillIds;
  }

  /**
   * What the plugin→eject half copied, what it could not, and the refusal to continue past
   * a failure.
   *
   * The shape of `BaseCommand.reportPluginInstalls`, deliberately: the two directions of one
   * mode switch owe the user the same account, and the eject half having no structured
   * failure at all is what let a config record `origin: "eject"` for a skill whose copy was
   * refused. It stays private because `edit` is the only command that migrates a mode —
   * `init` installs, and has no old state to move.
   *
   * The count line is the same one `copyNewLocalSkills` prints, and names no destination:
   * the migration splits its copies between the project and $HOME by each skill's own scope,
   * so one directory would misname the other half.
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

  /** Names what this run is switching, in the words `init` describes an install mode with. */
  private logModeSwitch(count: number, modeDescription: string): void {
    this.log(chalk.hex(CLI_COLORS.NEUTRAL)(`Switching ${count} skill(s) to ${modeDescription}`));
  }

  /**
   * The scope moves this edit made, on disk. A collapsed `[P][G]` pair is not one of them: its
   * project half is dropped or folded ({@link applyCollapsedPairs}), and moving every collapse is
   * what wrote a dropped copy over the global install.
   */
  private async applyScopeChanges(
    changes: ConfigChanges,
    filteredResult: WizardResultV2,
    context: EditContext,
    editRoot: EditRoot,
  ): Promise<void> {
    const scopeChanges = scopeMovesOf(changes);

    // Handle scope migrations (P->G or G->P) for eject-mode skills
    for (const [skillId, change] of scopeChanges) {
      const skillConfig = filteredResult.skills.find((s) => s.id === skillId);
      if (skillConfig?.origin === EJECT_SOURCE) {
        await migrateLocalSkillScope(skillId, change.from, editRoot.dir);
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
      hostAt(editRoot.dir),
    );

    const pluginScopeResult = await migratePluginSkillScopes(
      scopeChanges,
      filteredResult.skills,
      marketplace,
      editRoot.dir,
    );
    // A scope migration INSTALLS the plugin at its new scope, so a failure here is not the
    // diagnostic an uninstall failure is: the skill is registered at neither scope while the
    // config is about to record the new one.
    for (const item of pluginScopeResult.failed) {
      this.reportIncompleteWork(
        `Failed to migrate plugin scope for ${item.id}: ${item.error}`,
        INCOMPLETE_WORK_RECOVERY.INSPECT_INSTALLATION,
      );
    }
  }

  /**
   * The project's own half of each `[P][G]` pair this edit collapsed. A Local copy `s` folded into
   * a Local global install moves there, edits included, replacing the global copy every project
   * reads. Every other half is removed at project scope and nowhere else: its ejected copy deleted,
   * or its project-scope plugin registration uninstalled.
   *
   * The global install's MODE is {@link applyMigrations}' to change, and it changes only when the
   * collapse carried a new install mode with it — a fold into a plugin installs the plugin there.
   *
   * The uninstall is diagnostic, as every plugin uninstall here is: the config no longer names the
   * registration, so one left behind is untidy rather than wrong.
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

  /** The project-scope registrations of collapsed pairs' plugin halves, uninstalled and reported. */
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

    // Handle remaining non-migration source changes (e.g., marketplace A -> marketplace B)
    for (const [skillId, change] of sourceChanges) {
      // Skip skills already handled by mode migration
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

    // Compute plugin-intent lists per-skill (ungated) — per-skill `origin` drives install mode.
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

    // Copy newly added local-source skills to .claude/skills/ (split by scope)
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

    // A fully-deselected eject-mode skill is a genuine uninstall — its copied directory under
    // the host's skills directory must be removed from the scope it was installed at. Plugin
    // removals are handled by applyPluginChanges; source-change (eject->marketplace) deletions by
    // applySourceChanges. deleteLocalSkill is a no-op when the directory is absent.
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
    // Load agent definitions — needed for both config-types.ts and recompilation
    let agentDefsResult: AgentDefs;
    try {
      agentDefsResult = await loadAgentDefs();
    } catch (error) {
      this.handleError(error);
    }

    // Persist wizard result to config.ts and config-types.ts (split by scope when in project context)
    //
    // A failed write is fatal, not a warning. Every mutation this run made — plugin
    // registrations, ejected copies, deleted working copies — has already landed on disk,
    // and config.ts is the only record of what they were for. Continuing past it into the
    // agent recompile left the registry, the config and `.claude/agents/` mutually
    // inconsistent and still reported success, which is the same silent-substitution defect
    // the plugin install path refuses.
    let configResult: ConfigWriteResult;
    try {
      configResult = await writeProjectConfig({
        wizardResult: result,
        sourceResult: context.sourceResult,
        projectDir: editRoot.dir,
        agentDefs: agentDefsResult,
        // A full `cc edit` pass is authoritative over the roster it owns, so deselected entries
        // are removed rather than union-preserved. `applyAuthority` decides
        // how much that is from the producer and the directory, and hands the same word to the
        // merger and to the global config the project branch of the gate commits.
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
        // Recorded off `failed` rather than off the warnings just printed: `warnings` also
        // carries entries that are not failures, and the ending must not file those as work owed.
        this.recordIncompleteWork(agentsNotCompiled(failed), INCOMPLETE_WORK_RECOVERY.RECOMPILE);
      } else if (compiled.length > 0) {
        this.log(chalk.hex(CLI_COLORS.NEUTRAL)(summary));
      } else {
        this.log(chalk.hex(CLI_COLORS.NEUTRAL)(INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE));
      }
    } catch (error) {
      // The config write above has already landed, and the recompile is the last step — so
      // there is nothing left to abort into. What is wrong is the silence: `.claude/agents/`
      // now describes the roster this edit replaced, and the run used to report success over it.
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

      // A compiled sub-agent this project no longer configures is still a sub-agent Claude Code
      // loads, so a removal that did not happen is a roster the edit did not actually change.
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
   * What this host could not carry, once per run and after the last write: the lines `init` and
   * `compile` print, from {@link hostCompileNotices}, so `edit` cannot say something different
   * about the tree it just compiled.
   *
   * After {@link cleanupStaleAgentFiles}, because the question is about the tree as it now stands:
   * an edit that removed the project's last gated sub-agent must not count the file it deleted.
   *
   * Not on a run that owes work, which ends on that account instead: such a run may have left
   * nothing here to read, and a notice that threw over it would turn the run's
   * `COMPLETED_WITH_FAILURES` exit into an `ERROR`.
   */
  private async reportWhatThisHostCannotCarry(editRoot: EditRoot): Promise<void> {
    if (this.hasIncompleteWork) return;

    for (const notice of await hostCompileNotices(providerInUse(editRoot.dir), editRoot.dir)) {
      this.log(notice);
    }
  }

  private logCompletionSummary(_changes: ConfigChanges): void {
    // A run with work owed ends on the account below instead \u2014 a tick over a partial apply is
    // the claim being withdrawn here, not an extra line beside it.
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
  /**
   * Skill ids whose `scopeChanges` entry is a dual-scope add/remove — the project
   * half of a `[P][G]` pair was toggled while the global half persists — NOT a true
   * single-entry migration. It steers the completion summary, so a dual-scope addition
   * is not misreported as a `[G] → [P]` migration; the disk side of a removal is
   * `collapsedPairs`.
   */
  dualScopeSkillTransitions: Set<SkillId>;
  /**
   * The `[P][G]` pairs this edit collapsed — the removal half of `dualScopeSkillTransitions` —
   * each half as it stood before the edit.
   *
   * SPACE on the pair's row and `s` both collapse it, into an entry the config cannot tell apart,
   * and they mean different things, which the wizard result tells apart instead. SPACE DROPS the
   * project's own install, at project scope, and leaves the global one it masked as it is. `s`
   * FOLDS it into the global install for every project: a Local copy replaces the global copy, and
   * a half in another mode than the global install carries that mode to it. So `sourceChanges` and
   * the mode migrations measure a collapsed skill against `maskedGlobal`, never against the half.
   */
  collapsedPairs: CollapsedPair[];
  /** Agent equivalent of `dualScopeSkillTransitions`. */
  dualScopeAgentTransitions: Set<AgentName>;
  /**
   * Sub-agents whose TUNING changed — the model it runs on and the effort it reasons at — where
   * the roster itself is unchanged.
   *
   * Its own field rather than folded into `addedAgents`, because nothing downstream acts on it:
   * a retuned sub-agent installs nothing, uninstalls nothing and moves no file. It is recompiled,
   * which `writeConfigAndCompile` already does for the whole roster. What it changes is whether
   * this run believes it has anything to do at all — and a shared configuration whose entire
   * content is a retune used to read as no change, so the command reported none, wrote nothing,
   * and left both ends believing the retune had travelled.
   */
  tuningChanges: Map<AgentName, ValueChange>;
};

/** One field's before and after, as the summary prints them. */
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

/** A sub-agent that names no model and no effort, which is most of them. */
const RESTING_TUNING = "defaults";

/**
 * One sub-agent's tuning as a single line: everything about it that is neither its identity nor
 * its scope, in the order a reader meets it.
 *
 * Rendered to a sentence and compared as one, rather than field by field, because the diff and
 * the summary want the same answer — and a diff that can see a change it has no words for is a
 * change the person applying it is told nothing about.
 */
function describeTuning(agent: AgentScopeConfig): string {
  const settings = [
    agent.model === undefined ? undefined : `model ${agent.model}`,
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

/**
 * The removal half of the dual-scope transitions, as the pairs they collapsed: each P→G change
 * the old state's tombstone classified, with both halves read back out of that old state, and
 * whether `s` folded it.
 */
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

/**
 * Whether a collapse moves the project's copy into the global install: `s` folded a Local half,
 * and the global entry it became is Local too. A fold into a plugin installs the plugin instead,
 * and a drop removes the copy.
 */
function foldsItsCopyIntoGlobal(pair: CollapsedPair, newSkills: SkillConfig[]): boolean {
  const { projectHalf, folded } = pair;
  const globalEntry = newSkills.find(
    (skill) => skill.id === projectHalf.id && isActiveAt(skill, "global"),
  );
  return folded && projectHalf.origin === EJECT_SOURCE && globalEntry?.origin === EJECT_SOURCE;
}

/** One half of a pair the old state held — present by construction, so a miss is a defect. */
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
 * masked — what a collapsed skill's origin is measured against. The project half is removed, not
 * migrated, so the only install whose mode a collapse can change is the global one.
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

/** The global install a tombstone masks, as the active entry it records. */
function installRecordedBy(tombstone: SkillConfig): SkillConfig {
  const { excluded: _masked, ...install } = tombstone;
  return install;
}

/**
 * The scope changes that moved an install. A collapsed pair's change is not one: its project half
 * is dropped or folded into the global install it masked, which stays where it is.
 */
function scopeMovesOf(changes: ConfigChanges): Map<SkillId, ScopeChange> {
  const collapsed = new Set(changes.collapsedPairs.map(({ projectHalf }) => projectHalf.id));
  return new Map([...changes.scopeChanges].filter(([id]) => !collapsed.has(id)));
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
