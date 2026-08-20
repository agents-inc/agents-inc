import path from "path";
import { expect } from "vitest";
import { DIRS } from "../pages/constants.js";
import { fileExists, directoryExists } from "../helpers/test-utils.js";
import "../matchers/setup.js";

export async function expectCleanUninstall(
  dir: string,
  options?: {
    removeConfig?: boolean;
    preservedSkills?: readonly string[];
    preservedAgentFiles?: readonly string[];
  },
): Promise<void> {
  if (options?.preservedSkills?.length) {
    await expect({ dir }).toHaveLocalSkills(options.preservedSkills);
  } else {
    await expect({ dir }).toHaveNoLocalSkills();
  }

  const agentsDir = path.join(dir, DIRS.CLAUDE, DIRS.AGENTS);
  if (options?.preservedAgentFiles?.length) {
    for (const file of options.preservedAgentFiles) {
      expect(await fileExists(path.join(agentsDir, file))).toBe(true);
    }
  } else {
    expect(await directoryExists(agentsDir)).toBe(false);
  }

  if (options?.removeConfig) {
    const configDir = path.join(dir, DIRS.CLAUDE_SRC);
    expect(await directoryExists(configDir)).toBe(false);
  }
}
