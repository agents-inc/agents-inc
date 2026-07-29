import os from "os";
import path from "path";
import { fileExists } from "../../utils/fs";
import { loadProjectConfigFromDir } from "../configuration/project-config";
import {
  CLAUDE_DIR,
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  PLUGINS_SUBDIR,
  STANDARD_DIRS,
  EJECT_SOURCE,
} from "../../consts";
import { getProjectConfigPath } from "./install-base-dir";
import type { SkillConfig } from "../../types/config";
import type { InstallMode } from "../../types/matrix";

// Re-exported from types/matrix.ts for existing importers of the installation barrel
export type { InstallMode };

export const INSTALL_MODE_LABELS = {
  plugin: "Plugin",
  mixed: "Mixed",
  eject: "Eject",
} as const satisfies Record<InstallMode, string>;

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
  const hasEject = skills.some((s) => s.source === EJECT_SOURCE);
  const hasPlugin = skills.some((s) => s.source !== EJECT_SOURCE);
  if (hasEject && hasPlugin) return "mixed";
  return hasEject ? "eject" : "plugin";
}

// Use loadProjectConfigFromDir directly (not detectInstallation) to avoid the
// project→global fallback recursing back into this detection.
async function detectInstallationInDir(dir: string): Promise<Installation | null> {
  const configPath = getProjectConfigPath(dir);

  if (!(await fileExists(configPath))) {
    return null;
  }

  // The config file exists. loadProjectConfigFromDir throws ConfigLoadError for a
  // corrupt config, so a returned value is always a usable config — a corrupt
  // config surfaces to the caller (compile reports it) instead of silently
  // becoming a phantom eject installation that resurrects every built-in agent.
  const loaded = await loadProjectConfigFromDir(dir);
  if (!loaded) {
    // The file vanished between the fileExists check and the load.
    return null;
  }

  // A successfully-loaded config that declares neither skills nor agents is
  // content-less and does not count as an installation — init must route to the
  // setup wizard, not the dashboard. This is the shared detection function, so
  // returning null here covers both the project-config and global-config
  // manifestations.
  //
  // skills is asserted directly: loadProjectConfigFromDir defaults it to [].
  // agents is not defaulted by the loader, so it is guarded with `?? []` — the
  // same treatment agents gets elsewhere (see doctor.ts, config-writer.ts).
  if (loaded.config.skills.length === 0 && (loaded.config.agents ?? []).length === 0) {
    return null;
  }

  const mode: InstallMode = deriveInstallMode(loaded.config.skills);

  return {
    mode,
    configPath,
    agentsDir: path.join(dir, CLAUDE_DIR, STANDARD_DIRS.AGENTS),
    // Mixed mode has local skills in .claude/skills/ and plugins in cache;
    // use .claude/skills/ as the primary skillsDir (same as eject mode)
    skillsDir: path.join(dir, CLAUDE_DIR, mode === "plugin" ? PLUGINS_SUBDIR : "skills"),
    projectDir: dir,
  };
}

/** Detect installation in a specific directory only (no global fallback). */
export async function detectProjectInstallation(projectDir: string): Promise<Installation | null> {
  return detectInstallationInDir(projectDir);
}

/** Detect installation in the home directory (global scope). */
export async function detectGlobalInstallation(): Promise<Installation | null> {
  return detectInstallationInDir(os.homedir());
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
