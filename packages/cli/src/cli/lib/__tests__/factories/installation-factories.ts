import path from "path";

import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  PLUGINS_SUBDIR,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../../consts.js";

import type { Installation } from "../../installation/index.js";

/** The project root every installation below is rooted at unless a caller names another. */
const FACTORY_PROJECT_DIR = "/project";

/**
 * An eject-mode installation rooted at `/project` — a project context whose global root is HOME.
 *
 * What `detectInstallation` answers, for a spec that mocks it. **A caller whose code under test reads
 * the disk overrides `projectDir`**: `getInstallationInfo` loads the config from it and resolves every
 * agents directory from it (`resolveInstallPaths(installation.projectDir, scope)`), so an `agentsDir`
 * override alone reaches nothing that reads the disk. Override `agentsDir` or `skillsDir` only where
 * the code under test reads that FIELD — a report that names it back. _Corrected 2026-09-26: this
 * said to override the directory an assertion reads, which sent callers to `agentsDir`._
 */
export function buildInstallation(overrides: Partial<Installation> = {}): Installation {
  return {
    mode: "eject",
    configPath: path.join(FACTORY_PROJECT_DIR, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
    agentsDir: path.join(FACTORY_PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS),
    skillsDir: path.join(FACTORY_PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.SKILLS),
    projectDir: FACTORY_PROJECT_DIR,
    ...overrides,
  };
}

/** The same installation in plugin mode, whose skills live in the plugin registry. */
export function buildPluginInstallation(overrides: Partial<Installation> = {}): Installation {
  return buildInstallation({
    mode: "plugin",
    skillsDir: path.join(FACTORY_PROJECT_DIR, CLAUDE_DIR, PLUGINS_SUBDIR),
    ...overrides,
  });
}
