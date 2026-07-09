import fs from "fs";
import os from "os";
import path from "path";

import chalk from "chalk";
import { Flags } from "@oclif/core";
import { render } from "ink";

import { difference, indexBy } from "remeda";

import { BaseCommand } from "../base-command.js";
import { Wizard, type WizardResultV2 } from "../components/wizard/wizard.js";
import { hydrateWizardStore } from "../stores/wizard-store.js";
import {
  CLAUDE_DIR,
  CLI_INVOKE_COMMAND,
  CLI_COLORS,
  GLOBAL_INSTALL_ROOT,
  SOURCE_DISPLAY_NAMES,
} from "../consts.js";
import {
  detectProject,
  loadSource,
  copyLocalSkills,
  ensureMarketplace,
  installPluginSkills,
  uninstallPluginSkills,
  loadAgentDefs,
  type AgentDefs,
  writeProjectConfig,
  compileAgents,
  discoverInstalledSkills,
} from "../lib/operations/index.js";
import { Spinner } from "../components/common/spinner.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import {
  type Installation,
  detectMigrations,
  executeMigration,
  deriveInstallMode,
} from "../lib/installation/index.js";
import { matrix, getSkillById } from "../lib/matrix/matrix-provider";
import type { SourceLoadResult } from "../lib/loading/index.js";
import { discoverAllPluginSkills } from "../lib/plugins/index.js";
import { deleteLocalSkill, migrateLocalSkillScope } from "../lib/skills/index.js";
import type { SkillId, SkillConfig, AgentName, ProjectConfig } from "../types/index.js";
import { claudePluginInstall, claudePluginUninstall } from "../utils/exec.js";
import { getErrorMessage } from "../utils/errors.js";
import { remove } from "../utils/fs.js";
import { type StartupMessage } from "../utils/logger.js";
import { ERROR_MESSAGES } from "../utils/messages.js";

