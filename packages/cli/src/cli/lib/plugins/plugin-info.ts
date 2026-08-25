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
  /** Every directory that actually holds compiled agents; empty when no scope has any. */
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

/**
 * The number of skills the CLI reports it manages, which is what its own configuration declares
 * and nothing else. Neither the plugin registry nor `.claude/skills/` answers that question:
 * each holds only the half of an installation its own install path writes — so a mixed install
 * read from either one reports a fraction of itself — and each also holds entries this CLI never
 * wrote, which it has no business claiming. The install mode is therefore irrelevant here.
 *
 * A tombstone (`excluded: true`) records a skill this project has switched OFF, so it is not one
 * of them; and a skill enabled under both roots is two registrations of one skill, so the entries
 * merge by id.
 */
function countManagedSkills(loaded: LoadedProjectConfig | null): number {
  if (!loaded) return 0;

  const managed = loaded.config.skills.filter((skill) => !skill.excluded);
  return new Set(managed.map((skill) => skill.id)).size;
}

/**
 * Scopes whose compiled agents belong to this installation, in report order
 * (global first, mirroring the init success report). A project context also owns
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

export function formatInstallationDisplay(info: InstallationInfo): string {
  const agentDirLines = info.agentDirs.map((dir) => `\n  Agents:  ${dir}`).join("");

  return `Installation: ${info.name}
  Mode:    ${INSTALL_MODE_LABELS[info.mode]}
  Skills:  ${info.skillCount}
  Agents:  ${info.agentCount}
  Config:  ${info.configPath}${agentDirLines}`;
}
