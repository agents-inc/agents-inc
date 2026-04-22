import React from "react";
import path from "path";
import { readdir } from "fs/promises";

import { Flags } from "@oclif/core";
import { render, Box, Text, useApp } from "ink";

import { BaseCommand } from "../base-command";
import { Confirm } from "../components/common/confirm";
import { getErrorMessage } from "../utils/errors";
import { directoryExists, glob, listDirectories, remove } from "../utils/fs";
import { claudePluginUninstallBestEffort, isClaudeCLIAvailable } from "../utils/exec";
import { listPluginNames, getProjectPluginsDir } from "../lib/plugins/index";
import { readForkedFromMetadata } from "../lib/skills/index";
import { deregisterProjectPath } from "../lib/installation/index";
import { loadProjectConfigFromDir } from "../lib/configuration/project-config";
import { CLAUDE_DIR, CLAUDE_SRC_DIR, CLI_COLORS, DEFAULT_BRANDING } from "../consts";
import { EXIT_CODES } from "../lib/exit-codes";
import { SUCCESS_MESSAGES, INFO_MESSAGES } from "../utils/messages";
import type { ProjectConfig } from "../types/index";

type UninstallConfirmProps = {
  target: UninstallTarget;
  removeAll: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const UninstallConfirm: React.FC<UninstallConfirmProps> = ({
  target,
  removeAll,
  onConfirm,
  onCancel,
}) => {
  const { exit } = useApp();

  return (
    <Box flexDirection="column">
      <Text bold>The following will be removed:</Text>
      <Text> </Text>

      {target.hasPlugins && (
        <Box flexDirection="column">
          <Text color={CLI_COLORS.ERROR}> Plugins:</Text>
          {target.cliPluginNames.map((name) => (
            <Text key={name} dimColor>
              {" "}
              {name}
            </Text>
          ))}
        </Box>
      )}

      {(target.hasLocalSkills || target.hasLocalAgents) && (
        <Box flexDirection="column">
          <Text color={CLI_COLORS.ERROR}> CLI-managed files:</Text>
          {target.hasLocalSkills && <Text dimColor> {target.skillsDir}/ (matching sources)</Text>}
          {target.hasLocalAgents && <Text dimColor> {target.agentsDir}/ (CLI-compiled)</Text>}
        </Box>
      )}

      {removeAll && target.hasClaudeSrcDir && (
        <Box flexDirection="column">
          <Text color={CLI_COLORS.ERROR}> Config:</Text>
          <Text dimColor> {target.claudeSrcDir}/</Text>
        </Box>
      )}

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

  static description = `Uninstall ${DEFAULT_BRANDING.NAME} from this project. Removes CLI-managed skills (matched by source), compiled agents, and plugins. User-created content is preserved.`;

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --yes",
    "<%= config.bin %> <%= command.id %> --all",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
    all: Flags.boolean({
      description: "Also remove .claude-src/ config directory",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Uninstall);
    const projectDir = process.cwd();

    this.printHeader();

    const target = await detectUninstallTarget(projectDir);
    if (!hasAnythingToRemove(target, flags.all)) {
      this.reportNothingToUninstall();
      return;
    }

    const confirmed = flags.yes
      ? this.printRemovalPlan(target, flags.all)
      : await this.confirmRemoval(target, flags.all);
    if (!confirmed) {
      this.log("");
      this.log("Uninstall cancelled");
      this.exit(EXIT_CODES.CANCELLED);
    }

    await this.executeUninstall(target, projectDir, flags.all);
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

  private printRemovalPlan(target: UninstallTarget, removeAll: boolean): true {
    this.log("The following will be removed:");
    this.log("");

    if (target.hasPlugins) {
      this.log("  Plugins:");
      for (const pluginName of target.cliPluginNames) {
        this.log(`    ${pluginName}`);
      }
    }

    if (target.hasLocalSkills || target.hasLocalAgents) {
      this.log("  CLI-managed files:");
      if (target.hasLocalSkills) {
        this.log(`    ${target.skillsDir}/ (matching sources)`);
      }
      if (target.hasLocalAgents) {
        this.log(`    ${target.agentsDir}/ (CLI-compiled)`);
      }
    }

    if (removeAll && target.hasClaudeSrcDir) {
      this.log("  Config:");
      this.log(`    ${target.claudeSrcDir}/`);
    }

    this.log("");
    return true;
  }

  private async confirmRemoval(target: UninstallTarget, removeAll: boolean): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const { waitUntilExit } = render(
        <UninstallConfirm
          target={target}
          removeAll={removeAll}
          onConfirm={() => resolve(true)}
          onCancel={() => resolve(false)}
        />,
      );

      waitUntilExit().catch(() => resolve(false));
    });
  }

  private async executeUninstall(
    target: UninstallTarget,
    projectDir: string,
    removeAll: boolean,
  ): Promise<void> {
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
      await this.removeLocalFiles(target, removeAll);
    } catch (error) {
      this.log("Failed to remove local files");
      this.error(getErrorMessage(error), {
        exit: EXIT_CODES.ERROR,
      });
    }

    // Deregister this project from global config's tracked projects
    if (removeAll) {
      try {
        await deregisterProjectPath(projectDir);
      } catch {
        // Non-fatal: global config may not exist or may not have projects
      }
    }
  }

  private reportSuccess(): void {
    this.log("");
    this.log(`${DEFAULT_BRANDING.NAME} has been uninstalled.`);
    this.log("");
    this.logSuccess(SUCCESS_MESSAGES.UNINSTALL_COMPLETE);
    this.log("");
  }

  private async removeLocalFiles(target: UninstallTarget, removeAll: boolean): Promise<void> {
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

    const cleanup = await cleanupEmptyDirs(target, removeAll);

    if (cleanup.claudeSrcDirRemoved) {
      this.logSuccess(`Removed ${CLAUDE_SRC_DIR}/`);
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
  hasClaudeSrcDir: boolean;
  pluginsDir: string;
  skillsDir: string;
  agentsDir: string;
  claudeDir: string;
  claudeSrcDir: string;
  /** Resolved project source config from .claude-src/config.ts */
  config: Partial<ProjectConfig> | null;
  /** Agent names from the generated config (e.g., ["web-developer"]) */
  configuredAgents: string[];
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
  claudeSrcDirRemoved: boolean;
  /** Whether .claude/ still exists with user content after cleanup */
  claudeDirKept: boolean;
};

function hasAnythingToRemove(target: UninstallTarget, removeAll: boolean): boolean {
  return (
    target.hasPlugins ||
    target.hasLocalSkills ||
    target.hasLocalAgents ||
    (removeAll && target.hasClaudeSrcDir)
  );
}

function collectConfiguredAgents(config: Partial<ProjectConfig> | null): string[] {
  if (!config?.agents) return [];
  return config.agents.map((a) => a.name);
}

/** @internal Exported for testing */
export function getCliInstalledPluginKeys(config: Partial<ProjectConfig> | null): Set<string> {
  if (!config?.skills) return new Set();
  const keys = new Set<string>();
  for (const skill of config.skills) {
    // Primary key: skill.id@skill.source
    keys.add(`${skill.id}@${skill.source}`);
    // Also add marketplace variant for plugins installed via marketplace
    // where skill.source may differ (e.g., "eject" vs the marketplace name)
    if (config.marketplace && skill.source !== config.marketplace && skill.source !== "eject") {
      keys.add(`${skill.id}@${config.marketplace}`);
    }
  }
  return keys;
}

/**
 * Detects what's installed in a project directory for uninstallation.
 *
 * Checks for plugins, local skills, agents, config directories, and
 * resolves which plugins were installed by this CLI.
 */
async function detectUninstallTarget(projectDir: string): Promise<UninstallTarget> {
  const pluginsDir = getProjectPluginsDir(projectDir);
  const skillsDir = path.join(projectDir, CLAUDE_DIR, "skills");
  const agentsDir = path.join(projectDir, CLAUDE_DIR, "agents");
  const claudeDir = path.join(projectDir, CLAUDE_DIR);
  const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);

  const [hasLocalSkills, hasLocalAgents, hasClaudeDir, hasClaudeSrcDir, config] = await Promise.all(
    [
      directoryExists(skillsDir),
      directoryExists(agentsDir),
      directoryExists(claudeDir),
      directoryExists(claudeSrcDir),
      loadProjectConfigFromDir(projectDir).then((result) => result?.config ?? null),
    ],
  );

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
    hasClaudeSrcDir,
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
  const toRemove: string[] = [];
  const toSkip: string[] = [];

  for (const name of dirNames) {
    const forkedFrom = await readForkedFromMetadata(path.join(skillsDir, name));
    (shouldRemoveSkill(forkedFrom) ? toRemove : toSkip).push(name);
  }

  return { toRemove, toSkip };
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
  if (!allRemoved || !(await directoryExists(dir))) return false;
  if (!(await isDirectoryEmpty(dir))) return false;
  await remove(dir);
  return true;
}

