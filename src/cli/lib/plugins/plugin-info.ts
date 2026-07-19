import { readdir } from "fs/promises";
import type { Dirent } from "fs";

import { DEFAULT_DISPLAY_VERSION, DEFAULT_PLUGIN_NAME } from "../../consts";
import { verbose } from "../../utils/logger";
import { loadProjectConfig } from "../configuration";
import { detectInstallation, type InstallMode } from "../installation";
import { getProjectPluginsDir } from "./plugin-finder";
import { discoverAllPluginSkills, listPluginNames } from "./plugin-discovery";

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
  version: string;
  skillCount: number;
  agentCount: number;
  configPath: string;
  agentsDir: string;
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

  const skillCount =
    installation.mode === "plugin"
      ? await countPluginSkills(installation.projectDir)
      : await countDirEntries(installation.skillsDir, (entry) => entry.isDirectory());
  const agentCount = await countDirEntries(
    installation.agentsDir,
    (entry) => entry.isFile() && entry.name.endsWith(".md"),
  );

  const loaded = await loadProjectConfig(installation.projectDir);
  const name = loaded?.config?.name || DEFAULT_PLUGIN_NAME;
  const version = loaded?.config
    ? installation.mode === "eject"
      ? "eject"
      : "plugin"
    : DEFAULT_DISPLAY_VERSION;

  return {
    mode: installation.mode,
    name,
    version,
    skillCount,
    agentCount,
    configPath: installation.configPath,
    agentsDir: installation.agentsDir,
    skillsDir: installation.skillsDir,
  };
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
  const modeLabel = info.mode === "eject" ? "Eject" : "Plugin";
  const versionDisplay = info.mode === "eject" ? "(eject mode)" : `v${info.version}`;

  return `Installation: ${info.name} ${versionDisplay}
  Mode:    ${modeLabel}
  Skills:  ${info.skillCount}
  Agents:  ${info.agentCount}
  Config:  ${info.configPath}
  Agents:  ${info.agentsDir}`;
}
