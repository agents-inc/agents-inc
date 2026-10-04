import os from "os";
import path from "path";
import { fileExists } from "../../utils/fs";
import { ConfigLoadError, loadProjectConfigFromDir } from "../configuration/project-config";
import { CLAUDE_DIR, PLUGINS_SUBDIR, EJECT_SOURCE } from "../../consts";
import { getProjectConfigPath } from "./install-base-dir";
import { agentsDir, providerInUse } from "./install-layout";
import type { ProjectConfig, SkillConfig, SkillScope } from "../../types/config";
import type { InstallMode } from "../../types/matrix";

// Re-exported from types/matrix.ts for existing importers of the installation barrel
export type { InstallMode };

export const INSTALL_MODE_LABELS = {
  plugin: "Plugin",
  mixed: "Mixed",
  eject: "Eject",
} as const satisfies Record<InstallMode, string>;

/**
 * How a mode is described wherever a command tells the user what KIND of install is
 * about to happen — `init`'s install-plan line, and `edit`'s line for the skills it
 * is switching. One definition because it is one statement about one operation:
 * switching a skill to plugin mode installs it natively exactly as a fresh plugin
 * install does, and used to be announced in words `init` never printed.
 *
 * `mixed` is absent by construction. Nothing is switched TO mixed — it is a shape a
 * whole selection can have, described with per-mode counts only the install plan
 * holds, so `init` composes that one line itself.
 *
 * **Neither description names a DIRECTORY, and the eject one read `(copy to .claude/skills/)`
 * until 2026-09-22.** A constant cannot name one truthfully: the directory is the host's and
 * the scope's — `.claude/skills`, `$CODEX_HOME/skills`, `<repo>/.agents/skills` — and one
 * selection routinely spans two of them, so any single answer misnames at least one. It is also
 * said before anything is copied, where the run has nothing to report yet; `reportSkillsCopied`
 * in `commands/init.tsx` names the real directories afterwards, one block per non-empty scope.
 * The `COPIED_LOCAL_SKILLS_*` note in `e2e/pages/constants.ts` had already reached this
 * conclusion for `edit`'s copy count and stopped one line short of this constant.
 */
export const INSTALL_MODE_DESCRIPTIONS = {
  plugin: `${INSTALL_MODE_LABELS.plugin} (native install)`,
  eject: `${INSTALL_MODE_LABELS.eject} (local copy)`,
} as const satisfies Record<Exclude<InstallMode, "mixed">, string>;

export type Installation = {
  mode: InstallMode;
  configPath: string;
  agentsDir: string;
  skillsDir: string;
  projectDir: string;
};

/**
 * Whether a successfully-loaded config declares nothing to install — no skills and no agents.
 *
 * Exported rather than kept private to its one caller below because two surfaces have to agree on
 * exactly which configs are content-less: this detection, which maps them to `null` so `init`
 * routes to the wizard instead of the dashboard, and `doctor`, which has to name that state rather
 * than repeat the `null` as `not found`. Two answers to that question is how one screen ended up
 * validating a file and calling it missing four lines apart.
 */
export function declaresNoContent(config: ProjectConfig): boolean {
  return config.skills.length === 0 && config.agents.length === 0;
}

/** Derive install mode from skills array at runtime */
export function deriveInstallMode(skills: SkillConfig[]): InstallMode {
  if (skills.length === 0) return "eject";
  const hasEject = skills.some((s) => s.origin === EJECT_SOURCE);
  const hasPlugin = skills.some((s) => s.origin !== EJECT_SOURCE);
  if (hasEject && hasPlugin) return "mixed";
  return hasEject ? "eject" : "plugin";
}

// Use loadProjectConfigFromDir directly (not detectInstallation) to avoid the
// project→global fallback recursing back into this detection.
async function detectInstallationInDir(
  dir: string,
  scope: SkillScope,
): Promise<Installation | null> {
  // The provider is read off the directory, because an installation's folder is the only record
  // of one — the same read the existence check and the load below both have to make, or they
  // would be asking about two different installations in one function.
  const provider = providerInUse(dir);
  const configPath = getProjectConfigPath(dir, provider);

  if (!(await fileExists(configPath))) {
    return null;
  }

  // The config file exists. loadProjectConfigFromDir throws ConfigLoadError for a
  // corrupt config, so a returned value is always a usable config — a corrupt
  // config surfaces to the caller (compile reports it) instead of silently
  // becoming a phantom eject installation that resurrects every built-in agent.
  const loaded = await loadProjectConfigFromDir(dir, provider);
  if (!loaded) {
    // The file vanished between the fileExists check and the load.
    return null;
  }

  // A successfully-loaded config that declares neither skills nor agents is
  // content-less and does not count as an installation — init must route to the
  // setup wizard, not the dashboard. This is the shared detection function, so
  // returning null here covers both the project-config and global-config
  // manifestations. A reporting surface must not read this `null` as "no config
  // here": see declaresNoContent, which doctor asks the same question of.
  if (declaresNoContent(loaded.config)) {
    return null;
  }

  const mode: InstallMode = deriveInstallMode(loaded.config.skills);

  return {
    mode,
    configPath,
    // The HOST's, per scope, and a `.claude/agents` literal until C5. `compile` hands this
    // straight to the pass as its `outputDir`, so a Codex installation compiled agent ROLE
    // definitions into `<project>/.claude/agents/` — Codex's format in Claude's directory, the
    // inverse of the defect the whole host funnel exists against, and invisible while
    // `compilesSubAgents` was short-circuiting every Codex compile before it got here.
    agentsDir: agentsDir(provider, scope, dir),
    // Mixed mode has local skills in .claude/skills/ and plugins in cache;
    // use .claude/skills/ as the primary skillsDir (same as eject mode)
    skillsDir: path.join(dir, CLAUDE_DIR, mode === "plugin" ? PLUGINS_SUBDIR : "skills"),
    projectDir: dir,
  };
}

/** Detect installation in a specific directory only (no global fallback). */
export async function detectProjectInstallation(projectDir: string): Promise<Installation | null> {
  return detectInstallationInDir(projectDir, "project");
}

/**
 * Whether `dir` holds an installation of its own, for a surface that must answer rather than
 * refuse. DEGRADE posture: a config that exists and cannot be loaded answers yes, because the file
 * is there — where {@link detectProjectInstallation} throws `ConfigLoadError` over it.
 */
export async function holdsItsOwnInstallation(dir: string): Promise<boolean> {
  try {
    return (await detectProjectInstallation(dir)) !== null;
  } catch (error) {
    if (error instanceof ConfigLoadError) return true;
    throw error;
  }
}

/** Detect installation in the home directory (global scope). */
export async function detectGlobalInstallation(): Promise<Installation | null> {
  return detectInstallationInDir(os.homedir(), "global");
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
