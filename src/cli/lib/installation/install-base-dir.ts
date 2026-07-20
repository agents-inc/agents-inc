import os from "os";
import path from "path";
import type { SkillScope } from "../../types/config.js";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  LOCAL_SKILLS_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../consts.js";

/**
 * Base directory for a scope's installed artifacts: the home directory for
 * `"global"` scope, the project directory otherwise (absent scope defaults to
 * project). Calls `os.homedir()` at runtime so test home-dir mocks apply.
 */
export function installBaseDir(projectDir: string, scope: SkillScope | undefined): string {
  return scope === "global" ? os.homedir() : projectDir;
}

/** Path to the unified project config (`<dir>/.claude-src/config.ts`). */
export function getProjectConfigPath(dir: string): string {
  return path.join(dir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
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
  return {
    skillsDir: path.join(baseDir, LOCAL_SKILLS_PATH),
    agentsDir: path.join(baseDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS),
    configPath: getProjectConfigPath(baseDir),
  };
}
