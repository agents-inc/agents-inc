import os from "os";
import path from "path";

import chalk from "chalk";
import { Flags } from "@oclif/core";
import { render } from "ink";

import { difference, indexBy } from "remeda";

import { BaseCommand, type SourceRefreshFlags } from "../base-command.js";
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
  installPluginSkills,
  pluginInstallFailureError,
  uninstallPluginSkills,
  loadAgentDefs,
  type AgentDefs,
  writeProjectConfig,
  compileAgentsAllScopes,
  discoverInstalledSkills,
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
  writeConfigFile,
} from "../lib/installation/index.js";
import { matrix, getSkillById, getSkillDisplayName } from "../lib/matrix/matrix-provider";
import { activeAgentScopeMap, isActiveAt } from "../lib/configuration/scope-predicates.js";
import { loadProjectConfigFromDir } from "../lib/configuration/index.js";
import type { SourceLoadResult } from "../lib/loading/index.js";
import {
  discoverAllPluginSkills,
  buildMarketplacePluginRef,
  toClaudePluginScope,
} from "../lib/plugins/index.js";
import { deleteLocalSkill, migrateLocalSkillScope } from "../lib/skills/index.js";
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
import { remove } from "../utils/fs.js";
import { type StartupMessage } from "../utils/logger.js";
import { ERROR_MESSAGES, STATUS_MESSAGES } from "../utils/messages.js";
import { formatScopeTag } from "../lib/wizard/index.js";
import { typedKeys } from "../utils/typed-object.js";

/** A scope transition (`from` → `to`) for a re-scoped skill or agent. */
type ScopeChange = { from: SkillScope; to: SkillScope };

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

/** The migrated `source` for an active-global entry, or the entry unchanged. */
function withMigratedSource(
  skill: SkillConfig,
  migratedSources: ReadonlyMap<SkillId, string>,
): SkillConfig {
  if (!isActiveAt(skill, "global")) return skill;
  const source = migratedSources.get(skill.id);
  if (source === undefined || source === skill.source) return skill;
  return { ...skill, source };
}

/**
 * @internal Exported for testing
 *
 * Rewrites `source` on exactly the active-global entries listed in `migratedSources`,
 * returning every other entry — including global entries this session did not migrate —
 * identical by reference. `changed` is false when nothing needed rewriting, so the caller
 * can skip the global write entirely.
 */
