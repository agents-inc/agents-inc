import React from "react";
import { isDeepEqual, unique, uniqueBy } from "remeda";
import os from "os";
import path from "path";
import { z } from "zod";

import { Flags } from "@oclif/core";
import { blankGlobalConfig } from "@workspace/compile/global-config";

import { BaseCommand } from "../base-command";
import { Confirm } from "../components/common/confirm.js";
import { promptConfirm } from "../components/common/prompt-confirm.js";
import { summaryPanelBlock, type SummaryPanelProps } from "../components/common/summary-panel.js";
import { getErrorMessage } from "../utils/errors";
import {
  directoryExists,
  fileExists,
  jsonFileMatches,
  listDirectories,
  remove,
  removeDirIfEmpty,
} from "../utils/fs";
import { plural } from "../utils/string";
import { filterExcludedEntries, listAgentFilesOf, splitAgentsByProvenance } from "../lib/agents";
import { hostAt } from "../lib/hosts/host-for.js";
import {
  codexProjectUntrustMessage,
  untrustCodexProject,
} from "../lib/hosts/codex-project-trust.js";
import {
  projectFoldersAnUninstallMayEmpty,
  removeIfHoldingNothing,
} from "../lib/hosts/host-files-left-empty.js";
import type { PluginHost, PluginRemovalOutcome } from "../lib/hosts/plugin-host.js";
import {
  listPluginNames,
  getProjectPluginsDir,
  buildMarketplacePluginRef,
  parseMarketplacePluginRef,
} from "../lib/plugins/index";
import { type LocalSkillMetadata, readLocalSkillMetadata } from "../lib/skills/skill-metadata";
import { isHomeDirectory, resolveInstallPaths, scopeAt } from "../lib/installation/index";
import {
  lazyGateDeps,
  mutateGlobal,
  propagateGlobalRemoval,
  type GateReport,
} from "../lib/config-gate/index.js";
import { loadSkillsMatrixFromSource } from "../lib/loading";
import { loadAgentDefs } from "../lib/operations";
import { SCOPE_OF_AN_UNRECORDED_SKILL } from "../lib/operations/skills/uninstall-plugin-skills.js";
import {
  ConfigLoadError,
  loadProjectConfigAt,
  loadProjectConfigFromDir,
} from "../lib/configuration/project-config";
import type { Provider } from "../consts";
import { DEFAULT_BRANDING, EJECT_SOURCE, STANDARD_FILES } from "../consts";
import {
  declaresNoContent,
  providerInUse,
  agentCodec,
  type AgentCodec,
  sourceFolderInUse,
  sourceRootOf,
  type SourceRoot,
} from "../lib/installation/install-layout.js";
import { providerFlag, providerNamedBy } from "../lib/installation/provider-flag.js";
import { isActiveAt } from "../lib/configuration/scope-predicates.js";
import { isAgentName } from "../utils/type-guards.js";
import { EXIT_CODES } from "../lib/exit-codes";
import {
  SUCCESS_MESSAGES,
  INFO_MESSAGES,
  configFileRemoved,
  notInstalledHere,
  pluginLeftRegistered,
  unmarkedAgentsKept,
  registeredProjectsUpdated,
  registeredProjectUpdateSkipped,
  registeredProjectsUpdateFailed,
  uninstallConfigUnreadable,
  uninstallNeedsTerminal,
  uninstallSkillMetadataUnreadable,
} from "../utils/messages";
import type {
  AgentDefinition,
  AgentName,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillId,
} from "../types/index";
import type { AgentScopeConfig, SkillConfig, SkillScope } from "../types/config";

/** Paths and names, never display strings, so the preview and the removal read one value. */
type RemovalEntry =
  | { kind: "plugins"; pluginsDir: string; names: string[] }
  | { kind: "skills"; skillsDir: string; skillNames: string[] }
  | { kind: "agents"; agentsDir: string; agentNames: string[]; codec: AgentCodec }
  | { kind: "config"; sourceDir: string; fileNames: string[] };

type PluginRemoval = Extract<RemovalEntry, { kind: "plugins" }>;
type SkillsRemoval = Extract<RemovalEntry, { kind: "skills" }>;
type AgentsRemoval = Extract<RemovalEntry, { kind: "agents" }>;
type ConfigManifestRemoval = Extract<RemovalEntry, { kind: "config" }>;

type RemovalPlan = {
  entries: RemovalEntry[];
  kept: string[];
};

function buildRemovalPlan(target: UninstallTarget): RemovalPlan {
  const agents = compiledAgentsEntry(target);

  return {
    entries: [
      ...pluginsEntry(target),
      ...localSkillsEntry(target),
      ...agents,
      ...configManifestEntries(target),
    ],
    kept: keptStatements(target, agents),
  };
}

/**
 * Its rows are the plan's, never the config's, so the panel names no removal the run will not
 * make. In a project the global entries its config copies stay, so they show as kept. The header
 * names the marketplace of what the run removes, or, removing no skill, of what it keeps.
 */
function removalPanel(plan: RemovalPlan, target: UninstallTarget): SummaryPanelProps {
  const kept = target.scope === "project" ? globalEntriesOf(target.config) : nothingKept();
  const removed = removedSkills(plan, target);
  return {
    skillConfigs: kept.skills,
    agentConfigs: kept.agents,
    installedSkillConfigs: [...removed, ...kept.skills],
    installedAgentConfigs: [...namedAgentRemovals(plan, target.scope).named, ...kept.agents],
    isInitMode: false,
    stackName: undefined,
    headerSkillConfigs: removed.length > 0 ? removed : kept.skills,
  };
}