/**
 * Removes compiled agent .md files that match configured agent names.
 *
 * Only removes agents that are listed in the project config (CLI-compiled).
 * Cleans up the agents directory if empty after removal.
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
  const removedNames: string[] = [];

  for (const agentFile of agentFiles) {
    const agentName = agentFile.replace(/\.md$/, "");
    if (!target.configuredAgents.includes(agentName)) continue;

    await remove(path.join(target.agentsDir, agentFile));
    removedNames.push(agentName);
    onRemoved?.(agentName);
  }

  let dirCleaned = false;
  if (await directoryExists(target.agentsDir)) {
    if (await isDirectoryEmpty(target.agentsDir)) {
      await remove(target.agentsDir);
      dirCleaned = true;
    }
  }

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
  const uninstalledNames: string[] = [];

  for (const pluginName of target.cliPluginNames) {
    if (cliAvailable) {
      // Derive primary scope from per-skill config; shared helper tries both scopes
      // to handle re-scoped plugins where the registry entry may be under the
      // original scope rather than the currently-configured one.
      const skillId = pluginName.split("@")[0];
      const skillConfig = target.config?.skills?.find((s) => s.id === skillId);
      const primaryScope = skillConfig?.scope === "global" ? "user" : "project";
      await claudePluginUninstallBestEffort(pluginName, primaryScope, projectDir);
    }

    const pluginPath = path.join(target.pluginsDir, pluginName);
    await remove(pluginPath);
    uninstalledNames.push(pluginName);
    onUninstalled?.(pluginName);
  }

  return {
    uninstalledNames,
    totalUninstalled: uninstalledNames.length,
  };
}

/**
 * Removes empty .claude/ and .claude-src/ directories after uninstall.
 *
 * Only removes .claude-src/ when `removeAll` is true.
 * Only removes .claude/ when it's completely empty.
 */
async function cleanupEmptyDirs(
  target: Pick<UninstallTarget, "hasClaudeDir" | "hasClaudeSrcDir" | "claudeDir" | "claudeSrcDir">,
  removeAll: boolean,
): Promise<CleanupResult> {
  let claudeSrcDirRemoved = false;
  if (removeAll && target.hasClaudeSrcDir) {
    await remove(target.claudeSrcDir);
    claudeSrcDirRemoved = true;
  }

  let claudeDirRemoved = false;
  let claudeDirKept = false;
  if (target.hasClaudeDir && (await directoryExists(target.claudeDir))) {
    if (await isDirectoryEmpty(target.claudeDir)) {
      await remove(target.claudeDir);
      claudeDirRemoved = true;
    } else {
      claudeDirKept = true;
    }
  }

  return { claudeDirRemoved, claudeSrcDirRemoved, claudeDirKept };
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
    return await glob("*.md", agentsDir);
  } catch {
    return [];
  }
}
