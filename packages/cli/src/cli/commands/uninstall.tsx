import React from "react";
import { partition } from "remeda";
import path from "path";
import { readdir } from "fs/promises";

import { Flags } from "@oclif/core";
import { Box, Text, useApp } from "ink";

import { BaseCommand } from "../base-command";
import { Confirm } from "../components/common/confirm";
import { promptConfirm } from "../components/common/prompt-confirm.js";
import { getErrorMessage } from "../utils/errors";
import { directoryExists, fileExists, listDirectories, remove } from "../utils/fs";
import { listAgentMdFiles } from "../lib/agents";
import { claudePluginUninstallBestEffort, isClaudeCLIAvailable } from "../utils/exec";
import {
  listPluginNames,
  getProjectPluginsDir,
  buildMarketplacePluginRef,
  parseMarketplacePluginRef,
  toClaudePluginScope,
} from "../lib/plugins/index";
import { readForkedFromMetadata } from "../lib/skills/index";
import { isHomeDirectory, resolveInstallPaths } from "../lib/installation/index";
import { lazyGateDeps, mutateGlobal, propagateGlobalRemoval } from "../lib/config-gate/index.js";
import { loadSkillsMatrixFromSource } from "../lib/loading";
import { loadAgentDefs } from "../lib/operations";
import { ConfigLoadError, loadProjectConfigFromDir } from "../lib/configuration/project-config";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  CLI_COLORS,
  DEFAULT_BRANDING,
  EJECT_SOURCE,
  STANDARD_FILES,
} from "../consts";
import { EXIT_CODES } from "../lib/exit-codes";
import {
  SUCCESS_MESSAGES,
  INFO_MESSAGES,
  registeredProjectsUpdated,
  registeredProjectUpdateSkipped,
  registeredProjectsUpdateFailed,
} from "../utils/messages";
import type { AgentDefinition, AgentName, MergedSkillsMatrix, ProjectConfig } from "../types/index";

/** A grouped section of the uninstall removal plan (header label + item lines). */
type RemovalPlanSection = {
  label: string;
  items: string[];
};

/**
 * Pure builder for the uninstall removal plan. The single source of the section
 * labels and item strings shared by printRemovalPlan (plain text) and the
 * UninstallConfirm Ink component — each renderer only adds its own
 * indentation/styling, so the emitted strings stay byte-identical.
 */
function buildRemovalPlan(target: UninstallTarget): RemovalPlanSection[] {
  const sections: RemovalPlanSection[] = [];

  if (target.hasPlugins) {
    sections.push({ label: "Plugins:", items: [...target.cliPluginNames] });
  }

  if (target.hasLocalSkills || target.hasLocalAgents) {
    const items: string[] = [];
    if (target.hasLocalSkills) items.push(`${target.skillsDir}/ (matching sources)`);
    if (target.hasLocalAgents) items.push(`${target.agentsDir}/ (CLI-compiled)`);
    sections.push({ label: "CLI-managed files:", items });
  }

  // The CLI config manifest (config.ts + config-types.ts) is always removed.
  if (target.hasClaudeSrcConfig || target.hasClaudeSrcConfigTypes) {
    const items: string[] = [];
    if (target.hasClaudeSrcConfig) {
      items.push(`${target.claudeSrcDir}/${STANDARD_FILES.CONFIG_TS}`);
    }
    if (target.hasClaudeSrcConfigTypes) {
      items.push(`${target.claudeSrcDir}/${STANDARD_FILES.CONFIG_TYPES_TS}`);
    }
    sections.push({ label: "Config:", items });
  }

  return sections;
}

type UninstallConfirmProps = {
  target: UninstallTarget;
  onConfirm: () => void;
  onCancel: () => void;
};

