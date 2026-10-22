import React from "react";
import { unique } from "remeda";
import path from "path";

import { Flags } from "@oclif/core";

import { BaseCommand } from "../base-command";
import {
  RemovalPlanConfirm,
  type RemovalPlanSection,
} from "../components/common/removal-plan-confirm.js";
import { promptConfirm } from "../components/common/prompt-confirm.js";
import { getErrorMessage } from "../utils/errors";
import {
  directoryExists,
  fileExists,
  listDirectories,
  remove,
  removeDirIfEmpty,
} from "../utils/fs";
import { plural } from "../utils/string";
import { listAgentFilesOf, splitAgentsByProvenance } from "../lib/agents";
import { hostAt } from "../lib/hosts/host-for.js";
import type { PluginHost, PluginRemovalOutcome } from "../lib/hosts/plugin-host.js";
import {
  listPluginNames,
  getProjectPluginsDir,
  buildMarketplacePluginRef,
  parseMarketplacePluginRef,
} from "../lib/plugins/index";
import { type ForkedFromMetadata, readForkedFromMetadata } from "../lib/skills/index";
import { isHomeDirectory, resolveInstallPaths } from "../lib/installation/index";
import {
  lazyGateDeps,
  mutateGlobal,
  propagateGlobalRemoval,
  type GateReport,
} from "../lib/config-gate/index.js";
import { loadSkillsMatrixFromSource } from "../lib/loading";
import { loadAgentDefs } from "../lib/operations";
import { ConfigLoadError, loadProjectConfigAt } from "../lib/configuration/project-config";
import type { Provider } from "../consts";
import { CLAUDE_DIR, DEFAULT_BRANDING, EJECT_SOURCE, STANDARD_FILES } from "../consts";
import {
  providerInUse,
  agentCodec,
  type AgentCodec,
  sourceFolderInUse,
  sourceRootOf,
  type SourceRoot,
} from "../lib/installation/install-layout.js";
import {
  providerFlag,
  providerNamedBy,
  refuseAnAmbiguousInstallation,
} from "../lib/installation/provider-flag.js";
import { EXIT_CODES } from "../lib/exit-codes";
import {
  SUCCESS_MESSAGES,
  INFO_MESSAGES,
  UNINSTALL_PLAN,
  compiledAgentsRemoval,
  localSkillsRemoval,
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
import type { AgentDefinition, AgentName, MergedSkillsMatrix, ProjectConfig } from "../types/index";
import type { SkillConfig, SkillScope } from "../types/config";

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

function hasAnythingToRemove(plan: RemovalPlan): boolean {
  return plan.entries.length > 0;
}

function pluginsEntry(target: UninstallTarget): PluginRemoval[] {
  if (!target.hasPlugins) return [];
  return [{ kind: "plugins", pluginsDir: target.pluginsDir, names: [...target.cliPluginNames] }];
}

function localSkillsEntry(target: UninstallTarget): SkillsRemoval[] {
  if (target.cliSkills.length === 0) return [];
  return [{ kind: "skills", skillsDir: target.skillsDir, skillNames: [...target.cliSkills] }];
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

function describeEntry(entry: RemovalEntry): RemovalPlanSection {
  switch (entry.kind) {
    case "plugins":
      return { label: UNINSTALL_PLAN.PLUGINS_HEADING, items: entry.names };
    case "skills":
      return {
        label: UNINSTALL_PLAN.CLI_MANAGED_FILES_HEADING,
        items: [localSkillsRemoval(entry.skillsDir)],
      };
    case "agents":
      return {
        label: UNINSTALL_PLAN.CLI_MANAGED_FILES_HEADING,
        items: [compiledAgentsRemoval(entry.agentsDir)],
      };
    case "config":
      return {
        label: UNINSTALL_PLAN.CONFIG_HEADING,
        items: entry.fileNames.map((fileName) => `${entry.sourceDir}/${fileName}`),
      };
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}

const PLAN_SECTION_ORDER = [
  UNINSTALL_PLAN.PLUGINS_HEADING,
  UNINSTALL_PLAN.CLI_MANAGED_FILES_HEADING,
  UNINSTALL_PLAN.CONFIG_HEADING,
] as const;

/** Skills and compiled agents share a heading; a heading with no items is not printed. */
function planSections(entries: readonly RemovalEntry[]): RemovalPlanSection[] {
  const described = entries.map(describeEntry);

  return PLAN_SECTION_ORDER.flatMap((label) =>
    sectionWithItems(label, itemsUnder(described, label)),
  );
}

function itemsUnder(described: readonly RemovalPlanSection[], label: string): string[] {
  return described.filter((section) => section.label === label).flatMap((section) => section.items);
}

function sectionWithItems(label: string, items: string[]): RemovalPlanSection[] {
  if (items.length === 0) return [];
  return [{ label, items }];
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
    await refuseAnAmbiguousInstallation(projectDir, "uninstall", namedProvider, (message) =>
      this.error(message, { exit: EXIT_CODES.INVALID_ARGS }),
    );

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
      this.reportNothingToUninstall();
      return;
    }

    const approved = await this.removalApproved(plan, flags.yes, namedProvider);
    if (!approved) this.cancelUninstall();

    await this.executeUninstall(plan, target, projectDir);
    this.reportSuccess();
  }

  private printHeader(): void {
    this.log("");
    this.log(`${this.brandingName} Uninstall`);
    this.log("");
  }

  private reportNothingToUninstall(): void {
    this.warn("Nothing to uninstall.");
    this.log("");
    this.log(notInstalledHere(this.brandingName));
    this.log("");
    this.log(INFO_MESSAGES.NO_CHANGES_MADE);
  }

  private async removalApproved(
    plan: RemovalPlan,
    skipConfirmation: boolean,
    namedProvider: Provider | undefined,
  ): Promise<boolean> {
    if (!skipConfirmation) return this.confirmRemoval(plan, namedProvider);

    this.printRemovalPlan(plan);
    return true;
  }

  private cancelUninstall(): never {
    this.log("");
    this.log("Uninstall cancelled");
    this.exit(EXIT_CODES.CANCELLED);
  }

  private printRemovalPlan(plan: RemovalPlan): void {
    this.log(UNINSTALL_PLAN.PREVIEW_HEADING);
    this.log("");

    for (const section of planSections(plan.entries)) {
      this.log(`  ${section.label}`);
      for (const item of section.items) {
        this.log(`    ${item}`);
      }
    }

    for (const statement of plan.kept) {
      this.log("");
      this.log(statement);
    }

    this.log("");
  }

  private async confirmRemoval(
    plan: RemovalPlan,
    namedProvider: Provider | undefined,
  ): Promise<boolean> {
    // A confirm nobody can answer must never become a yes.
    if (!process.stdin.isTTY) {
      this.error(uninstallNeedsTerminal(namedProvider), { exit: EXIT_CODES.ERROR });
    }

    const outcome = await promptConfirm(({ onConfirm, onCancel }) => (
      <RemovalPlanConfirm
        heading={UNINSTALL_PLAN.PREVIEW_HEADING}
        sections={planSections(plan.entries)}
        statements={plan.kept}
        message={UNINSTALL_CONFIRM_MESSAGE}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
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

    await this.removePlannedPlugins(planEntry(plan, "plugins"), target.config, projectDir);
    await this.removeLocalFilesOrFail(plan, target);

    if (!isGlobalUninstall) {
      await this.deregisterProject(projectDir);
      return;
    }
    if (propagation) await this.updateRegisteredProjects(propagation);
  }

  /** Degrades: a missing or corrupt global config must never fail the uninstall. */
  private async deregisterProject(projectDir: string): Promise<void> {
    try {
      // Lazy deps: deregistering inlines nothing, so the uninstall stays offline.
      await mutateGlobal({ kind: "deregister-project", projectDir }, lazyGateDeps(projectDir));
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
    this.reportDirCleanup(CLAUDE_DIR, cleanup.claudeDir);
  }

  private reportSourceFolderCleanup(folder: SourceFolderCleanup): void {
    if (folder.dirRemoved) {
      this.logSuccess(`Removed ${folder.relName}/`);
    } else if (folder.manifestRemoved) {
      this.logSuccess(`Removed CLI config from ${folder.relName}/`);
    } else if (folder.kept) {
      this.log(`Kept ${folder.relName}/ (contains user content)`);
    }
  }

  private reportDirCleanup(relName: string, cleanup: DirCleanup): void {
    if (cleanup.removed) {
      this.logSuccess(`Removed ${relName}/`);
      return;
    }
    if (cleanup.kept) {
      this.log(`Kept ${relName}/ (contains user content)`);
    }
  }

  private async removePlannedPlugins(
    entry: PluginRemoval | undefined,
    config: ProjectConfig | null,
    projectDir: string,
  ): Promise<void> {
    if (!entry) return;

    this.log("Uninstalling plugins...");

    try {
      const pluginResult = await uninstallPlugins(entry, config, projectDir, {
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

type UninstallTarget = {
  hasPlugins: boolean;
  /** Only those this CLI installed, matched against config skills. */
  cliPluginNames: string[];
  /** Carrying `forkedFrom`: this CLI installed them. The rest are the user's, never removed. */
  cliSkills: string[];
  hasClaudeDir: boolean;
  pluginsDir: string;
  skillsDir: string;
  agentsDir: string;
  agentCodec: AgentCodec;
  claudeDir: string;
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
  /** `null` when absent or unreadable. */
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

type PluginRemovalReporter = {
  onUninstalled?: (pluginName: string) => void;
  /** No host CLI to ask, so the plugin's registration outlives its folder. */
  onLeftRegistered?: (pluginName: string, provider: Provider) => void;
};

type SourceFolderCleanup = {
  relName: string;
  manifestRemoved: boolean;
  dirRemoved: boolean;
  /** Still there because of content this CLI never wrote. */
  kept: boolean;
};

type DirCleanup = { removed: boolean; kept: boolean };

type CleanupResult = {
  sourceFolder: SourceFolderCleanup;
  sourceRoot: DirCleanup;
  claudeDir: DirCleanup;
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

/** Its config is read under {@link loadUninstallConfig}'s degrade posture. */
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
  return { ...folder, manifestFiles, config };
}

async function manifestFilesIn(dir: string): Promise<string[]> {
  const manifest = [STANDARD_FILES.CONFIG_TS, STANDARD_FILES.CONFIG_TYPES_TS];
  const present = await Promise.all(
    manifest.map((fileName) => fileExists(path.join(dir, fileName))),
  );
  return manifest.filter((_, index) => present[index]);
}

function activeConfigOf(config: ProjectConfig): ProjectConfig {
  return {
    ...config,
    skills: config.skills.filter((s) => !s.excluded),
    agents: config.agents.filter((a) => !a.excluded),
  };
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
  const { skillsDir, agentsDir } = resolveInstallPaths(projectDir);
  const claudeDir = path.join(projectDir, CLAUDE_DIR);
  const provider = providerInUse(projectDir);
  const codec = agentCodec(provider);

  const [cliSkills, hasClaudeDir, sourceFolder, agentProvenance] = await Promise.all([
    skillsThisCliInstalled(skillsDir, handlers.onSkillMetadataUnreadable),
    directoryExists(claudeDir),
    readSourceFolder(
      sourceFolderInUse(projectDir, provider),
      projectDir,
      provider,
      handlers.onConfigLoadFailed,
    ),
    splitAgentsByProvenance(agentsDir, codec),
  ]);

  const { config } = sourceFolder;
  const activeConfig = config === null ? null : activeConfigOf(config);
  const cliPluginNames = await pluginsThisRunRemoves(projectDir, activeConfig);

  return {
    hasPlugins: cliPluginNames.length > 0,
    cliPluginNames,
    cliSkills,
    hasClaudeDir,
    pluginsDir,
    skillsDir,
    agentsDir,
    claudeDir,
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

/** Read before the plan is built, so the plan and the removal read one classification. */
async function skillsThisCliInstalled(
  skillsDir: string,
  onMetadataUnreadable: (metadataPath: string) => never,
): Promise<string[]> {
  const dirNames = await listDirectories(skillsDir);
  const skills = await Promise.all(
    dirNames.map(async (name) => ({
      name,
      forkedFrom: await readSkillProvenance(skillsDir, name, onMetadataUnreadable),
    })),
  );
  return skills.filter((skill) => skill.forkedFrom !== null).map((skill) => skill.name);
}

/**
 * A metadata.yaml that reads but does not parse is the user's (warned); one found but unreadable
 * aborts. A skill folder that cannot be opened hides its metadata.yaml (`fileExists` answers
 * false on EACCES), so that skill reads as the user's and is kept, even when this CLI made it.
 */
async function readSkillProvenance(
  skillsDir: string,
  dirName: string,
  onUnreadable: (metadataPath: string) => never,
): Promise<ForkedFromMetadata | null> {
  const skillDir = path.join(skillsDir, dirName);
  try {
    return await readForkedFromMetadata(skillDir);
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

const SCOPE_OF_AN_UNRECORDED_SKILL: SkillScope = "project";

/** Every offered plugin scope, the config's first: a re-scoped skill stays where installed. */
function pluginScopesToSweep(host: PluginHost, primary: SkillScope): SkillScope[] {
  const offered = host.offeredPlacements
    .filter((placement) => placement.mode === "plugin")
    .map((placement) => placement.scope);

  if (!offered.includes(primary)) return offered;
  return [primary, ...offered.filter((scope) => scope !== primary)];
}

/** Failures are swallowed: the directory is deleted either way and files are already gone. */
async function removePluginWhereverItIsFiled(
  host: PluginHost,
  pluginRef: string,
  primaryScope: SkillScope,
  projectDir: string,
): Promise<PluginRemovalOutcome> {
  let outcome: PluginRemovalOutcome = "absent";

  for (const scope of pluginScopesToSweep(host, primaryScope)) {
    try {
      const swept = await host.uninstallPlugin(pluginRef, scope, projectDir);
      if (swept === "removed") outcome = "removed";
    } catch {
      // A throw is neither outcome, so `outcome` stays as the other scopes left it.
    }
  }

  return outcome;
}

/** `config` only supplies the scope each plugin is filed under; the entry decides which go. */
async function uninstallPlugins(
  entry: PluginRemoval,
  config: ProjectConfig | null,
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
          scopeThePluginIsFiledUnder(config, pluginName),
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

function scopeThePluginIsFiledUnder(config: ProjectConfig | null, pluginName: string): SkillScope {
  const skillId = parseMarketplacePluginRef(pluginName);
  return (
    config?.skills.find((skill) => skill.id === skillId)?.scope ?? SCOPE_OF_AN_UNRECORDED_SKILL
  );
}

function nothingWasObserved(): PluginRemovalOutcome {
  return "absent";
}

async function removeConfigManifest(
  entry: ConfigManifestRemoval | undefined,
): Promise<{ manifestRemoved: boolean; dirRemoved: boolean }> {
  if (!entry) return { manifestRemoved: false, dirRemoved: false };

  await Promise.all(
    entry.fileNames.map((fileName) => remove(path.join(entry.sourceDir, fileName))),
  );

  return { manifestRemoved: true, dirRemoved: await removeDirIfEmpty(entry.sourceDir) };
}

/** Directories are not plan entries: each goes only once nothing of the user's is left in it. */
async function cleanupEmptyDirs(
  target: Pick<
    UninstallTarget,
    "skillsDir" | "agentsDir" | "hasClaudeDir" | "claudeDir" | "sourceRoot" | "sourceFolder"
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
  const sourceRoot = await cleanupSourceRoot(target.sourceRoot, sourceFolder.dirRemoved);
  const claudeDir = await cleanupClaudeDir(target);

  return { sourceFolder, sourceRoot, claudeDir };
}

async function cleanupSourceFolder(
  folder: ScopeSourceFolder,
  entry: ConfigManifestRemoval | undefined,
): Promise<SourceFolderCleanup> {
  const manifest = await removeConfigManifest(entry);
  const dirRemoved = manifest.dirRemoved || (await removeDirIfEmpty(folder.dir));
  const kept = !dirRemoved && (await directoryExists(folder.dir));
  return {
    relName: folder.relName,
    manifestRemoved: manifest.manifestRemoved,
    dirRemoved,
    kept,
  };
}

/**
 * Only once the provider folder went, and only when empty: consuming repositories keep their own
 * state under `.agents-inc/`.
 */
async function cleanupSourceRoot(
  sourceRoot: SourceRoot,
  providerDirRemoved: boolean,
): Promise<DirCleanup> {
  if (!providerDirRemoved) return { removed: false, kept: false };
  return removeDirUnlessUserContent(sourceRoot.dir);
}

async function cleanupClaudeDir(
  target: Pick<UninstallTarget, "hasClaudeDir" | "claudeDir">,
): Promise<DirCleanup> {
  if (!target.hasClaudeDir) return { removed: false, kept: false };
  return removeDirUnlessUserContent(target.claudeDir);
}

/** `kept` when it is still there: something of the user's is in it. */
async function removeDirUnlessUserContent(dir: string): Promise<DirCleanup> {
  const removed = await removeDirIfEmpty(dir);
  return { removed, kept: !removed && (await directoryExists(dir)) };
}

async function listAgentFiles(agentsDir: string, codec: AgentCodec): Promise<string[]> {
  try {
    return await listAgentFilesOf(agentsDir, codec);
  } catch {
    return [];
  }
}