type PanelEntries = { skills: SkillConfig[]; agents: AgentScopeConfig[] };

function nothingKept(): PanelEntries {
  return { skills: [], agents: [] };
}

function globalEntriesOf(config: ProjectConfig | null): PanelEntries {
  if (config === null) return nothingKept();
  return {
    skills: config.skills.filter((skill) => isActiveAt(skill, "global")),
    agents: config.agents.filter((agent) => isActiveAt(agent, "global")),
  };
}

/**
 * A copy by the skill its provenance records; a plugin by the config skill it was matched against.
 * One row a skill: a skill registered under two marketplaces' names is still one skill.
 */
function removedSkills(plan: RemovalPlan, target: UninstallTarget): SkillConfig[] {
  const copied = new Set(planEntries(plan, "skills").flatMap((entry) => entry.skillNames));
  const plugins = new Set(planEntries(plan, "plugins").flatMap((entry) => entry.names));
  const marketplaceName = target.config?.marketplaceName;
  const copies = target.cliSkills
    .filter(({ dirName }) => copied.has(dirName))
    .map((copy) => copyEntryOf(copy, target.scope));
  const pluginSkills = (target.config?.skills ?? [])
    .filter((skill) => !skill.excluded)
    .filter((skill) => pluginRefsOf(skill, marketplaceName).some((ref) => plugins.has(ref)))
    .map((skill) => ({ ...skill, scope: target.scope }));

  return uniqueBy([...copies, ...pluginSkills], (skill) => skill.id);
}

/** Drawn from disk, not config, so its row is named by the copy's own metadata.yaml. */
function copyEntryOf({ skillId, displayName }: CliSkill, scope: SkillScope): SkillConfig {
  return {
    id: skillId,
    scope,
    origin: EJECT_SOURCE,
    ...(displayName !== undefined && { displayName }),
  };
}

/** A compiled file whose name no sub-agent carries is named by its path instead. */
function namedAgentRemovals(
  plan: RemovalPlan,
  scope: SkillScope,
): { named: AgentScopeConfig[]; files: string[] } {
  const entries = planEntries(plan, "agents");
  const names = entries.flatMap((entry) => entry.agentNames);
  return {
    named: names.filter(isAgentName).map((name) => ({ name, scope })),
    files: entries.flatMap((entry) =>
      entry.agentNames
        .filter((name) => !isAgentName(name))
        .map((name) => path.join(entry.agentsDir, `${name}${entry.codec.extension}`)),
    ),
  };
}

function hasAnythingToRemove(plan: RemovalPlan): boolean {
  return plan.entries.length > 0;
}

/** The files the plan deletes that the panel has no row for, marked as it marks a removal. */
function removedFileLines(plan: RemovalPlan, scope: SkillScope): string[] {
  const configFiles = planEntries(plan, "config").flatMap((entry) =>
    entry.fileNames.map((fileName) => `${entry.sourceDir}/${fileName}`),
  );
  return [...namedAgentRemovals(plan, scope).files, ...configFiles].map(configFileRemoved);
}

function pluginsEntry(target: UninstallTarget): PluginRemoval[] {
  if (!target.hasPlugins) return [];
  return [{ kind: "plugins", pluginsDir: target.pluginsDir, names: [...target.cliPluginNames] }];
}

function localSkillsEntry(target: UninstallTarget): SkillsRemoval[] {
  if (target.cliSkills.length === 0) return [];
  return [
    {
      kind: "skills",
      skillsDir: target.skillsDir,
      skillNames: target.cliSkills.map(({ dirName }) => dirName),
    },
  ];
}

function compiledAgentsEntry(target: UninstallTarget): AgentsRemoval[] {
  const agentNames = identifiableAgents(target);
  if (agentNames.length === 0) return [];

  return [{ kind: "agents", agentsDir: target.agentsDir, agentNames, codec: target.agentCodec }];
}

/**
 * Only those with a file here, so the plan names no removal the run will not make: the config's
 * roster (pre-marker installs carry no marker) and every provenance-marked file, each once.
 */
function identifiableAgents(target: UninstallTarget): string[] {
  const agentFiles = new Set([...target.markedAgents, ...target.unmarkedAgents]);
  const configuredWithAFile = target.configuredAgents.filter((name) => agentFiles.has(name));
  return unique([...configuredWithAFile, ...target.markedAgents]);
}

function configManifestEntries(target: UninstallTarget): ConfigManifestRemoval[] {
  const { dir, manifestFiles } = target.sourceFolder;
  if (manifestFiles.length === 0) return [];
  return [{ kind: "config", sourceDir: dir, fileNames: manifestFiles }];
}

/** Derived from the removal, so no agent can be both removed and kept. */
function keptStatements(target: UninstallTarget, agentRemovals: AgentsRemoval[]): string[] {
  const removing = new Set(agentRemovals.flatMap((entry) => entry.agentNames));
  const kept = target.unmarkedAgents.filter((name) => !removing.has(name));
  if (kept.length === 0) return [];
  return [unmarkedAgentsKept(target.agentsDir, kept.length)];
}

function planEntries<K extends RemovalEntry["kind"]>(
  plan: RemovalPlan,
  kind: K,
): Extract<RemovalEntry, { kind: K }>[] {
  return plan.entries.filter(
    (entry): entry is Extract<RemovalEntry, { kind: K }> => entry.kind === kind,
  );
}

