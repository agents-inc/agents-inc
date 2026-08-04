import { readdir } from "fs/promises";
import type { Dirent } from "fs";

import { DEFAULT_DISPLAY_VERSION, DEFAULT_PLUGIN_NAME } from "../../consts";
import { verbose } from "../../utils/logger";
import { loadProjectConfig } from "../configuration";
import {
  detectInstallation,
  isHomeDirectory,
  resolveInstallPaths,
  INSTALL_MODE_LABELS,
  type Installation,
  type InstallMode,
} from "../installation";
import type { SkillScope } from "../../types/config";
import { getProjectPluginsDir } from "./plugin-finder";
import { discoverAllPluginSkills, listPluginNames } from "./plugin-discovery";

const AGENT_FILE_EXTENSION = ".md";

export type PluginInfo = {
  name: string;
  version: string;
  skillCount: number;
  agentCount: number;
  path: string;
};

export type InstallationInfo = {
  mode: InstallMode;
  name: string;
  skillCount: number;
  agentCount: number;
  configPath: string;
  /** Every directory that actually holds compiled agents; empty when no scope has any. */
  agentDirs: string[];
  skillsDir: string;
};

export async function getPluginInfo(projectDir?: string): Promise<PluginInfo | null> {
  const dir = projectDir ?? process.cwd();

  try {
    const pluginNames = await listPluginNames(dir);
    if (pluginNames.length > 0) {
      return {
        name: DEFAULT_PLUGIN_NAME,
        version: DEFAULT_DISPLAY_VERSION,
        skillCount: pluginNames.length,
        agentCount: 0,
        path: getProjectPluginsDir(dir),
      };
    }
  } catch {
    verbose("Failed to list plugins for plugin info");
  }

  return null;
}

export function formatPluginDisplay(info: PluginInfo): string {
  return `Plugin: ${info.name} v${info.version}
  Skills: ${info.skillCount}
  Agents: ${info.agentCount}
  Path:   ${info.path}`;
}

export async function getInstallationInfo(): Promise<InstallationInfo | null> {
  const installation = await detectInstallation();
  if (!installation) return null;

  const scopes = installedScopes(installation);
  const skillCount = await countInstalledSkills(installation, scopes);
  const agentDirCounts = await countCompiledAgentsPerScope(installation, scopes);

  const loaded = await loadProjectConfig(installation.projectDir);
  const name = loaded?.config?.name || DEFAULT_PLUGIN_NAME;

  return {
    mode: installation.mode,
    name,
    skillCount,
    agentCount: sumCounts(agentDirCounts),
    configPath: installation.configPath,
    agentDirs: agentDirCounts.filter(hasEntries).map((scopeCount) => scopeCount.dir),
    skillsDir: installation.skillsDir,
  };
}

/**
 * Scopes whose artifacts belong to this installation, in report order (global
 * first, mirroring the init success report). A project context also owns
 * everything installed globally under HOME, so both roots are counted; at the
 * home root the two resolve to the same directory and only one pass runs so
 * nothing is counted twice.
 */
function installedScopes(installation: Installation): SkillScope[] {
  return isHomeDirectory(installation.projectDir) ? ["project"] : ["global", "project"];
}

type ScopeCount = {
  dir: string;
  count: number;
};

function hasEntries(scopeCount: ScopeCount): boolean {
  return scopeCount.count > 0;
}

function sumCounts(scopeCounts: ScopeCount[]): number {
  return scopeCounts.reduce((total, scopeCount) => total + scopeCount.count, 0);
}

async function sumOverScopes(
  scopes: SkillScope[],
  count: (scope: SkillScope) => Promise<number>,
): Promise<number> {
  const counts = await Promise.all(scopes.map(count));
  return counts.reduce((total, current) => total + current, 0);
}

/** Plugin-mode skills live in the plugin registry, not under a scope's skills dir. */
async function countInstalledSkills(
  installation: Installation,
  scopes: SkillScope[],
): Promise<number> {
  if (installation.mode === "plugin") return countPluginSkills(installation.projectDir);

  return sumOverScopes(scopes, (scope) =>
    countDirEntries(resolveInstallPaths(installation.projectDir, scope).skillsDir, (entry) =>
      entry.isDirectory(),
    ),
  );
}

/**
 * Compiled-agent count per scope, keyed by the directory it was read from, so
 * callers can both total the counts and name the directories the agents are
 * actually in — a default install driven from a project directory compiles
 * every agent under HOME, and naming the project directory there names a
 * directory that was never written.
 */
async function countCompiledAgentsPerScope(
  installation: Installation,
  scopes: SkillScope[],
): Promise<ScopeCount[]> {
  return Promise.all(
    scopes.map(async (scope) => {
      const dir = resolveInstallPaths(installation.projectDir, scope).agentsDir;
      return { dir, count: await countDirEntries(dir, isCompiledAgentFile) };
    }),
  );
}

function isCompiledAgentFile(entry: Dirent): boolean {
  return entry.isFile() && entry.name.endsWith(AGENT_FILE_EXTENSION);
}

/** Counts entries in `dir` matching `pred`; 0 when the directory is missing or unreadable. */
async function countDirEntries(dir: string, pred: (entry: Dirent) => boolean): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(pred).length;
  } catch {
    return 0;
  }
}

/** Counts skills discoverable via settings.json and the global plugin cache; 0 on failure. */
async function countPluginSkills(projectDir: string): Promise<number> {
  try {
    return Object.keys(await discoverAllPluginSkills(projectDir)).length;
  } catch {
    return 0;
  }
}

export function formatInstallationDisplay(info: InstallationInfo): string {
  const agentDirLines = info.agentDirs.map((dir) => `\n  Agents:  ${dir}`).join("");

  return `Installation: ${info.name}
  Mode:    ${INSTALL_MODE_LABELS[info.mode]}
  Skills:  ${info.skillCount}
  Agents:  ${info.agentCount}
  Config:  ${info.configPath}${agentDirLines}`;
}
