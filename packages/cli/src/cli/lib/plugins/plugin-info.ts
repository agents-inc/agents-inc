import { readdir } from "fs/promises";
import type { Dirent } from "fs";

import { DEFAULT_PLUGIN_NAME } from "../../consts";
import { loadProjectConfig, type LoadedProjectConfig } from "../configuration";
import {
  detectInstallation,
  isHomeDirectory,
  resolveInstallPaths,
  INSTALL_MODE_LABELS,
  type Installation,
  type InstallMode,
} from "../installation";
import type { SkillScope } from "../../types/config";

const AGENT_FILE_EXTENSION = ".md";

export type InstallationInfo = {
  mode: InstallMode;
  name: string;
  skillCount: number;
  agentCount: number;
  configPath: string;
  agentDirs: string[];
};

export async function getInstallationInfo(): Promise<InstallationInfo | null> {
  const installation = await detectInstallation();
  if (!installation) return null;

  const loaded = await loadProjectConfig(installation.projectDir);
  const agentDirCounts = await countCompiledAgentsPerScope(
    installation,
    installedScopes(installation),
  );

  return {
    mode: installation.mode,
    name: loaded?.config.name || DEFAULT_PLUGIN_NAME,
    skillCount: countManagedSkills(loaded),
    agentCount: sumCounts(agentDirCounts),
    configPath: installation.configPath,
    agentDirs: agentDirCounts.filter(hasEntries).map((scopeCount) => scopeCount.dir),
  };
}

/** Counted from the config, not the plugin registry or skills dir, which each hold only part. */
function countManagedSkills(loaded: LoadedProjectConfig | null): number {
  if (!loaded) return 0;

  const managed = loaded.config.skills.filter((skill) => !skill.excluded);
  return new Set(managed.map((skill) => skill.id)).size;
}

/** Global first; at the home root both scopes are one directory, counted once. */
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

/** 0 when the directory is missing or unreadable. */
async function countDirEntries(dir: string, pred: (entry: Dirent) => boolean): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(pred).length;
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