function planEntry<K extends RemovalEntry["kind"]>(
  plan: RemovalPlan,
  kind: K,
): Extract<RemovalEntry, { kind: K }> | undefined {
  return plan.entries.find(
    (entry): entry is Extract<RemovalEntry, { kind: K }> => entry.kind === kind,
  );
}

const UNINSTALL_CONFIRM_MESSAGE = "Are you sure you want to uninstall?";

export default class Uninstall extends BaseCommand {
  /** Replaced in `run` before anything prints. */
  private brandingName: string = DEFAULT_BRANDING.NAME;

  static summary = `Remove ${DEFAULT_BRANDING.NAME} from this project`;

  static description = `Uninstall ${DEFAULT_BRANDING.NAME} from this project. Removes CLI-managed skills (matched by marketplace), compiled agents, plugins, and the config manifest (config.ts + config-types.ts) this project keeps. User-created content is preserved.`;

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --yes",
  ];

  static flags = {
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
    provider: providerFlag(),
  };

  protected async ensureTerminalSize(): Promise<void> {
    // Any size: uninstall is the way out of every state.
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Uninstall);
    const projectDir = process.cwd();
    const namedProvider = providerNamedBy(flags.provider);

    // Before anything is detected: removing the wrong one of two installations is destructive.
    await this.refuseAnAmbiguousInstallation(projectDir, "uninstall", namedProvider);

    this.brandingName = await this.resolveBrandingName(projectDir);

    this.printHeader();

    const target = await detectUninstallTarget(projectDir, {
      onConfigLoadFailed: (failure) => this.warn(uninstallConfigUnreadable(failure)),
      // Aborts: guessing would either remove the user's skill or keep this CLI's.
      onSkillMetadataUnreadable: (metadataPath) =>
        this.error(uninstallSkillMetadataUnreadable(metadataPath), { exit: EXIT_CODES.ERROR }),
    });
    const plan = buildRemovalPlan(target);
    if (!hasAnythingToRemove(plan)) {
      await this.reportNothingToUninstall();
      return;
    }

    const approved = await this.removalApproved(plan, target, flags.yes, namedProvider);
    if (!approved) this.cancelUninstall();

    await this.executeUninstall(plan, target, projectDir);
    this.reportSuccess();
  }

  private printHeader(): void {
    this.log("");
    this.log(`${this.brandingName} Uninstall`);
    this.log("");
  }

  /** Says the line only here: a config declaring nothing can sit beside this CLI's copies. */
  private async reportNothingToUninstall(): Promise<void> {
    await this.sayWhenTheProjectsConfigDeclaresNothing(INFO_MESSAGES.DECLARES_NOTHING_TO_UNINSTALL);
    this.warn("Nothing to uninstall.");
    this.log("");
    this.log(notInstalledHere(this.brandingName));
    this.log("");
    this.log(INFO_MESSAGES.NO_CHANGES_MADE);
  }

  /** With `--yes` nothing is asked, so the plan prints where the question would be. */
  private async removalApproved(
    plan: RemovalPlan,
    target: UninstallTarget,
    skipConfirmation: boolean,
    namedProvider: Provider | undefined,
  ): Promise<boolean> {
    if (!skipConfirmation) return this.confirmRemoval(plan, target, namedProvider);

    this.showRemovalPlan(plan, target);
    return true;
  }

  private cancelUninstall(): never {
    this.log("");
    this.log("Uninstall cancelled");
    this.exit(EXIT_CODES.CANCELLED);
  }

  private showRemovalPlan(plan: RemovalPlan, target: UninstallTarget): void {
    const lines = summaryPanelBlock(
      removalPanel(plan, target),
      removedFileLines(plan, target.scope),
      plan.kept,
    );
    for (const line of lines) {
      this.log(line);
    }
  }

  private async confirmRemoval(
    plan: RemovalPlan,
    target: UninstallTarget,
    namedProvider: Provider | undefined,
  ): Promise<boolean> {
    // A confirm nobody can answer must never become a yes.
    if (!process.stdin.isTTY) {
      this.error(uninstallNeedsTerminal(namedProvider), { exit: EXIT_CODES.ERROR });
    }

    this.showRemovalPlan(plan, target);
    const outcome = await promptConfirm(({ onConfirm, onCancel }) => (
      <Confirm message={UNINSTALL_CONFIRM_MESSAGE} onConfirm={onConfirm} onCancel={onCancel} />
    ));
    return outcome === "confirmed";
  }

  private async executeUninstall(
    plan: RemovalPlan,
    target: UninstallTarget,
    projectDir: string,
  ): Promise<void> {
    const isGlobalUninstall = isHomeDirectory(projectDir);
    // Before any removal: the registry and source live in the global config about to be deleted.
    const propagation = isGlobalUninstall
      ? await this.prepareGlobalPropagation(target, projectDir)
      : null;

    await this.removePlannedPlugins(planEntry(plan, "plugins"), target, projectDir);
    await this.removeLocalFilesOrFail(plan, target);

    if (!isGlobalUninstall) {
      if (target.provider === "codex") await this.untrustTheCodexProject(projectDir);
      await this.deregisterProject(projectDir, target.provider);
      return;
    }
    if (propagation) await this.updateRegisteredProjects(propagation);
  }

  /** Degrades as {@link deregisterProject} does: the installation is already gone. */
  private async untrustTheCodexProject(projectDir: string): Promise<void> {
    try {
      const removal = await untrustCodexProject(projectDir);
      const said = codexProjectUntrustMessage(projectDir, removal);
      if (said !== undefined) this.log(said);
      if (removal.kind === "trust removed") {
        await this.removeCodexConfigLeftEmpty(removal.configFile);
      }
    } catch (error) {
      this.warn(
        `Could not remove this project's trust from your Codex configuration: ${getErrorMessage(error)}`,
      );
    }
  }

  /** Its own degrade, since the trust is already out. */
  private async removeCodexConfigLeftEmpty(configFile: string): Promise<void> {
    try {
      await removeIfHoldingNothing(configFile);
    } catch (error) {
      this.warn(
        `Could not remove ${configFile}, which now holds nothing: ${getErrorMessage(error)}`,
      );
    }
  }

  /** Degrades: a missing or corrupt global config must never fail the uninstall. */
  private async deregisterProject(projectDir: string, provider: Provider): Promise<void> {
    try {
      // Lazy deps: deregistering inlines nothing, so the uninstall stays offline.
      await mutateGlobal(
        { kind: "deregister-project", projectDir, provider },
        lazyGateDeps(projectDir),
      );
      await removeTheHomeConfigListingNothing(provider);
    } catch (error) {
      this.warn(`Could not update the global project registry: ${getErrorMessage(error)}`);
    }
  }

  /**
   * A load failure warns and never aborts. `skipExtraSources` cannot change the output (extra
   * sources only annotate skills) and keeps the uninstall off the network.
   */
  private async prepareGlobalPropagation(
    target: UninstallTarget,
    projectDir: string,
  ): Promise<GlobalPropagationData | null> {
    if (target.config === null || target.registeredProjects.length === 0) return null;
    const globalConfig = target.config;

    try {
      const [sourceResult, agentDefs] = await Promise.all([
        loadSkillsMatrixFromSource({
          projectDir,
          purpose: "upkeep",
          skipExtraSources: true,
          matrixOnly: true,
        }),
        loadAgentDefs(),
      ]);
      return {
        globalConfig,
        matrix: sourceResult.matrix,
        agents: agentDefs.agents,
        provider: providerInUse(projectDir),
      };
    } catch (error) {
      this.warn(registeredProjectsUpdateFailed(getErrorMessage(error)));
      return null;
    }
  }

  /** Runs after the global manifest is gone, so regenerated types use the standalone form. */
  private async updateRegisteredProjects(propagation: GlobalPropagationData): Promise<void> {
    try {
      const report = await propagateGlobalRemoval(
        propagation.globalConfig,
        { matrix: propagation.matrix, agents: propagation.agents },
        propagation.provider,
      );
      this.reportRegisteredProjectsUpdate(report);
    } catch (error) {
      this.warn(registeredProjectsUpdateFailed(getErrorMessage(error)));
    }
  }

  private reportRegisteredProjectsUpdate(report: GateReport): void {
    const { updated, unreadable, failed } = report.propagated;
    this.reportProjectsOutOfReach(report.propagated);
    for (const skippedPath of [...unreadable, ...failed]) {
      this.warn(registeredProjectUpdateSkipped(skippedPath));
    }
    if (updated.length === 0) return;

    this.logSuccess(registeredProjectsUpdated(updated.length));
    this.reportPropagatedRecompile(report);
  }

  private reportSuccess(): void {
    this.log("");
    this.log(`${this.brandingName} has been uninstalled.`);
    this.log("");
    this.logSuccess(SUCCESS_MESSAGES.UNINSTALL_COMPLETE);
    this.log("");
  }

  private async removeLocalFilesOrFail(plan: RemovalPlan, target: UninstallTarget): Promise<void> {
    try {
      await this.removeLocalFiles(plan, target);
    } catch (error) {
      this.log("Failed to remove local files");
      this.error(getErrorMessage(error), {
        exit: EXIT_CODES.ERROR,
      });
    }
  }

  private async removeLocalFiles(plan: RemovalPlan, target: UninstallTarget): Promise<void> {
    await this.removePlannedSkills(planEntry(plan, "skills"));
    await this.removePlannedAgents(planEntry(plan, "agents"));

    for (const statement of plan.kept) {
      this.log(statement);
    }

    const cleanup = await cleanupEmptyDirs(target, planEntries(plan, "config"));

    this.reportSourceFolderCleanup(cleanup.sourceFolder);
    this.reportDirCleanup(target.sourceRoot.relName, cleanup.sourceRoot);
    for (const { dir, outcome } of cleanup.hostFolders) {
      this.reportDirCleanup(path.basename(dir), outcome);
    }
  }

  private reportSourceFolderCleanup({ relName, outcome }: SourceFolderCleanup): void {
    if (outcome === "config-removed") {
      this.logSuccess(`Removed CLI config from ${relName}/`);
      return;
    }
    this.reportDirCleanup(relName, outcome);
  }

  private reportDirCleanup(relName: string, cleanup: DirCleanup): void {
    switch (cleanup) {
      case "removed":
        this.logSuccess(`Removed ${relName}/`);
        return;
      case "kept":
        this.log(`Kept ${relName}/ (contains user content)`);
        return;
      case "untouched":
        return;
      default: {
        const _exhaustive: never = cleanup;
        return _exhaustive;
      }
    }
  }

  private async removePlannedPlugins(
    entry: PluginRemoval | undefined,
    target: PluginFiling,
    projectDir: string,
  ): Promise<void> {
    if (!entry) return;

    this.log("Uninstalling plugins...");

    try {
      const pluginResult = await uninstallPlugins(entry, target, projectDir, {
        onUninstalled: (name) => this.log(`  Uninstalled plugin '${name}'`),
        onLeftRegistered: (name, provider) => this.warn(pluginLeftRegistered(name, provider)),
      });

      // Silent on zero: "0" beside a plan that named one reads as a failure, and is not one.
      if (pluginResult.totalUninstalled > 0) {
        this.logSuccess(`Uninstalled ${plural(pluginResult.totalUninstalled, "plugin")}`);
      }
    } catch (error) {
      this.log("Plugin uninstall failed");
      this.error(getErrorMessage(error), {
        exit: EXIT_CODES.ERROR,
      });
    }
  }

  private async removePlannedSkills(entry: SkillsRemoval | undefined): Promise<void> {
    if (!entry) return;

    const removedNames = await removeMatchingSkills(entry, (dirName) =>
      this.log(`  Uninstalled skill '${dirName}'`),
    );
    if (removedNames.length === 0) return;

    this.logSuccess(`Removed ${plural(removedNames.length, "CLI-installed skill")}`);
  }

  private async removePlannedAgents(entry: AgentsRemoval | undefined): Promise<void> {
    if (!entry) return;

    const removedNames = await removeMatchingAgents(entry, (agentName) =>
      this.log(`  Uninstalled agent '${agentName}'`),
    );
    if (removedNames.length === 0) return;

    this.logSuccess(`Removed ${plural(removedNames.length, "compiled agent")}`);
  }
}

