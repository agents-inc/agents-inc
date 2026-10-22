import path from "path";
import type { Provider } from "../../consts.js";
import type { SkillScope } from "../../types/config.js";
import { STANDARD_FILES } from "../../consts.js";
import {
  agentsDir,
  installBaseDir,
  providerInUse,
  skillsDir,
  sourceFolderInUse,
} from "./install-layout.js";

export { installBaseDir };

export function getProjectConfigPath(dir: string, provider: Provider): string {
  return path.join(sourceFolderInUse(dir, provider).dir, STANDARD_FILES.CONFIG_TS);
}

export function getInstalledConfigPath(dir: string): string {
  return getProjectConfigPath(dir, providerInUse(dir));
}

export type InstallPaths = {
  skillsDir: string;
  agentsDir: string;
  configPath: string;
};

export function resolveInstallPaths(
  projectDir: string,
  scope: SkillScope = "project",
): InstallPaths {
  const baseDir = installBaseDir(projectDir, scope);
  // Read once so all three paths name the same installation.
  const provider = providerInUse(baseDir);

  return {
    skillsDir: skillsDir(provider, scope, projectDir),
    agentsDir: agentsDir(provider, scope, projectDir),
    configPath: getProjectConfigPath(baseDir, provider),
  };
}
