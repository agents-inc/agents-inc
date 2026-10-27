import os from "os";
import { fileExists } from "../../utils/fs";
import {
  ConfigLoadError,
  declaresNoContent,
  loadProjectConfigFromDir,
} from "../configuration/project-config";
import { EJECT_SOURCE, type Provider } from "../../consts";
import { getProjectConfigPath } from "./install-base-dir";
import { agentsDir, inheritedGlobalProvider, providerInUse } from "./install-layout";
import type { SkillConfig, SkillScope } from "../../types/config";
import type { InstallMode } from "../../types/matrix";

export type { InstallMode };

export const INSTALL_MODE_LABELS = {
  plugin: "Plugin",
  mixed: "Mixed",
  eject: "Eject",
} as const satisfies Record<InstallMode, string>;

/**
 * No directory is named: it depends on host and scope, and one selection can span several.
 * `mixed` is absent because nothing is switched to it.
 */
export const INSTALL_MODE_DESCRIPTIONS = {
  plugin: `${INSTALL_MODE_LABELS.plugin} (native install)`,
  eject: `${INSTALL_MODE_LABELS.eject} (local copy)`,
} as const satisfies Record<Exclude<InstallMode, "mixed">, string>;

export type Installation = {
  mode: InstallMode;
  configPath: string;
  agentsDir: string;
  projectDir: string;
};

export function deriveInstallMode(skills: SkillConfig[]): InstallMode {
  if (skills.length === 0) return "eject";
  const hasEject = skills.some((s) => s.origin === EJECT_SOURCE);
  const hasPlugin = skills.some((s) => s.origin !== EJECT_SOURCE);
  if (hasEject && hasPlugin) return "mixed";
  return hasEject ? "eject" : "plugin";
}

async function detectInstallationInDir(
  dir: string,
  scope: SkillScope,
  provider: Provider = providerInUse(dir),
): Promise<Installation | null> {
  const configPath = getProjectConfigPath(dir, provider);

  if (!(await fileExists(configPath))) {
    return null;
  }

  // Aborts: a corrupt config throws ConfigLoadError to the caller rather than reading as absent.
  const loaded = await loadProjectConfigFromDir(dir, provider);
  if (!loaded) {
    // Vanished since the fileExists check.
    return null;
  }

  // Content-less is not an installation, so init routes to the editor.
  if (declaresNoContent(loaded.config)) {
    return null;
  }

  return {
    mode: deriveInstallMode(loaded.config.skills),
    configPath,
    agentsDir: agentsDir(provider, scope, dir),
    projectDir: dir,
  };
}

/** No global fallback. */
export async function detectProjectInstallation(projectDir: string): Promise<Installation | null> {
  return detectInstallationInDir(projectDir, "project");
}

/** Degrades: a config that exists but cannot be loaded still answers yes. */
export async function holdsItsOwnInstallation(dir: string): Promise<boolean> {
  try {
    return (await detectProjectInstallation(dir)) !== null;
  } catch (error) {
    if (error instanceof ConfigLoadError) return true;
    throw error;
  }
}

/** The global installation `projectDir` inherits. */
export async function detectGlobalInstallation(projectDir: string): Promise<Installation | null> {
  return detectInstallationInDir(os.homedir(), "global", inheritedGlobalProvider(projectDir));
}

/** Project first, else global; never merged. */
export async function detectInstallation(
  projectDir: string = process.cwd(),
): Promise<Installation | null> {
  const projectInstallation = await detectProjectInstallation(projectDir);
  if (projectInstallation) return projectInstallation;

  return detectGlobalInstallation(projectDir);
}