/** A skill folder this CLI installed: removed by its folder, shown by the skill and name it records. */
type CliSkill = { dirName: string; skillId: SkillId; displayName: string | undefined };

type UninstallTarget = {
  /** Home is the global scope, so a run there removes global entries. */
  scope: SkillScope;
  /** Read before removal, which deletes the folder that says which. */
  provider: Provider;
  hasPlugins: boolean;
  /** Only those this CLI installed, matched against config skills. */
  cliPluginNames: string[];
  /** Carrying `forkedFrom`: this CLI installed them. The rest are the user's, never removed. */
  cliSkills: CliSkill[];
  /** Left registered at the global scope by a project run: the global installation uses them. */
  pluginsTheGlobalHolds: ReadonlySet<string>;
  pluginsDir: string;
  skillsDir: string;
  agentsDir: string;
  agentCodec: AgentCodec;
  /** The provider's own, never another host's, and only those there before the run. */
  hostFolders: string[];
  sourceFolder: ScopeSourceFolder;
  sourceRoot: SourceRoot;
  config: ProjectConfig | null;
  registeredProjects: string[];
  configuredAgents: AgentName[];
  markedAgents: string[];
  /** The user's, unless the config claims them. */
  unmarkedAgents: string[];
};

type ScopeSourceFolder = {
  dir: string;
  relName: string;
  manifestFiles: string[];
  /** `null` when absent, unreadable, or a project's declaring nothing. */
  config: ProjectConfig | null;
};

