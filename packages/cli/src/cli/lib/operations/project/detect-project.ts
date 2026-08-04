import { detectInstallation, type Installation } from "../../installation/index.js";
import { ConfigLoadError, loadProjectConfig } from "../../configuration/index.js";
import type { ProjectConfig } from "../../../types/index.js";

export type DetectedProject = {
  installation: Installation;
  config: ProjectConfig | null;
  configPath: string | null;
};

/**
 * Detects an existing CLI installation and loads its project config.
 *
 * Uses detectInstallation() which checks project-level first, then falls back
 * to global. Returns the installation metadata plus the loaded config.
 *
 * Does NOT throw. Returns null when no installation is found OR when the config
 * file exists but is corrupt — the caller (doctor, edit) reports the resulting
 * null as a config/installation problem to the user. `compile` deliberately
 * does NOT use this wrapper: it detects scopes directly so it can hard-error on
 * a corrupt config instead of degrading to null.
 */
export async function detectProject(projectDir?: string): Promise<DetectedProject | null> {
  const resolvedDir = projectDir ?? process.cwd();

  let installation: Installation | null;
  try {
    installation = await detectInstallation(resolvedDir);
  } catch (error) {
    if (error instanceof ConfigLoadError) return null;
    throw error;
  }

  if (!installation) {
    return null;
  }

  const loaded = await loadProjectConfig(installation.projectDir);

  return {
    installation,
    config: loaded?.config ?? null,
    configPath: loaded?.configPath ?? null,
  };
}