export function applyMigratedGlobalSources(
  globalSkills: SkillConfig[],
  migratedSources: ReadonlyMap<SkillId, string>,
): { skills: SkillConfig[]; changed: boolean } {
  const skills = globalSkills.map((skill) => withMigratedSource(skill, migratedSources));
  return { skills, changed: skills.some((skill, index) => skill !== globalSkills[index]) };
}

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
    {
      description: "Edit with a custom source",
      command: "<%= config.bin %> <%= command.id %> --source github:org/marketplace",
    },
    {
      description: "Force refresh skills from remote",
      command: "<%= config.bin %> <%= command.id %> --refresh",
    },
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    refresh: Flags.boolean({
      description: "Force refresh from remote sources",
      default: false,
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

    const { unmount, clear: clearSpinner } = render(
      <Spinner label={STATUS_MESSAGES.LOADING_SKILLS} />,
    );
    const context = await this.loadContext(flags);
    clearSpinner();
    unmount();

    const result = await this.runEditWizard(context, cwd);
    if (!result) this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });

    this.reportValidationErrors(result);

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
      await this.writeConfigAndCompile(result, context, flags, cwd);
      this.logCompletionSummary(changes);
      return;
    }

    this.logChangeSummary(changes, filteredResult.skills, filteredOldConfig?.skills ?? []);
    const migratedSkillIds = await this.applyMigrations(
      changes,
      filteredResult,
      activeOldSkills,
      context,
      cwd,
    );
    await this.recordGlobalSourceMigrations(migratedSkillIds, filteredResult.skills, cwd);
    await this.applyScopeChanges(changes, filteredResult, context, cwd);
    await this.applySourceChanges(changes, activeOldSkills, cwd, migratedSkillIds);
    await this.applyPluginChanges(changes, filteredResult, activeOldSkills, context, cwd);
    await this.copyNewLocalSkills(changes, filteredResult, context, cwd);
    await this.removeDeletedLocalSkills(changes, activeOldSkills, cwd);
    await this.writeConfigAndCompile(result, context, flags, cwd);
    await this.cleanupStaleAgentFiles(changes, activeOldAgents, cwd);
    this.logCompletionSummary(changes);
  }

  private async loadContext(flags: SourceRefreshFlags): Promise<EditContext> {
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
      const loaded = await loadSource({
        sourceFlag: flags.source,
        projectDir,
        forceRefresh: flags.refresh,
        captureStartupMessages: true,
      });
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
        projectConfig?.skills?.filter((s) => s.excluded).map((s) => s.id) ?? [],
      );
      const configSkillIds =
        projectConfig?.skills?.filter((s) => !s.excluded).map((s) => s.id) ?? [];
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
    const { projectConfig, projectDir, currentSkillIds } = context;

    return runWizardSession({
      hydrate: {
        initialStep: "build",
        initialDomains: projectConfig?.domains,
        initialAgents: projectConfig?.selectedAgents,
        installedSkillIds: currentSkillIds,
        installedSkillConfigs: projectConfig?.skills,
        installedAgentConfigs: projectConfig?.agents,
        isEditingFromGlobalScope: isHomeDirectory(cwd),
      },
      props: {
        version: this.config.version,
        initialAgents: projectConfig?.selectedAgents,
        installedSkillIds: currentSkillIds,
        projectDir,
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
   * Refusing the switch instead is not an option — driving a global-scope migration from a
   * project directory is a supported flow (`scope-aware-local-copy` lifecycle tests).
   *
   * Runs BEFORE `writeConfigAndCompile`, so the global config written here is the one
   * `writeScopedConfigs` reloads, keeps (existing wins in `mergeGlobalConfigs`) and inlines
   * into the project config — both files then tell the same story.
   */
  private async recordGlobalSourceMigrations(
    migratedSkillIds: Set<SkillId>,
    newSkills: SkillConfig[],
    cwd: string,
  ): Promise<void> {
    // A global-context edit writes the whole global config from the wizard result already.
    if (isHomeDirectory(cwd)) return;

    const migratedSources = new Map(
      newSkills
        .filter((s) => migratedSkillIds.has(s.id) && isActiveAt(s, "global"))
        .map((s) => [s.id, s.source] as const),
    );
    if (migratedSources.size === 0) return;

    const existingGlobal = await loadProjectConfigFromDir(os.homedir());
    // No global config yet — `writeScopedConfigs` writes the global split verbatim,
    // migrated source included, so there is nothing to reconcile.
    if (!existingGlobal) return;

    const { skills, changed } = applyMigratedGlobalSources(
      existingGlobal.config.skills,
      migratedSources,
    );
    if (!changed) return;

    try {
      await writeConfigFile({ ...existingGlobal.config, skills }, existingGlobal.configPath);
    } catch (error) {
      this.warn(`Could not record global source change: ${getErrorMessage(error)}`);
    }
  }

  private reportValidationErrors(result: WizardResultV2): void {
    if (result.validation.errors.length > 0) {
      for (const err of result.validation.errors) {
        this.warn(err.message);
      }
    }
  }

  private logChangeSummary(
    changes: ConfigChanges,
    newSkills: SkillConfig[],
    oldSkills: SkillConfig[],
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
      this.log(chalk.hex(CLI_COLORS.ERROR)(`  - ${getSkillDisplayName(skillId)}${scopeLabel}`));
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
      const displayName = getSkillDisplayName(skillId);

      if (dualScopeSkillTransitions.has(skillId)) {
        this.log(formatDualScopeTransition(displayName, change.to));
        continue;
      }

      const fromLabel = formatScopeTag(change.from);
      const toLabel = formatScopeTag(change.to);
      const isGlobalToProject = change.from === "global" && change.to === "project";
      const prefix = isGlobalToProject ? "+" : "~";
      const color = isGlobalToProject ? CLI_COLORS.SUCCESS : CLI_COLORS.WARNING;
      this.log(
        chalk.hex(color)(`  ${prefix} ${displayName}`) +
          chalk.hex(CLI_COLORS.NEUTRAL)(` (${fromLabel} \u2192 ${toLabel})`),
      );
    }
    for (const [agentName, change] of agentScopeChanges) {
      // Dual-scope add/remove for agents \u2014 mirrors the skill path above.
      if (dualScopeAgentTransitions.has(agentName)) {
        this.log(
          formatDualScopeTransition(agentName, change.to) +
            chalk.hex(CLI_COLORS.NEUTRAL)(" (agent)"),
        );
        continue;
      }

      const fromLabel = formatScopeTag(change.from);
      const toLabel = formatScopeTag(change.to);
      this.log(
        chalk.hex(CLI_COLORS.WARNING)(`  ~ ${agentName}`) +
          chalk.hex(CLI_COLORS.NEUTRAL)(` (${fromLabel} \u2192 ${toLabel})`),
      );
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
    const hasMigrations = migrationPlan.toEject.length > 0 || migrationPlan.toPlugin.length > 0;

    if (hasMigrations) {
      if (migrationPlan.toEject.length > 0) {
        this.log(
          chalk.hex(CLI_COLORS.NEUTRAL)(
            `Switching ${migrationPlan.toEject.length} skill(s) to eject`,
          ),
        );
      }
      if (migrationPlan.toPlugin.length > 0) {
        this.log(
          chalk.hex(CLI_COLORS.NEUTRAL)(
            `Switching ${migrationPlan.toPlugin.length} skill(s) to plugin`,
          ),
        );
        // Installing a plugin needs the marketplace REGISTERED and up to date with the
        // Claude CLI — the same precondition `applyPluginChanges` and `applyScopeChanges`
        // establish. Without it `claude plugin install` rejects every ref against a stale
        // local copy. Runs before `executeMigration` so an unresolvable marketplace exits
        // while the ejected working copies are still intact. Eject-side plugin uninstalls
        // are diagnostic-only, so only plugin-install work demands this.
        await this.requireMarketplaceOrExit(context.sourceResult, "migrate skills to plugin mode");
      }

      const migrationResult = await executeMigration(migrationPlan, cwd, context.sourceResult);

      for (const warning of migrationResult.warnings) {
        this.warn(warning);
      }
      for (const item of migrationResult.failedPluginInstalls) {
        this.warn(`Failed to install plugin ${item.id}: ${item.error}`);
      }

      // Plugin install intent is inviolable — a migration whose plugin could not be
      // installed must not reach `recordGlobalSourceMigrations` or
      // `writeConfigAndCompile`, either of which would persist a marketplace `source`
      // for a skill with no plugin registration. Same guard as the newly-added-skill
      // path in `applyPluginChanges`.
      if (migrationResult.failedPluginInstalls.length > 0) {
        this.error(pluginInstallFailureError(migrationResult.failedPluginInstalls.length), {
          exit: EXIT_CODES.ERROR,
        });
      }
    }

    return new Set([
      ...migrationPlan.toEject.map((m) => m.id),
      ...migrationPlan.toPlugin.map((m) => m.id),
    ]);
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
      const pluginResult = await installPluginSkills(addedPluginSkills, marketplace, cwd);
      if (pluginResult.installed.length > 0) {
        this.log(
          chalk.hex(CLI_COLORS.NEUTRAL)(`Installed ${pluginResult.installed.length} plugin(s)`),
        );
      }
      for (const item of pluginResult.failed) {
        this.warn(`Failed to install plugin ${item.id}: ${item.error}`);
      }

      // Plugin install intent is inviolable — if any skill failed to install,
      // hard-error BEFORE `writeConfigAndCompile` writes config.ts with orphan
      // entries claiming the skill is installed. Matches the
      // no-plugin-to-eject-fallback rule.
      if (pluginResult.failed.length > 0) {
        this.error(pluginInstallFailureError(pluginResult.failed.length), {
          exit: EXIT_CODES.ERROR,
        });
      }
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
      this.log(chalk.hex(CLI_COLORS.NEUTRAL)(`Copied ${copyResult.totalCopied} local skill(s)`));
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
    flags: SourceRefreshFlags,
    cwd: string,
  ): Promise<void> {
    // Load agent definitions — needed for both config-types.ts and recompilation
    let agentDefsResult: AgentDefs;
    try {
      agentDefsResult = await loadAgentDefs({
        forceRefresh: flags.refresh,
      });
    } catch (error) {
      this.handleError(error);
    }

    // Persist wizard result to config.ts and config-types.ts (split by scope when in project context)
    try {
      await writeProjectConfig({
        wizardResult: result,
        sourceResult: context.sourceResult,
        projectDir: cwd,
        sourceFlag: flags.source,
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

    try {
      const agentScopeMap = activeAgentScopeMap(result.agentConfigs);
      const { allSkills } = await discoverInstalledSkills(cwd);
      const compilationResult = await compileAgentsAllScopes({
        projectDir: cwd,
        sourcePath: agentDefsResult.sourcePath,
        skills: allSkills,
        agentScopeMap,
      });

      if (compilationResult.failed.length > 0) {
        this.log(
          chalk.hex(CLI_COLORS.NEUTRAL)(`Recompiled ${compilationResult.compiled.length} agents`) +
            chalk.hex(CLI_COLORS.WARNING)(` (${compilationResult.failed.length} failed)`),
        );
        for (const warning of compilationResult.warnings) {
          this.warn(warning);
        }
      } else if (compilationResult.compiled.length > 0) {
        this.log(
          chalk.hex(CLI_COLORS.NEUTRAL)(`Recompiled ${compilationResult.compiled.length} agents`),
        );
      } else {
        this.log(chalk.hex(CLI_COLORS.NEUTRAL)("No agents to recompile"));
      }
    } catch (error) {
      this.warn(`Agent recompilation failed: ${getErrorMessage(error)}`);
      this.log(`You can manually recompile with '${CLI_INVOKE_COMMAND} compile'.`);
    }
  }

  private async cleanupStaleAgentFiles(
    changes: ConfigChanges,
    oldAgents: AgentScopeConfig[],
    cwd: string,
  ): Promise<void> {
    const { agentScopeChanges, removedAgents } = changes;

    // Clean up old agent .md files after scope changes.
    // Recompilation wrote the new file to the correct scope directory;
    // now delete the stale copy from the old scope directory.
    // Only clean up for P→G direction. G→P is an override — the global
    // installation stays untouched; the project copy overrides it.
    for (const [agentName, change] of agentScopeChanges) {
      if (change.from === "global") continue;

      const oldAgentPath = path.join(
        resolveInstallPaths(cwd, "project").agentsDir,
        `${agentName}.md`,
      );
      try {
        await remove(oldAgentPath);
      } catch (error) {
        this.warn(`Could not remove old agent file ${oldAgentPath}: ${getErrorMessage(error)}`);
      }
    }

    // Deselected agents are a genuine uninstall — recompilation never rewrites their .md, so
    // delete the compiled file from the scope it was installed at (D-233). remove() is a no-op
    // when the file is absent.
    for (const agentName of removedAgents) {
      const oldScope = oldAgents.find((a) => a.name === agentName)?.scope ?? "project";
      const agentPath = path.join(resolveInstallPaths(cwd, oldScope).agentsDir, `${agentName}.md`);
      try {
        await remove(agentPath);
      } catch (error) {
        this.warn(`Could not remove agent file ${agentPath}: ${getErrorMessage(error)}`);
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
  const oldSkillIds = oldConfig?.skills?.map((s) => s.id) ?? [];
  const newSkillIds = wizardResult.skills.map((s) => s.id);
  const oldAgentNames = oldConfig?.agents?.map((a) => a.name) ?? [];
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