/** Captured before removal: all of it comes from the config and folder being deleted. */
type GlobalPropagationData = {
  globalConfig: ProjectConfig;
  matrix: MergedSkillsMatrix;
  agents: Partial<Record<AgentName, AgentDefinition>>;
  provider: Provider;
};

type UninstallPluginsResult = {
  totalUninstalled: number;
};

type PluginFiling = Pick<UninstallTarget, "config" | "pluginsTheGlobalHolds">;

type PluginRemovalReporter = {
  onUninstalled?: (pluginName: string) => void;
  /** No host CLI to ask, so the plugin's registration outlives its folder. */
  onLeftRegistered?: (pluginName: string, provider: Provider) => void;
};

/** `kept`: still there because of content this CLI never wrote. */
type DirCleanup = "removed" | "kept" | "untouched";

/** `config-removed`: the manifest went, and the folder stayed for what else it holds. */
type SourceFolderCleanup = { relName: string; outcome: DirCleanup | "config-removed" };

type HostFolderCleanup = { dir: string; outcome: DirCleanup };

type CleanupResult = {
  sourceFolder: SourceFolderCleanup;
  sourceRoot: DirCleanup;
  hostFolders: HostFolderCleanup[];
};

function collectConfiguredAgents(config: Partial<ProjectConfig> | null): AgentName[] {
  if (!config?.agents) return [];
  return config.agents.map((a) => a.name);
}

function getCliInstalledPluginKeys(config: Partial<ProjectConfig> | null): Set<string> {
  if (!config?.skills) return new Set();
  const { marketplaceName } = config;
  return new Set(config.skills.flatMap((skill) => pluginRefsOf(skill, marketplaceName)));
}

function pluginRefsOf(skill: SkillConfig, marketplaceName: string | undefined): string[] {
  const ownRef = buildMarketplacePluginRef(skill.id, skill.origin);
  if (!marketplaceName || skill.origin === marketplaceName || skill.origin === EJECT_SOURCE) {
    return [ownRef];
  }
  // Installed via the marketplace while `origin` names something else.
  return [ownRef, buildMarketplacePluginRef(skill.id, marketplaceName)];
}

/**
 * Degrades: a `ConfigLoadError` is reported and treated as a missing config, since that is when a
 * user needs to uninstall. Any other failure propagates.
 */
