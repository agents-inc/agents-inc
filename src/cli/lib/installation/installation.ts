import os from "os";
import path from "path";
import { fileExists } from "../../utils/fs";
import { loadProjectConfigFromDir } from "../configuration/project-config";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  PLUGINS_SUBDIR,
  STANDARD_FILES,
} from "../../consts";
import type { SkillConfig } from "../../types/config";

export type InstallMode = "eject" | "plugin" | "mixed";

export type Installation = {
  mode: InstallMode;
  configPath: string;
  agentsDir: string;
  skillsDir: string;
  projectDir: string;
};

/** Derive install mode from skills array at runtime */
export function deriveInstallMode(skills: SkillConfig[]): InstallMode {
  if (skills.length === 0) return "eject";
  const hasEject = skills.some((s) => s.source === "eject");
  const hasPlugin = skills.some((s) => s.source !== "eject");
  if (hasEject && hasPlugin) return "mixed";
  return hasEject ? "eject" : "plugin";
}

/** Detect installation in a specific directory only (no global fallback). */
export async function detectProjectInstallation(projectDir: string): Promise<Installation | null> {
  const configPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

  if (!(await fileExists(configPath))) {
    return null;
  }

  // Use loadProjectConfigFromDir to avoid circular global fallback
  const loaded = await loadProjectConfigFromDir(projectDir);

  const mode: InstallMode = deriveInstallMode(loaded?.config?.skills ?? []);

  return {
    mode,
    configPath,
    agentsDir: path.join(projectDir, CLAUDE_DIR, "agents"),
    // Mixed mode has local skills in .claude/skills/ and plugins in cache;
    // use .claude/skills/ as the primary skillsDir (same as eject mode)
    skillsDir: path.join(projectDir, CLAUDE_DIR, mode === "plugin" ? PLUGINS_SUBDIR : "skills"),
    projectDir,
  };
}

/** Detect installation in the home directory (global scope). */
export async function detectGlobalInstallation(): Promise<Installation | null> {
  const homeDir = os.homedir();
  const configPath = path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

  if (!(await fileExists(configPath))) {
    return null;
  }

  // Use loadProjectConfigFromDir directly to avoid recursion
  const loaded = await loadProjectConfigFromDir(homeDir);
  const mode: InstallMode = deriveInstallMode(loaded?.config?.skills ?? []);

  return {
    mode,
    configPath,
    agentsDir: path.join(homeDir, CLAUDE_DIR, "agents"),
    skillsDir: path.join(homeDir, CLAUDE_DIR, mode === "plugin" ? PLUGINS_SUBDIR : "skills"),
    projectDir: homeDir,
  };
}

/**
 * Detect installation: checks project-level first, then falls back to global (home directory).
 * Project fully overrides global (no merging).
 */
export async function detectInstallation(
  projectDir: string = process.cwd(),
): Promise<Installation | null> {
  // 1. Check project-level first
  const projectInstallation = await detectProjectInstallation(projectDir);
  if (projectInstallation) return projectInstallation;

  // 2. Fall back to global (home directory)
  return detectGlobalInstallation();
}

export async function getInstallationOrThrow(
  projectDir: string = process.cwd(),
): Promise<Installation> {
  const installation = await detectInstallation(projectDir);

  if (!installation) {
    throw new Error(
      `No ${DEFAULT_BRANDING.NAME} installation found.\nRun '${CLI_INVOKE_COMMAND} init' to create one.`,
    );
  }

  return installation;
}