const UninstallConfirm: React.FC<UninstallConfirmProps> = ({ target, onConfirm, onCancel }) => {
  const { exit } = useApp();

  return (
    <Box flexDirection="column">
      <Text bold>The following will be removed:</Text>
      <Text> </Text>

      {buildRemovalPlan(target).map((section) => (
        <Box key={section.label} flexDirection="column">
          <Text color={CLI_COLORS.ERROR}> {section.label}</Text>
          {section.items.map((item) => (
            <Text key={item} dimColor>
              {" "}
              {item}
            </Text>
          ))}
        </Box>
      ))}

      <Text> </Text>
      <Confirm
        message="Are you sure you want to uninstall?"
        onConfirm={() => {
          onConfirm();
          exit();
        }}
        onCancel={() => {
          onCancel();
          exit();
        }}
        defaultValue={false}
      />
    </Box>
  );
};

export default class Uninstall extends BaseCommand {
  static summary = `Remove ${DEFAULT_BRANDING.NAME} from this project`;

  static description = `Uninstall ${DEFAULT_BRANDING.NAME} from this project. Removes CLI-managed skills (matched by source), compiled agents, plugins, and the .claude-src/ config manifest (config.ts + config-types.ts). User-created content is preserved.`;

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --yes",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Uninstall);
    const projectDir = process.cwd();

    this.printHeader();

    const target = await detectUninstallTarget(projectDir, (reason) =>
      this.warn(
        `Could not read the project config — plugins and compiled agents it lists may be left behind: ${reason}`,
      ),
    );
    if (!hasAnythingToRemove(target)) {
      this.reportNothingToUninstall();
      return;
    }

    const confirmed = flags.yes ? this.printRemovalPlan(target) : await this.confirmRemoval(target);
    if (!confirmed) {
      this.log("");
      this.log("Uninstall cancelled");
      this.exit(EXIT_CODES.CANCELLED);
    }