async function loadUninstallConfig(
  configPath: string,
  projectDir: string,
  provider: Provider,
  onLoadFailed: (failure: ConfigLoadError) => void,
): Promise<ProjectConfig | null> {
  try {
    const result = await loadProjectConfigAt(configPath, projectDir, provider);
    return result?.config ?? null;
  } catch (error) {
    if (!(error instanceof ConfigLoadError)) throw error;
    onLoadFailed(error);
    return null;
  }
}

/**
 * Its config is read under {@link loadUninstallConfig}'s degrade posture. A project's config
 * declaring nothing is not an installation: the file is the user's, so the folder holds nothing
 * of this run's to remove. HOME's is the global manifest however empty.
 */
async function readSourceFolder(
  folder: Pick<ScopeSourceFolder, "dir" | "relName">,
  projectDir: string,
  provider: Provider,
  onConfigLoadFailed: (failure: ConfigLoadError) => void,
): Promise<ScopeSourceFolder> {
  const [manifestFiles, config] = await Promise.all([
    manifestFilesIn(folder.dir),
    loadUninstallConfig(
      path.join(folder.dir, STANDARD_FILES.CONFIG_TS),
      projectDir,
      provider,
      onConfigLoadFailed,
    ),
  ]);
  const isTheUsersFile =
    config !== null && declaresNoContent(config) && !isHomeDirectory(projectDir);
  if (isTheUsersFile) return { ...folder, manifestFiles: [], config: null };

  return { ...folder, manifestFiles, config };
}

async function manifestFilesIn(dir: string): Promise<string[]> {
  const manifest = [STANDARD_FILES.CONFIG_TS, STANDARD_FILES.CONFIG_TYPES_TS];
  const present = await Promise.all(
    manifest.map((fileName) => fileExists(path.join(dir, fileName))),
  );
  return manifest.filter((_, index) => present[index]);
}

type DetectionFailureHandlers = {
  /** Degrades: see {@link loadUninstallConfig}. */
  onConfigLoadFailed: (failure: ConfigLoadError) => void;
  onSkillMetadataUnreadable: (metadataPath: string) => never;
};

async function detectUninstallTarget(
  projectDir: string,
  handlers: DetectionFailureHandlers,
): Promise<UninstallTarget> {
  const pluginsDir = getProjectPluginsDir(projectDir);
  // At HOME the installation is the global one, whose copies a host may keep apart ($CODEX_HOME).
  const scope = scopeAt(projectDir);
  const { skillsDir, agentsDir } = resolveInstallPaths(projectDir, scope);
  const provider = providerInUse(projectDir);
  const codec = agentCodec(provider);

  const [cliSkills, hostFolders, sourceFolder, agentProvenance] = await Promise.all([
    skillsThisCliInstalled(skillsDir, handlers.onSkillMetadataUnreadable),
    hostFoldersAt(projectDir, provider),
    readSourceFolder(
      sourceFolderInUse(projectDir, provider),
      projectDir,
      provider,
      handlers.onConfigLoadFailed,
    ),
    splitAgentsByProvenance(agentsDir, codec),
  ]);

  const { config } = sourceFolder;
  const activeConfig = config === null ? null : filterExcludedEntries(config);
  const cliPluginNames = await pluginsThisRunRemoves(projectDir, activeConfig);

  return {
    scope,
    provider,
    hasPlugins: cliPluginNames.length > 0,
    cliPluginNames,
    cliSkills,
    pluginsTheGlobalHolds: await pluginsTheGlobalInstallationHolds(
      projectDir,
      provider,
      cliPluginNames,
      handlers.onConfigLoadFailed,
    ),
    pluginsDir,
    skillsDir,
    agentsDir,
    hostFolders,
    sourceFolder,
    sourceRoot: sourceRootOf(projectDir),
    config,
    registeredProjects: config?.projects ?? [],
    configuredAgents: collectConfiguredAgents(activeConfig),
    agentCodec: codec,
    markedAgents: agentProvenance.marked,
    unmarkedAgents: agentProvenance.unmarked,
  };
}

async function pluginsThisRunRemoves(
  projectDir: string,
  activeConfig: ProjectConfig | null,
): Promise<string[]> {
  const installed = await listPluginNames(projectDir);
  if (!thisRunOwnsAnyPlugin(projectDir)) return [];

  const cliInstalledKeys = getCliInstalledPluginKeys(activeConfig);
  return installed.filter((name) => cliInstalledKeys.has(name));
}

/**
 * A host without project-scoped plugins (Codex) shares them machine-wide, so a project uninstall
 * there must not sweep them. A global uninstall owns them on any host.
 */
function thisRunOwnsAnyPlugin(projectDir: string): boolean {
  if (isHomeDirectory(projectDir)) return true;
  return hostAt(projectDir).installsProjectScopedPlugins;
}

/**
 * Read from the global config itself, not the project's inlined copy. Unreadable, it may hold any
 * of them, so none is unregistered there.
 */
async function pluginsTheGlobalInstallationHolds(
  projectDir: string,
  provider: Provider,
  pluginNames: readonly string[],
  onConfigLoadFailed: (failure: ConfigLoadError) => void,
): Promise<ReadonlySet<string>> {
  if (isHomeDirectory(projectDir) || pluginNames.length === 0) return new Set();

  try {
    const global = await loadProjectConfigFromDir(os.homedir(), provider);
    if (global === null) return new Set();
    const held = getCliInstalledPluginKeys(filterExcludedEntries(global.config));
    return new Set(pluginNames.filter((name) => held.has(name)));
  } catch (error) {
    if (!(error instanceof ConfigLoadError)) throw error;
    onConfigLoadFailed(error);
    return new Set(pluginNames);
  }
}