function formatSourceDisplayName(sourceName: string): string {
  return SOURCE_DISPLAY_NAMES[sourceName] ?? sourceName;
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
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Edit);
    const cwd = process.cwd();

    const { unmount, clear: clearSpinner } = render(<Spinner label="Loading skills..." />);
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

    const changes = detectConfigChanges(filteredOldConfig, filteredResult);
    if (!hasAnyChanges(changes)) {
      this.log(chalk.hex(CLI_COLORS.NEUTRAL)("No changes made."));
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
    await this.applyScopeChanges(changes, filteredResult, context, cwd);
    await this.applySourceChanges(changes, activeOldSkills, context, cwd, migratedSkillIds);
    await this.applyPluginChanges(changes, filteredResult, activeOldSkills, context, cwd);
    await this.copyNewLocalSkills(changes, filteredResult, context, cwd);
    await this.writeConfigAndCompile(result, activeNewSkills, context, flags, cwd);
    await this.cleanupStaleAgentFiles(changes, cwd);
    this.logCompletionSummary(changes);
  }

  private async loadContext(flags: { source?: string; refresh: boolean }): Promise<EditContext> {
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
      // Boundary cast: discoverAllPluginSkills keys are skill IDs from frontmatter
      const pluginSkillIds = Object.keys(discoveredSkills) as SkillId[];

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

    let wizardResult: WizardResultV2 | null = null;

    const isGlobalDir = cwd === GLOBAL_INSTALL_ROOT;

    hydrateWizardStore({
      initialStep: "build",
      initialDomains: projectConfig?.domains,
      initialAgents: projectConfig?.selectedAgents,
      installedSkillIds: currentSkillIds,
      installedSkillConfigs: projectConfig?.skills,
      installedAgentConfigs: projectConfig?.agents,
      isEditingFromGlobalScope: isGlobalDir,
    });

    const { waitUntilExit, clear } = render(
      <Wizard
        version={this.config.version}
        initialAgents={projectConfig?.selectedAgents}
        installedSkillIds={currentSkillIds}
        projectDir={projectDir}
        startupMessages={context.startupMessages}
        onComplete={(result) => {
          wizardResult = result;
        }}
        onCancel={() => {
          this.log("\nEdit cancelled");
        }}
      />,
    );

    await waitUntilExit();
    clear();
    this.clearTerminal();

    // TypeScript can't track that onComplete callback mutates wizardResult before waitUntilExit resolves
    const result = wizardResult as WizardResultV2 | null;

    if (!result || result.cancelled) return null;
    return result;
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
    } = changes;

    this.log(`\n${chalk.hex(CLI_COLORS.WHITE).bold("Changes:")}`);
    for (const skillId of addedSkills) {
      const scope = newSkills.find((s) => s.id === skillId)?.scope;
      const scopeLabel = scope ? ` [${scope === "global" ? "G" : "P"}]` : "";
      this.log(
        chalk.hex(CLI_COLORS.SUCCESS)(`  + ${getSkillById(skillId).displayName}${scopeLabel}`),
      );
    }
    for (const skillId of removedSkills) {
      const skill = matrix.skills[skillId];
      const scope = oldSkills.find((s) => s.id === skillId)?.scope;
      const scopeLabel = scope ? ` [${scope === "global" ? "G" : "P"}]` : "";
      this.log(chalk.hex(CLI_COLORS.ERROR)(`  - ${skill?.displayName ?? skillId}${scopeLabel}`));
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
      const displayName = matrix.skills[skillId]?.displayName ?? skillId;
      const fromLabel = formatSourceDisplayName(change.from);
      const toLabel = formatSourceDisplayName(change.to);
      this.log(
        chalk.hex(CLI_COLORS.WARNING)(`  ~ ${displayName}`) +
          chalk.hex(CLI_COLORS.NEUTRAL)(` (${fromLabel} \u2192 ${toLabel})`),
      );
    }
    for (const [skillId, change] of scopeChanges) {
      const displayName = matrix.skills[skillId]?.displayName ?? skillId;
      const fromLabel = change.from === "global" ? "[G]" : "[P]";
      const toLabel = change.to === "global" ? "[G]" : "[P]";
      const isGlobalToProject = change.from === "global" && change.to === "project";
      const prefix = isGlobalToProject ? "+" : "~";
      const color = isGlobalToProject ? CLI_COLORS.SUCCESS : CLI_COLORS.WARNING;
      this.log(
        chalk.hex(color)(`  ${prefix} ${displayName}`) +
          chalk.hex(CLI_COLORS.NEUTRAL)(` (${fromLabel} \u2192 ${toLabel})`),
      );
    }
    for (const [agentName, change] of agentScopeChanges) {
      const fromLabel = change.from === "global" ? "[G]" : "[P]";
      const toLabel = change.to === "global" ? "[G]" : "[P]";
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
      }

      const migrationResult = await executeMigration(migrationPlan, cwd, context.sourceResult);

      for (const warning of migrationResult.warnings) {
        this.warn(warning);
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
      if (skillConfig?.source === "eject") {
        await migrateLocalSkillScope(skillId, change.from, cwd);
      }
    }

    // Plugin scope migrations require a marketplace.
    // Compute eligible migrations first; only resolve/demand marketplace when there are any.
    const hasPluginScopeChanges = [...scopeChanges.keys()].some((skillId) => {
      const skillConfig = filteredResult.skills.find((s) => s.id === skillId);
      return skillConfig && skillConfig.source !== "eject";
    });
    if (!hasPluginScopeChanges) return;

    const marketplace = await this.requireMarketplace(
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
    context: EditContext,
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
      if (change.from === "eject") {
        const oldSkill = activeOldSkills.find((s) => s.id === skillId);
        const deleteDir = oldSkill?.scope === "global" ? os.homedir() : cwd;
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
      (s) => addedSkills.includes(s.id) && s.source !== "eject",
    );
    const removedPluginSkills = removedSkills.filter(
      (id) => activeOldSkills.find((s) => s.id === id)?.source !== "eject",
    );

    if (addedPluginSkills.length === 0 && removedPluginSkills.length === 0) return;

    const marketplace = await this.requireMarketplace(
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
        this.error(
          `Failed to install ${pluginResult.failed.length} plugin skill(s). Plugin install intent could not be honored. Verify the skill id matches the marketplace, re-run with --refresh to update the marketplace, or switch affected skills to eject mode.`,
          { exit: EXIT_CODES.ERROR },
        );
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

  /**
   * Lazily resolves the marketplace for plugin operations and hard-errors when
   * resolution fails. Plugin install intent is inviolable — we never silently
   * fall back to eject or skip.
   */
  private async requireMarketplace(
    sourceResult: SourceLoadResult,
    purpose: string,
  ): Promise<string> {
    const mpResult = await ensureMarketplace(sourceResult);
    if (!mpResult.marketplace) {
      this.error(
        `Cannot ${purpose}: marketplace could not be resolved from source '${sourceResult.sourceConfig.source}'. ` +
          `Plugin install mode requires a marketplace — fix the source or switch affected skills to eject mode.`,
        { exit: EXIT_CODES.ERROR },
      );
    }
    return mpResult.marketplace;
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
      (s) => addedSkills.includes(s.id) && s.source === "eject",
    );

    if (addedLocalSkills.length > 0) {
      const copyResult = await copyLocalSkills(addedLocalSkills, cwd, context.sourceResult);
      this.log(chalk.hex(CLI_COLORS.NEUTRAL)(`Copied ${copyResult.totalCopied} local skill(s)`));
    }
  }

  private async writeConfigAndCompile(
    result: WizardResultV2,
    activeNewSkills: SkillConfig[],
    context: EditContext,
    flags: { source?: string; refresh: boolean },
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
      });
    } catch (error) {
      this.warn(`Could not update config: ${getErrorMessage(error)}`);
    }

    try {
      const agentScopeMap = new Map(
        result.agentConfigs.filter((a) => !a.excluded).map((a) => [a.name, a.scope] as const),
      );
      const { allSkills } = await discoverInstalledSkills(cwd);
      const installMode = deriveInstallMode(activeNewSkills);
      const isProjectContext = fs.realpathSync(cwd) !== fs.realpathSync(os.homedir());

      let compilationResult: Awaited<ReturnType<typeof compileAgents>>;
      if (isProjectContext) {
        const globalResult = await compileAgents({
          projectDir: os.homedir(),
          sourcePath: agentDefsResult.sourcePath,
          skills: allSkills,
          pluginDir: os.homedir(),
          outputDir: path.join(os.homedir(), CLAUDE_DIR, "agents"),
          installMode,
          agentScopeMap,
          scopeFilter: "global",
        });
        const projectResult = await compileAgents({
          projectDir: cwd,
          sourcePath: agentDefsResult.sourcePath,
          skills: allSkills,
          pluginDir: cwd,
          outputDir: path.join(cwd, CLAUDE_DIR, "agents"),
          installMode,
          agentScopeMap,
          scopeFilter: "project",
        });
        compilationResult = {
          compiled: [...globalResult.compiled, ...projectResult.compiled],
          failed: [...globalResult.failed, ...projectResult.failed],
          warnings: [...globalResult.warnings, ...projectResult.warnings],
        };
      } else {
        compilationResult = await compileAgents({
          projectDir: cwd,
          sourcePath: agentDefsResult.sourcePath,
          skills: allSkills,
          pluginDir: cwd,
          outputDir: path.join(cwd, CLAUDE_DIR, "agents"),
          installMode,
          agentScopeMap,
        });
      }

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

  private async cleanupStaleAgentFiles(changes: ConfigChanges, cwd: string): Promise<void> {
    const { agentScopeChanges } = changes;

    // Clean up old agent .md files after scope changes.
    // Recompilation wrote the new file to the correct scope directory;
    // now delete the stale copy from the old scope directory.
    // Only clean up for P→G direction. G→P is an override — the global
    // installation stays untouched; the project copy overrides it.
    for (const [agentName, change] of agentScopeChanges) {
      if (change.from === "global") continue;

      const oldAgentPath = path.join(cwd, CLAUDE_DIR, "agents", `${agentName}.md`);
      try {
        await remove(oldAgentPath);
      } catch (error) {
        this.warn(`Could not remove old agent file ${oldAgentPath}: ${getErrorMessage(error)}`);
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
  scopeChanges: Map<SkillId, { from: "project" | "global"; to: "project" | "global" }>;
  agentScopeChanges: Map<AgentName, { from: "project" | "global"; to: "project" | "global" }>;
};

/** @internal Exported for testing */
export function detectConfigChanges(
  oldConfig: ProjectConfig | null,
  wizardResult: WizardResultV2,
): ConfigChanges {
  const oldSkillIds = oldConfig?.skills?.map((s) => s.id) ?? [];
  const newSkillIds = wizardResult.skills.map((s) => s.id);
  const oldAgentNames = oldConfig?.agents?.map((a) => a.name) ?? [];
  const newAgentNames = wizardResult.agentConfigs.map((a) => a.name);

  const oldSkillsById = indexBy(oldConfig?.skills ?? [], (s) => s.id);
  const oldAgentsByName = indexBy(oldConfig?.agents ?? [], (a) => a.name);

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
    scopeChanges: detectPropertyChanges(
      wizardResult.skills,
      oldSkillsById,
      (s) => s.id,
      (s) => s.scope,
    ),
    agentScopeChanges: detectPropertyChanges(
      wizardResult.agentConfigs,
      oldAgentsByName,
      (a) => a.name,
      (a) => a.scope,
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
  scopeChanges: Map<SkillId, { from: "project" | "global"; to: "project" | "global" }>,
  skills: Array<{ id: SkillId; source: string }>,
  marketplace: string,
  projectDir: string,
): Promise<PluginScopeMigrationResult> {
  const migrated: SkillId[] = [];
  const failed: PluginScopeMigrationResult["failed"] = [];

  for (const [skillId, change] of scopeChanges) {
    const skillConfig = skills.find((s) => s.id === skillId);
    if (!skillConfig || skillConfig.source === "eject") {
      continue;
    }

    const newPluginScope = change.to === "global" ? "user" : "project";
    const pluginRef = `${skillId}@${marketplace}`;

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
