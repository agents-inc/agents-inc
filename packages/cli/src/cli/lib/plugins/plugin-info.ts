import { readdir } from "fs/promises";
import type { Dirent } from "fs";

import { DEFAULT_PLUGIN_NAME, type Provider } from "../../consts";
import { loadProjectConfig } from "../configuration";
import { loadProjectConfigFromDir } from "../configuration/project-config";
import {
  deriveInstallMode,
  detectInstallation,
  detectInstallations,
  installBaseDir,
  isHomeDirectory,
  INSTALL_MODE_LABELS,
  type Installation,
  type InstallMode,
} from "../installation";
import type { DetectedInstallation } from "../installation/detect-installations";
import {
  agentCodec,
  agentsDir,
  declaresNoContent,
  providerAtScope,
} from "../installation/install-layout";
import type { ProjectConfig, SkillScope } from "../../types/config";

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

  const [loaded, agentDirCounts] = await Promise.all([
    loadProjectConfig(installation.projectDir),
    countCompiledAgentsPerScope(installation, installedScopes(installation)),
  ]);

  return {
    mode: installation.mode,
    name: loaded?.config.name || DEFAULT_PLUGIN_NAME,
    skillCount: loaded ? countManagedSkills(loaded.config) : 0,
    agentCount: sumCounts(agentDirCounts),
    configPath: installation.configPath,
    agentDirs: agentDirCounts.filter(hasEntries).map((scopeCount) => scopeCount.dir),
  };
}

/** One provider's installation, counted in its own folders and its own agent format. */
export type ProviderInstallation = {
  provider: Provider;
  mode: InstallMode;
  skillCount: number;
  agentCount: number;
  marketplace?: string;
};

/**
 * One per provider installed where a bare `init` looks — the project's, else the global ones — in
 * roster order. Each is read under its own provider, never through the run's `providerInUse`.
 */
export async function getInstallationsByProvider(cwd: string): Promise<ProviderInstallation[]> {
  const found = await detectInstallations(cwd);
  const loaded = await Promise.all(found.map((installed) => withItsConfig(installed, cwd)));
  const inView = projectsOwnElseGlobal(loaded.filter(declaresContent));

  return Promise.all(inView.map((installed) => describeInstallation(installed, cwd)));
}

type LoadedInstallation = DetectedInstallation & { config: ProjectConfig };

/** A config declaring nothing is not an installation, as `detectInstallation` holds too. */
function declaresContent(installed: LoadedInstallation | null): installed is LoadedInstallation {
  return installed !== null && !declaresNoContent(installed.config);
}

/** Global installations stand in only where the project holds none of its own. */
function projectsOwnElseGlobal(installed: LoadedInstallation[]): LoadedInstallation[] {
  const inProject = installed.filter(({ scope }) => scope === "project");
  return inProject.length > 0 ? inProject : installed;
}

/** ABORT: an unloadable config throws, as `detectInstallation` beside it would. */
async function withItsConfig(
  installed: DetectedInstallation,
  cwd: string,
): Promise<LoadedInstallation | null> {
  const loaded = await loadProjectConfigFromDir(
    installBaseDir(cwd, installed.scope),
    installed.provider,
  );
  return loaded === null ? null : { ...installed, config: loaded.config };
}

/** A global installation's agents are global; a project's sit at both scopes. */
async function describeInstallation(
  { provider, scope, config }: LoadedInstallation,
  cwd: string,
): Promise<ProviderInstallation> {
  const scopes: SkillScope[] = scope === "global" ? ["global"] : ["global", "project"];
  const { extension } = agentCodec(provider);
  const counts = await Promise.all(
    scopes.map((agentScope) =>
      countDirEntries(agentsDir(provider, agentScope, cwd), isCompiledAgentFileIn(extension)),
    ),
  );

  return {
    provider,
    mode: deriveInstallMode(config.skills),
    skillCount: countManagedSkills(config),
    agentCount: counts.reduce((total, count) => total + count, 0),
    ...(config.marketplace !== undefined && { marketplace: config.marketplace }),
  };
}

/** Counted from the config, not the plugin registry or skills dir, which each hold only part. */
function countManagedSkills(config: ProjectConfig): number {
  const managed = config.skills.filter((skill) => !skill.excluded);
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
      // Each scope's own installation, at global the inherited one, in its own agent format.
      const provider = providerAtScope(installation.projectDir, scope);
      const dir = agentsDir(provider, scope, installation.projectDir);
      return {
        dir,
        count: await countDirEntries(dir, isCompiledAgentFileIn(agentCodec(provider).extension)),
      };
    }),
  );
}

function isCompiledAgentFileIn(extension: string): (entry: Dirent) => boolean {
  return (entry) => entry.isFile() && entry.name.endsWith(extension);
}

async function countDirEntries(dir: string, pred: (entry: Dirent) => boolean): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter(pred).length;
  } catch {
    return 0;
  }
}

/** `skillLines` name skills, so they sit under the count and never under a path line. */
export function formatInstallationDisplay(
  info: InstallationInfo,
  skillLines: readonly string[] = [],
): string {
  const namedSkillLines = skillLines.map((line) => `\n    ${line}`).join("");
  const agentDirLines = info.agentDirs.map((dir) => `\n  Agents:  ${dir}`).join("");

  return `Installation: ${info.name}
  Mode:    ${INSTALL_MODE_LABELS[info.mode]}
  Skills:  ${info.skillCount}${namedSkillLines}
  Agents:  ${info.agentCount}
  Config:  ${info.configPath}${agentDirLines}`;
}
