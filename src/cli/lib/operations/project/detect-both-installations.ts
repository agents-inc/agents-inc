import {
  detectGlobalInstallation,
  detectProjectInstallation,
  isHomeDirectory,
  type Installation,
} from "../../installation/index.js";

export type BothInstallations = {
  global: Installation | null;
  project: Installation | null;
  hasBoth: boolean;
};

/**
 * Detects both global and project installations.
 *
 * Skips project detection when projectDir is the home directory
 * to avoid double-compile. Returns a convenience `hasBoth` flag
 * used by callers to set scopeFilter on compile passes.
 */
export async function detectBothInstallations(projectDir: string): Promise<BothInstallations> {
  const global = await detectGlobalInstallation();

  const project = isHomeDirectory(projectDir) ? null : await detectProjectInstallation(projectDir);
  return { global, project, hasBoth: !!global && !!project };
}