async function hostFoldersAt(projectDir: string, provider: Provider): Promise<string[]> {
  const folders = projectFoldersAnUninstallMayEmpty(provider, projectDir);
  const present = await Promise.all(folders.map(directoryExists));
  return folders.filter((_, at) => present[at]);
}

/** Read before the plan is built, so the plan and the removal read one classification. */
async function skillsThisCliInstalled(
  skillsDir: string,
  onMetadataUnreadable: (metadataPath: string) => never,
): Promise<CliSkill[]> {
  const dirNames = await listDirectories(skillsDir);
  const skills = await Promise.all(
    dirNames.map(async (dirName) => ({
      dirName,
      metadata: await readCopyMetadata(skillsDir, dirName, onMetadataUnreadable),
    })),
  );
  return skills.flatMap(({ dirName, metadata }) =>
    metadata?.forkedFrom === undefined
      ? []
      : [{ dirName, skillId: metadata.forkedFrom.skillId, displayName: recordedName(metadata) }],
  );
}

/** Only for the panel: a copy naming itself no way is drawn by the catalogue's name, or its id. */
function recordedName(metadata: LocalSkillMetadata): string | undefined {
  return typeof metadata.displayName === "string" ? metadata.displayName : undefined;
}

/**
 * A metadata.yaml that reads but does not parse is the user's (warned); one found but unreadable
 * aborts. A skill folder that cannot be opened hides its metadata.yaml (`fileExists` answers
 * false on EACCES), so that skill reads as the user's and is kept, even when this CLI made it.
 */
async function readCopyMetadata(
  skillsDir: string,
  dirName: string,
  onUnreadable: (metadataPath: string) => never,
): Promise<LocalSkillMetadata | null> {
  const skillDir = path.join(skillsDir, dirName);
  try {
    return await readLocalSkillMetadata(skillDir);
  } catch {
    // Cause dropped on purpose: the stop names the file and the fix only, and uninstall has no
    // --verbose to carry it.
    return onUnreadable(path.join(skillDir, STANDARD_FILES.METADATA_YAML));
  }
}

/** The planned skills still there: the count is what the run removed, not what it planned. */
async function removeMatchingSkills(
  entry: SkillsRemoval,
  onRemoved: (dirName: string) => void,
): Promise<string[]> {
  const present = await listDirectories(entry.skillsDir);
  const removedNames = present.filter((name) => entry.skillNames.includes(name));

  for (const name of removedNames) {
    await remove(path.join(entry.skillsDir, name));
    onRemoved(name);
  }
  return removedNames;
}

async function removeMatchingAgents(
  entry: AgentsRemoval,
  onRemoved: (agentName: string) => void,
): Promise<string[]> {
  const agentFiles = await listAgentFiles(entry.agentsDir, entry.codec);
  const removedNames = agentFiles
    .map((agentFile) => path.basename(agentFile, entry.codec.extension))
    .filter((agentName) => entry.agentNames.includes(agentName));

  for (const agentName of removedNames) {
    await remove(path.join(entry.agentsDir, `${agentName}${entry.codec.extension}`));
    onRemoved(agentName);
  }
  return removedNames;
}

/**
 * Every offered plugin scope, the config's first, since a re-scoped skill stays where installed;
 * bar the global scope while the global installation still holds the plugin.
 */
function pluginScopesToSweep(
  host: PluginHost,
  target: PluginFiling,
  pluginName: string,
): SkillScope[] {
  const primary = scopeThePluginIsFiledUnder(target.config, pluginName);
  const offered = host.offeredPlacements
    .filter((placement) => placement.mode === "plugin")
    .map((placement) => placement.scope)
    .filter((scope) => !theGlobalStillHoldsItAt(scope, target, pluginName));

  if (!offered.includes(primary)) return offered;
  return [primary, ...offered.filter((scope) => scope !== primary)];
}

function theGlobalStillHoldsItAt(
  scope: SkillScope,
  target: PluginFiling,
  pluginName: string,
): boolean {
  return scope === "global" && target.pluginsTheGlobalHolds.has(pluginName);
}

/** Failures are swallowed: the directory is deleted either way and files are already gone. */
async function removePluginWhereverItIsFiled(
  host: PluginHost,
  pluginRef: string,
  scopes: readonly SkillScope[],
  projectDir: string,
): Promise<PluginRemovalOutcome> {
  let outcome: PluginRemovalOutcome = "absent";

  for (const scope of scopes) {
    try {
      const swept = await host.uninstallPlugin(pluginRef, scope, projectDir);
      if (swept === "removed") outcome = "removed";
    } catch {
      // A throw is neither outcome, so `outcome` stays as the other scopes left it.
    }
  }

  return outcome;
}

/** `target` only says where each plugin is filed; the entry decides which go. */
async function uninstallPlugins(
  entry: PluginRemoval,
  target: PluginFiling,
  projectDir: string,
  { onUninstalled, onLeftRegistered }: PluginRemovalReporter = {},
): Promise<UninstallPluginsResult> {
  const host = hostAt(projectDir);
  const hostAvailable = await host.isAvailable();
  const observed: string[] = [];

  if (!hostAvailable) {
    for (const pluginName of entry.names) onLeftRegistered?.(pluginName, host.provider);
  }

  for (const pluginName of entry.names) {
    const removal = hostAvailable
      ? await removePluginWhereverItIsFiled(
          host,
          pluginName,
          pluginScopesToSweep(host, target, pluginName),
          projectDir,
        )
      : nothingWasObserved();

    await remove(path.join(entry.pluginsDir, pluginName));

    if (removal === "removed") {
      observed.push(pluginName);
      onUninstalled?.(pluginName);
    }
  }

  // Observed, not intended: Codex `plugin remove` exits 0 whether or not the plugin existed.
  return { totalUninstalled: observed.length };
}

