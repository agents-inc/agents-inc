import path from "path";

import { CLAUDE_DIR, PLUGINS_SUBDIR, STANDARD_DIRS } from "../../../consts.js";

import type { Installation } from "../../installation/index.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";

const FACTORY_PROJECT_DIR = "/project";

/**
 * A mocked `detectInstallation` result. Disk reads resolve from `projectDir`, so code under test
 * that reads the disk needs `projectDir` overridden; `agentsDir` alone reaches nothing.
 */
export function buildInstallation(overrides: Partial<Installation> = {}): Installation {
  return {
    mode: "eject",
    configPath: getProjectConfigPath(FACTORY_PROJECT_DIR, "claude"),
    agentsDir: path.join(FACTORY_PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.AGENTS),
    skillsDir: path.join(FACTORY_PROJECT_DIR, CLAUDE_DIR, STANDARD_DIRS.SKILLS),
    projectDir: FACTORY_PROJECT_DIR,
    ...overrides,
  };
}

export function buildPluginInstallation(overrides: Partial<Installation> = {}): Installation {
  return buildInstallation({
    mode: "plugin",
    skillsDir: path.join(FACTORY_PROJECT_DIR, CLAUDE_DIR, PLUGINS_SUBDIR),
    ...overrides,
  });
}
