import path from "path";

import chalk from "chalk";
import { Flags } from "@oclif/core";
import { render } from "../components/render.js";

import { difference, indexBy } from "remeda";

import { BaseCommand } from "../base-command.js";
import { type WizardResultV2 } from "../components/wizard/wizard.js";
import { runWizardSession } from "../components/wizard/run-wizard-session.js";
import {
  CLI_INVOKE_COMMAND,
  CLI_COLORS,
  EDIT_PROJECT_SETUP_FLAG,
  EJECT_SOURCE,
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
import { applyMigratedGlobalSources, mutateGlobal } from "../lib/config-gate/index.js";
import { matrix, getSkillById, getSkillDisplayName } from "../lib/matrix/matrix-provider";
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
  ProjectConfig,
  SkillScope,
} from "../types/index.js";
import { claudePluginInstall, claudePluginUninstall } from "../utils/exec.js";
import { getErrorMessage } from "../utils/errors.js";
import { type StartupMessage } from "../utils/logger.js";
import {
  ERROR_MESSAGES,
  INFO_MESSAGES,
  STATUS_MESSAGES,
  localSkillsCopied,
  recompileSummary,
} from "../utils/messages.js";
import { formatScopeTag } from "../lib/wizard/index.js";
import { typedKeys } from "../utils/typed-object.js";

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

export default class Edit extends BaseCommand {
  static summary = "Edit skills in the plugin";
  static description = "Modify the currently installed skills via interactive wizard";

  static examples = [
    {
      description: "Open the edit wizard",
      command: "<%= config.bin %> <%= command.id %>",
    },
  ];

  static flags = {
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

    const context = await this.loadContextUnderSpinner();

    // Still before anything renders, one layer below the config itself: an entry whose skill
    // IS installed and whose metadata.yaml describes it no longer would otherwise be dropped
    // from config.ts on the way out, over a file this refusal asks to be repaired instead.
    await this.ensureSavedSkillsReadable(
      context.projectConfig?.skills ?? [],
      context.sourceResult.matrix,
      context.projectDir,
    );

    const result = await this.runEditWizard(context, cwd);
    if (!result) this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });

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

    if (!hasAnyChanges(changes)) {
      this.log(chalk.hex(CLI_COLORS.NEUTRAL)("No changes made."));
      if (!isProjectSetup) return;
      await this.writeConfigAndCompile(result, context, cwd);
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
    await this.writeConfigAndCompile(result, context, cwd);
    await this.cleanupStaleAgentFiles(changes, activeOldAgents, cwd);
    this.logCompletionSummary(changes);
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
        .map((s) => [s.id, s.source] as const),
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
      this.warn(`Could not record global source change: ${getErrorMessage(error)}`);
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
      if (skillConfig?.source === EJECT_SOURCE) {
        await migrateLocalSkillScope(skillId, change.from, cwd);
      }
    }

    // Plugin scope migrations require a marketplace.
    // Compute eligible migrations first; only resolve/demand marketplace when there are any.
    const hasPluginScopeChanges = [...scopeChanges.keys()].some((skillId) => {
      const skillConfig = filteredResult.skills.find((s) => s.id === skillId);
      return skillConfig && skillConfig.source !== EJECT_SOURCE;
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
      (s) => addedSkills.includes(s.id) && s.source !== EJECT_SOURCE,
    );
    const removedPluginSkills = removedSkills.filter(
      (id) => activeOldSkills.find((s) => s.id === id)?.source !== EJECT_SOURCE,
    );

    if (addedPluginSkills.length === 0 && removedPluginSkills.length === 0) return;

    const marketplace = await this.requireMarketplaceOrExit(
      context.sourceResult,
      "install or uninstall plugin skills",
    );

    if (addedPluginSkills.length > 0) {
      await this.installPluginSkillsReported(addedPluginSkills, marketplace, cwd);
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
      (s) => addedSkills.includes(s.id) && s.source === EJECT_SOURCE,
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
      if (oldSkill?.source !== EJECT_SOURCE) continue;

      const deleteDir = installBaseDir(cwd, oldSkill.scope);
      await deleteLocalSkill(deleteDir, skillId);
    }
  }

  private async writeConfigAndCompile(
    result: WizardResultV2,
    context: EditContext,
    cwd: string,
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
        // are removed rather than union-preserved (D-233 Scenario C). Global-context edit owns
        // the entire config ("all"); a project edit owns only project-scoped entries and its own
        // tombstones ("owned"), never inherited global-active entries.
        authoritativeScope: isHomeDirectory(cwd) ? "all" : "owned",
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
      (s) => s.source,
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
  skills: Pick<SkillConfig, "id" | "source">[],
  marketplace: string,
  projectDir: string,
): Promise<PluginScopeMigrationResult> {
  const migrated: SkillId[] = [];
  const failed: PluginScopeMigrationResult["failed"] = [];

  for (const [skillId, change] of scopeChanges) {
    const skillConfig = skills.find((s) => s.id === skillId);
    if (!skillConfig || skillConfig.source === EJECT_SOURCE) {
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