/** A switched-off entry is not where it is filed: a project's marks the global one it overrides. */
function scopeThePluginIsFiledUnder(config: ProjectConfig | null, pluginName: string): SkillScope {
  const skillId = parseMarketplacePluginRef(pluginName);
  const filed = config?.skills.find((skill) => skill.id === skillId && !skill.excluded);
  return filed?.scope ?? SCOPE_OF_AN_UNRECORDED_SKILL;
}

function nothingWasObserved(): PluginRemovalOutcome {
  return "absent";
}

/** Whether there was a manifest to remove. */
async function removeConfigManifest(entry: ConfigManifestRemoval | undefined): Promise<boolean> {
  if (!entry) return false;

  await Promise.all(
    entry.fileNames.map((fileName) => remove(path.join(entry.sourceDir, fileName))),
  );
  return true;
}

/** Directories are not plan entries: each goes only once nothing of the user's is left in it. */
async function cleanupEmptyDirs(
  target: Pick<
    UninstallTarget,
    "provider" | "skillsDir" | "agentsDir" | "hostFolders" | "sourceRoot" | "sourceFolder"
  >,
  manifestEntries: readonly ConfigManifestRemoval[],
): Promise<CleanupResult> {
  // Whether or not the plan named a removal there: a folder holding nothing is no one's.
  await removeDirIfEmpty(target.skillsDir);
  await removeDirIfEmpty(target.agentsDir);

  const sourceFolder = await cleanupSourceFolder(
    target.sourceFolder,
    manifestEntries.find((entry) => entry.sourceDir === target.sourceFolder.dir),
  );
  const sourceRoot = await cleanupSourceRoot(target.sourceRoot, sourceFolder.outcome === "removed");
  const hostFolders = await Promise.all(
    target.hostFolders.map((dir) => cleanupHostFolder(dir, target.provider)),
  );

  return { sourceFolder, sourceRoot, hostFolders };
}

/** Says nothing: a home config listing nothing was never an installation the user asked for. */
async function removeTheHomeConfigListingNothing(provider: Provider): Promise<void> {
  const home = os.homedir();
  const loaded = await loadProjectConfigFromDir(home, provider);
  if (loaded === null || !listsNothing(loaded.config)) return;

  const folder = sourceFolderInUse(home, provider);
  const { outcome } = await cleanupSourceFolder(folder, await manifestRemovalIn(folder.dir));
  await cleanupSourceRoot(sourceRootOf(home), outcome === "removed");
}

/** Nothing beyond the blank config a project's install makes at home, once no project is on it. */
function listsNothing({ projects = [], ...rest }: ProjectConfig): boolean {
  return projects.length === 0 && isDeepEqual(rest, blankGlobalConfig());
}

async function manifestRemovalIn(sourceDir: string): Promise<ConfigManifestRemoval> {
  return { kind: "config", sourceDir, fileNames: await manifestFilesIn(sourceDir) };
}

/** `entry` names this folder: the plan's manifest removal for it, if it holds one. */
async function cleanupSourceFolder(
  folder: Pick<ScopeSourceFolder, "dir" | "relName">,
  entry: ConfigManifestRemoval | undefined,
): Promise<SourceFolderCleanup> {
  const manifestRemoved = await removeConfigManifest(entry);
  const dir = await removeDirUnlessUserContent(folder.dir);
  const outcome = manifestRemoved && dir !== "removed" ? "config-removed" : dir;
  return { relName: folder.relName, outcome };
}

/**
 * Only once the provider folder went, and only when empty: consuming repositories keep their own
 * state under `.agents-inc/`.
 */
async function cleanupSourceRoot(
  sourceRoot: SourceRoot,
  providerDirRemoved: boolean,
): Promise<DirCleanup> {
  if (!providerDirRemoved) return "untouched";
  return removeDirUnlessUserContent(sourceRoot.dir);
}

async function cleanupHostFolder(dir: string, provider: Provider): Promise<HostFolderCleanup> {
  if (provider === "claude") await removeAnEmptyPluginList(dir);
  return { dir, outcome: await removeDirUnlessUserContent(dir) };
}

/** Deleted even where the user wrote it, since it sets nothing. */
async function removeAnEmptyPluginList(claudeDir: string): Promise<void> {
  const settings = path.join(claudeDir, STANDARD_FILES.SETTINGS_JSON);
  if (await jsonFileMatches(settings, EMPTY_PLUGIN_LIST)) await remove(settings);
}

/** What Claude's plugin uninstall leaves once the last plugin goes; it sets nothing. */
const EMPTY_PLUGIN_LIST = z.strictObject({ enabledPlugins: z.strictObject({}) });

/** `kept` when it is still there: something of the user's is in it. */
async function removeDirUnlessUserContent(dir: string): Promise<DirCleanup> {
  if (await removeDirIfEmpty(dir)) return "removed";
  return (await directoryExists(dir)) ? "kept" : "untouched";
}

async function listAgentFiles(agentsDir: string, codec: AgentCodec): Promise<string[]> {
  try {
    return await listAgentFilesOf(agentsDir, codec);
  } catch {
    return [];
  }
}
