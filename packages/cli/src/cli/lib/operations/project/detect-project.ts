import { detectInstallation, type Installation } from "../../installation/index.js";
import { ConfigLoadError, loadProjectConfig } from "../../configuration/index.js";
import type { ProjectConfig } from "../../../types/index.js";

export type DetectedProject = {
  installation: Installation;
  config: ProjectConfig | null;
  configPath: string | null;
};

/** Degrades: a corrupt config answers null, as a missing installation does. */
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