    await this.executeUninstall(target, projectDir);
    this.reportSuccess();
  }

  private printHeader(): void {
    this.log("");
    this.log(`${DEFAULT_BRANDING.NAME} Uninstall`);
    this.log("");
  }

  private reportNothingToUninstall(): void {
    this.warn("Nothing to uninstall.");
    this.log("");
    this.log(INFO_MESSAGES.NOT_INSTALLED);
    this.log("");
    this.log(INFO_MESSAGES.NO_CHANGES_MADE);
  }

  private printRemovalPlan(target: UninstallTarget): true {
    this.log("The following will be removed:");
    this.log("");

    for (const section of buildRemovalPlan(target)) {
      this.log(`  ${section.label}`);
      for (const item of section.items) {
        this.log(`    ${item}`);
      }
    }

    this.log("");
    return true;
  }

  private async confirmRemoval(target: UninstallTarget): Promise<boolean> {
    const outcome = await promptConfirm(({ onConfirm, onCancel }) => (
      <UninstallConfirm target={target} onConfirm={onConfirm} onCancel={onCancel} />
    ));
    return outcome === "confirmed";
  }

  private async executeUninstall(target: UninstallTarget, projectDir: string): Promise<void> {
    const isGlobalUninstall = isHomeDirectory(projectDir);
    // Prepared BEFORE any removal: the projects[] registry and the source used
    // to regenerate each project's config-types.ts both live in the global
    // config this uninstall is about to delete.
    const propagation = isGlobalUninstall
      ? await this.prepareGlobalPropagation(target, projectDir)
      : null;

    if (target.hasPlugins) {
      this.log("Uninstalling plugins...");

      try {
        const pluginResult = await uninstallPlugins(target, projectDir, (name) =>
          this.log(`  Uninstalled plugin '${name}'`),
        );

        this.logSuccess(
          `Uninstalled ${pluginResult.totalUninstalled} ${pluginResult.totalUninstalled === 1 ? "plugin" : "plugins"}`,
        );
      } catch (error) {
        this.log("Plugin uninstall failed");
        this.error(getErrorMessage(error), {
          exit: EXIT_CODES.ERROR,
        });
      }
    }

    try {
      await this.removeLocalFiles(target);
    } catch (error) {
      this.log("Failed to remove local files");
      this.error(getErrorMessage(error), {
        exit: EXIT_CODES.ERROR,
      });
    }

    if (isGlobalUninstall) {
      // The global manifest is gone — prune the inlined global-scoped entries the
      // registered projects still carry so they stop referencing removed content.
      if (propagation) {
        await this.updateRegisteredProjects(propagation);
      }
      return;
    }

    // Deregister this project from the global config's tracked projects so future
    // global edits stop propagating back into it. Best-effort by nature: a missing,
    // project-less, or corrupt global config (ConfigLoadError) must never fail the
    // uninstall — warn and move on.
    try {
      // Registration bookkeeping only: nothing inlines the `projects[]` list into a
      // project config, so this loads neither the matrix nor the agent definitions
      // and the uninstall stays offline.
      await mutateGlobal({ kind: "deregister-project", projectDir }, lazyGateDeps(projectDir));
    } catch (error) {
      this.warn(`Could not update the global project registry: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Loads what updating registered projects needs (global config with its
   * projects[] registry, skills matrix, agent definitions) BEFORE the global
   * .claude-src manifest is deleted — source resolution reads that config.
   * Returns null when nothing is registered or loading fails; a load failure
   * warns and never aborts the uninstall.
   *
   * `skipExtraSources: true` is NOT a divergence from the wizard's full
   * multi-source load: extra-source loading only annotates each skill's
   * `availableSources`/`activeSource` for wizard UI tagging — it never adds
   * skills or categories to the matrix, and the config-types writer never reads
   * those annotations, so the regenerated project types are byte-identical
   * either way (pinned by the skipExtraSources parity test in
   * local-installer.test.ts). Skipping avoids fetching every registered extra
   * source (network on a cold cache, plus unreachable-remote warnings) during
   * an uninstall that must never hang or noise-fail on remote state.
   */
  private async prepareGlobalPropagation(
    target: UninstallTarget,
    projectDir: string,
  ): Promise<GlobalPropagationData | null> {
    const globalConfig = target.config;
    if (!globalConfig?.projects?.length) return null;

    try {
      const [sourceResult, agentDefs] = await Promise.all([
        loadSkillsMatrixFromSource({
          projectDir,
          skipExtraSources: true,
          matrixOnly: true,
        }),
        loadAgentDefs({ projectDir }),
      ]);
      return { globalConfig, matrix: sourceResult.matrix, agents: agentDefs.agents };
    } catch (error) {
      this.warn(registeredProjectsUpdateFailed(getErrorMessage(error)));
      return null;
    }
  }

  /**
   * Prunes the inlined global-scoped config entries from every registered
   * project and regenerates its config-types.ts. Runs AFTER the global manifest
   * removal so the regenerated project types fall back to the standalone form
   * instead of importing from the deleted global config-types.ts. Best-effort:
   * unreachable projects are warned and skipped, and no failure here may abort
   * the uninstall.
   */
  private async updateRegisteredProjects(propagation: GlobalPropagationData): Promise<void> {
    try {
      const report = await propagateGlobalRemoval(propagation.globalConfig, {
        matrix: propagation.matrix,
        agents: propagation.agents,
      });
      for (const skippedPath of report.propagated.skipped) {
        this.warn(registeredProjectUpdateSkipped(skippedPath));
      }
      if (report.propagated.updated.length === 0) return;

      this.logSuccess(registeredProjectsUpdated(report.propagated.updated.length));

      // The pruned projects' compiled agents were built from the global rows this
      // uninstall just removed, so the prune owes them a recompile too.
      const { recompiledCount, failedCount, warnings } = report.recompile;
      for (const warning of warnings) {
        this.warn(warning);
      }
      const failureSuffix = failedCount > 0 ? ` (${failedCount} failed)` : "";
      this.log(`Recompiled agents in ${recompiledCount} registered projects${failureSuffix}`);
    } catch (error) {
      this.warn(registeredProjectsUpdateFailed(getErrorMessage(error)));
    }
  }

  private reportSuccess(): void {
    this.log("");
    this.log(`${DEFAULT_BRANDING.NAME} has been uninstalled.`);
    this.log("");
    this.logSuccess(SUCCESS_MESSAGES.UNINSTALL_COMPLETE);
    this.log("");
  }

  private async removeLocalFiles(target: UninstallTarget): Promise<void> {
    const skillResult = await removeMatchingSkills(
      target,
      (dirName) => this.log(`  Uninstalled skill '${dirName}'`),
      (dirName) => this.warn(`Skipping '${dirName}': not created by ${DEFAULT_BRANDING.NAME} CLI`),
    );

    if (skillResult.removedCount > 0) {
      this.logSuccess(
        `Removed ${skillResult.removedCount} CLI-installed ${skillResult.removedCount === 1 ? "skill" : "skills"}`,
      );
    }

    const agentResult = await removeMatchingAgents(target, (agentName) =>
      this.log(`  Uninstalled agent '${agentName}'`),
    );

    if (agentResult.removedCount > 0) {
      this.logSuccess(
        `Removed ${agentResult.removedCount} compiled ${agentResult.removedCount === 1 ? "agent" : "agents"}`,
      );
    }

    const cleanup = await cleanupEmptyDirs(target);

    if (cleanup.claudeSrcDirRemoved) {
      this.logSuccess(`Removed ${CLAUDE_SRC_DIR}/`);
    } else if (cleanup.claudeSrcManifestRemoved) {
      this.logSuccess(`Removed CLI config from ${CLAUDE_SRC_DIR}/`);
    }

    if (cleanup.claudeDirRemoved) {
      this.logSuccess(`Removed ${CLAUDE_DIR}/`);
    } else if (cleanup.claudeDirKept) {
      this.log(`Kept ${CLAUDE_DIR}/ (contains user content)`);
    }
  }
}

/** @internal Exported for testing */
export type UninstallTarget = {
  hasPlugins: boolean;
  pluginNames: string[];
  /** Plugin names filtered to only those installed by this CLI (matched against config skills) */
  cliPluginNames: string[];
  hasLocalSkills: boolean;
  hasLocalAgents: boolean;
  hasClaudeDir: boolean;
  /** Whether .claude-src/config.ts exists (the CLI config manifest). */
  hasClaudeSrcConfig: boolean;
  /** Whether .claude-src/config-types.ts exists (companion to config.ts). */
  hasClaudeSrcConfigTypes: boolean;
  pluginsDir: string;
  skillsDir: string;
  agentsDir: string;
  claudeDir: string;
  claudeSrcDir: string;
  /** Resolved project source config from .claude-src/config.ts */
  config: ProjectConfig | null;
  /** Agent names from the generated config (e.g., ["web-developer"]) */
  configuredAgents: AgentName[];
};

/**
 * Everything a global uninstall needs to update the registered projects after
 * the global manifest is removed — captured before removal because it is
 * sourced from the config being deleted.
 */
type GlobalPropagationData = {
  globalConfig: ProjectConfig;
  matrix: MergedSkillsMatrix;
  agents: Record<AgentName, AgentDefinition>;
};

type SkillRemovalResult = {
  removedCount: number;
  skippedCount: number;
  removedNames: string[];
  skippedNames: string[];
  /** Whether the skills directory was cleaned up (empty after removal) */
  dirCleaned: boolean;
};

type AgentRemovalResult = {
  removedCount: number;
  removedNames: string[];
  /** Whether the agents directory was cleaned up (empty after removal) */
  dirCleaned: boolean;
};

type UninstallPluginsResult = {
  uninstalledNames: string[];
  totalUninstalled: number;
};

type CleanupResult = {
  claudeDirRemoved: boolean;
  /** Whether config.ts/config-types.ts were removed from .claude-src/ */
  claudeSrcManifestRemoved: boolean;
  /** Whether the emptied .claude-src/ directory itself was removed */
  claudeSrcDirRemoved: boolean;
  /** Whether .claude/ still exists with user content after cleanup */
  claudeDirKept: boolean;
};

function hasAnythingToRemove(target: UninstallTarget): boolean {
  return (
    target.hasPlugins ||
    target.hasLocalSkills ||
    target.hasLocalAgents ||
    target.hasClaudeSrcConfig ||
    target.hasClaudeSrcConfigTypes
  );
}

function collectConfiguredAgents(config: Partial<ProjectConfig> | null): AgentName[] {
  if (!config?.agents) return [];
  return config.agents.map((a) => a.name);
}

/** @internal Exported for testing */
export function getCliInstalledPluginKeys(config: Partial<ProjectConfig> | null): Set<string> {
  if (!config?.skills) return new Set();
  const { marketplace } = config;
  return new Set(
    config.skills.flatMap((skill) => [
      // Primary key: skill.id@skill.source
      buildMarketplacePluginRef(skill.id, skill.source),
      // Marketplace variant for plugins installed via marketplace where
      // skill.source may differ (e.g., "eject" vs the marketplace name)
      ...(marketplace && skill.source !== marketplace && skill.source !== EJECT_SOURCE
        ? [buildMarketplacePluginRef(skill.id, marketplace)]
        : []),
    ]),
  );
}

/**
 * Loads the config that drives the removal plan. A config file that exists but
 * cannot be parsed (`ConfigLoadError`) is reported through `onLoadFailed` and
 * then treated exactly like a missing one — an unreadable config is precisely
 * when a user needs to uninstall, so it must never fail the run. Same posture as
 * the `deregisterProjectPath` call site. Only the plan degrades: the plugins and
 * compiled agents the config named can no longer be identified, while file
 * removal proceeds. Any other failure is a real fault and still propagates.
 */
async function loadUninstallConfig(
  projectDir: string,
  onLoadFailed: (reason: string) => void,
): Promise<ProjectConfig | null> {
  try {
    const result = await loadProjectConfigFromDir(projectDir);
    return result?.config ?? null;
  } catch (error) {
    if (!(error instanceof ConfigLoadError)) throw error;
    onLoadFailed(getErrorMessage(error));
    return null;
  }
}

/**
 * Detects what's installed in a project directory for uninstallation.
 *
 * Checks for plugins, local skills, agents, config directories, and
 * resolves which plugins were installed by this CLI.
 */
async function detectUninstallTarget(
  projectDir: string,
  onConfigLoadFailed: (reason: string) => void,
): Promise<UninstallTarget> {
  const pluginsDir = getProjectPluginsDir(projectDir);
  const { skillsDir, agentsDir } = resolveInstallPaths(projectDir);
  const claudeDir = path.join(projectDir, CLAUDE_DIR);
  const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);

  const claudeSrcConfigPath = path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS);
  const claudeSrcConfigTypesPath = path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TYPES_TS);

  const [
    hasLocalSkills,
    hasLocalAgents,
    hasClaudeDir,
    hasClaudeSrcConfig,
    hasClaudeSrcConfigTypes,
    config,
  ] = await Promise.all([
    directoryExists(skillsDir),
    directoryExists(agentsDir),
    directoryExists(claudeDir),
    fileExists(claudeSrcConfigPath),
    fileExists(claudeSrcConfigTypesPath),
    loadUninstallConfig(projectDir, onConfigLoadFailed),
  ]);

  let pluginNames: string[] = [];
  try {
    pluginNames = await listPluginNames(projectDir);
  } catch {
    // Best-effort: plugin detection may fail
  }

  const activeConfig = config
    ? {
        ...config,
        skills: config.skills?.filter((s) => !s.excluded),
        agents: config.agents?.filter((a) => !a.excluded),
      }
    : null;
  const configuredAgents = collectConfiguredAgents(activeConfig);
  const cliInstalledKeys = getCliInstalledPluginKeys(activeConfig);
  const cliPluginNames = pluginNames.filter((name) => cliInstalledKeys.has(name));

  return {
    hasPlugins: cliPluginNames.length > 0,
    pluginNames,
    cliPluginNames,
    hasLocalSkills,
    hasLocalAgents,
    hasClaudeDir,
    hasClaudeSrcConfig,
    hasClaudeSrcConfigTypes,
    pluginsDir,
    skillsDir,
    agentsDir,
    claudeDir,
    claudeSrcDir,
    config,
    configuredAgents,
  };
}

function shouldRemoveSkill(forkedFrom: { source?: string } | null): boolean {
  return forkedFrom !== null;
}

async function removeMatchingSkills(
  target: Pick<UninstallTarget, "hasLocalSkills" | "skillsDir">,
  onRemoved?: (dirName: string) => void,
  onSkipped?: (dirName: string) => void,
): Promise<SkillRemovalResult> {
  if (!target.hasLocalSkills) {
    return {
      removedCount: 0,
      skippedCount: 0,
      removedNames: [],
      skippedNames: [],
      dirCleaned: false,
    };
  }

  const classified = await classifySkillDirs(target.skillsDir);
  const removedNames = await removeClassifiedSkills(
    classified.toRemove,
    target.skillsDir,
    onRemoved,
  );
  classified.toSkip.forEach((name) => onSkipped?.(name));
  const dirCleaned = await cleanupSkillsDir(target.skillsDir, classified.toSkip.length === 0);

  return {
    removedCount: removedNames.length,
    skippedCount: classified.toSkip.length,
    removedNames,
    skippedNames: classified.toSkip,
    dirCleaned,
  };
}

async function classifySkillDirs(
  skillsDir: string,
): Promise<{ toRemove: string[]; toSkip: string[] }> {
  const dirNames = await listDirectories(skillsDir);
  const entries = await Promise.all(
    dirNames.map(async (name) => ({
      name,
      forkedFrom: await readForkedFromMetadata(path.join(skillsDir, name)),
    })),
  );
  const [removable, skippable] = partition(entries, (entry) => shouldRemoveSkill(entry.forkedFrom));
  return { toRemove: removable.map((e) => e.name), toSkip: skippable.map((e) => e.name) };
}

async function removeClassifiedSkills(
  names: string[],
  skillsDir: string,
  onRemoved?: (name: string) => void,
): Promise<string[]> {
  for (const name of names) {
    await remove(path.join(skillsDir, name));
    onRemoved?.(name);
  }
  return names;
}

async function cleanupSkillsDir(dir: string, allRemoved: boolean): Promise<boolean> {
  if (!allRemoved) return false;
  return removeDirIfEmpty(dir);
}

/** Removes `dir` when it exists and is empty; true when removed. */
async function removeDirIfEmpty(dir: string): Promise<boolean> {
  if (!(await directoryExists(dir))) return false;
  if (!(await isDirectoryEmpty(dir))) return false;
  await remove(dir);
  return true;
}

/**
 * Removes compiled agent .md files that are listed in the project config.
 *
 * A file is removed only when its basename matches a configured agent
 * (config.agents); agents absent from config are preserved. Cleans up the
 * agents directory if empty after removal.
 *
 * @param onRemoved - Called for each removed agent name (for logging)
 */
async function removeMatchingAgents(
  target: Pick<UninstallTarget, "hasLocalAgents" | "agentsDir" | "configuredAgents">,
  onRemoved?: (agentName: string) => void,
): Promise<AgentRemovalResult> {
  if (!target.hasLocalAgents) {
    return { removedCount: 0, removedNames: [], dirCleaned: false };
  }

  if (target.configuredAgents.length === 0) {
    return { removedCount: 0, removedNames: [], dirCleaned: false };
  }

  const agentFiles = await listAgentFiles(target.agentsDir);
  const removedNames = agentFiles
    .map((agentFile) => agentFile.replace(/\.md$/, ""))
    // Array<AgentName>.includes rejects a plain string; widen the configured
    // list to readonly string[] so the on-disk basename can be tested for
    // membership in config.agents.
    .filter((agentName) => (target.configuredAgents as readonly string[]).includes(agentName));

  for (const agentName of removedNames) {
    await remove(path.join(target.agentsDir, `${agentName}.md`));
    onRemoved?.(agentName);
  }

  const dirCleaned = await removeDirIfEmpty(target.agentsDir);

  return {
    removedCount: removedNames.length,
    removedNames,
    dirCleaned,
  };
}

/**
 * Uninstalls CLI-managed plugins by removing them from the Claude CLI
 * and deleting their local directories.
 *
 * Derives scope from per-skill config when available; falls back to project-level.
 *
 * @param onUninstalled - Called for each successfully uninstalled plugin name (for logging)
 * @internal Exported for testing
 */
export async function uninstallPlugins(
  target: Pick<UninstallTarget, "hasPlugins" | "cliPluginNames" | "pluginsDir" | "config">,
  projectDir: string,
  onUninstalled?: (pluginName: string) => void,
): Promise<UninstallPluginsResult> {
  if (!target.hasPlugins) {
    return { uninstalledNames: [], totalUninstalled: 0 };
  }

  const cliAvailable = await isClaudeCLIAvailable();

  for (const pluginName of target.cliPluginNames) {
    if (cliAvailable) {
      // Derive primary scope from per-skill config; shared helper tries both scopes
      // to handle re-scoped plugins where the registry entry may be under the
      // original scope rather than the currently-configured one.
      const skillId = parseMarketplacePluginRef(pluginName);
      const skillConfig = target.config?.skills?.find((s) => s.id === skillId);
      const primaryScope = toClaudePluginScope(skillConfig?.scope);
      await claudePluginUninstallBestEffort(pluginName, primaryScope, projectDir);
    }

    const pluginPath = path.join(target.pluginsDir, pluginName);
    await remove(pluginPath);
    onUninstalled?.(pluginName);
  }

  // Every iteration either completes or throws (aborting the whole uninstall),
  // so reaching this return means every CLI-managed plugin was removed.
  return {
    uninstalledNames: target.cliPluginNames,
    totalUninstalled: target.cliPluginNames.length,
  };
}

/**
 * Removes the CLI config manifest (config.ts + config-types.ts) from .claude-src/,
 * then the .claude-src/ directory itself when it has nothing else left. User-owned
 * content in .claude-src/ (e.g. ejected templates) keeps the directory alive.
 */
async function removeConfigManifest(
  target: Pick<UninstallTarget, "claudeSrcDir" | "hasClaudeSrcConfig" | "hasClaudeSrcConfigTypes">,
): Promise<{ manifestRemoved: boolean; dirRemoved: boolean }> {
  let manifestRemoved = false;

  if (target.hasClaudeSrcConfig) {
    await remove(path.join(target.claudeSrcDir, STANDARD_FILES.CONFIG_TS));
    manifestRemoved = true;
  }
  if (target.hasClaudeSrcConfigTypes) {
    await remove(path.join(target.claudeSrcDir, STANDARD_FILES.CONFIG_TYPES_TS));
    manifestRemoved = true;
  }

  const dirRemoved = manifestRemoved && (await removeDirIfEmpty(target.claudeSrcDir));
  return { manifestRemoved, dirRemoved };
}

/**
 * Removes the CLI config manifest and cleans up empty .claude/ and .claude-src/
 * directories after uninstall.
 *
 * The config manifest is always removed. The .claude-src/ and .claude/ directories
 * are removed only when they are empty after their CLI-managed contents are gone.
 */
async function cleanupEmptyDirs(
  target: Pick<
    UninstallTarget,
    "hasClaudeDir" | "claudeDir" | "claudeSrcDir" | "hasClaudeSrcConfig" | "hasClaudeSrcConfigTypes"
  >,
): Promise<CleanupResult> {
  const manifest = await removeConfigManifest(target);

  const claudeDirRemoved = target.hasClaudeDir && (await removeDirIfEmpty(target.claudeDir));
  // Nothing else removes .claude itself, so "kept" is exactly "present but not removed".
  const claudeDirKept =
    !claudeDirRemoved && target.hasClaudeDir && (await directoryExists(target.claudeDir));

  return {
    claudeDirRemoved,
    claudeSrcManifestRemoved: manifest.manifestRemoved,
    claudeSrcDirRemoved: manifest.dirRemoved,
    claudeDirKept,
  };
}

async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
  try {
    const allEntries = await readdir(dirPath);
    return allEntries.length === 0;
  } catch {
    return true;
  }
}

async function listAgentFiles(agentsDir: string): Promise<string[]> {
  try {
    return await listAgentMdFiles(agentsDir);
  } catch {
    return [];
  }
}
