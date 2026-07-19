import os from "os";
import path from "path";
import type { SkillConfig } from "../../types/config.js";
import { CLAUDE_DIR, CLAUDE_SRC_DIR, LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../consts.js";

/**
 * Base directory for a scope's installed artifacts: the home directory for
 * `"global"` scope, the project directory otherwise (absent scope defaults to
 * project). Calls `os.homedir()` at runtime so test home-dir mocks apply.
 */
export function installBaseDir(
  projectDir: string,
  scope: SkillConfig["scope"] | undefined,
): string {
  return scope === "global" ? os.homedir() : projectDir;
}

export type InstallPaths = {
  skillsDir: string;
  agentsDir: string;
  configPath: string;
};

export function resolveInstallPaths(
  projectDir: string,
  scope: "project" | "global" = "project",
): InstallPaths {
  const baseDir = installBaseDir(projectDir, scope);
  return {
    skillsDir: path.join(baseDir, LOCAL_SKILLS_PATH),
    agentsDir: path.join(baseDir, CLAUDE_DIR, "agents"),
    configPath: path.join(baseDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
  };
}
