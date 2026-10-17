import { readdir } from "fs/promises";
import path from "path";
import { expect } from "vitest";
import { DIRS } from "../pages/constants.js";
import { fileExists, directoryExists } from "../helpers/test-utils.js";
import { expectNoSourceFolder } from "./source-folder-assertions.js";
import "../matchers/setup.js";

// "Preserved" means the whole roster of each directory, so an uninstall that removed nothing fails.
export async function expectCleanUninstall(
  dir: string,
  options?: {
    removeConfig?: boolean;
    preservedSkills?: readonly string[];
    preservedAgentFiles?: readonly string[];
  },
): Promise<void> {
  const skillsDir = path.join(dir, DIRS.CLAUDE, DIRS.SKILLS);
  if (options?.preservedSkills?.length) {
    await expect({ dir }).toHaveLocalSkills(options.preservedSkills);
    expect(
      (await readdir(skillsDir)).sort(),
      "uninstall left a skill beside the ones it was meant to preserve",
    ).toStrictEqual([...options.preservedSkills].sort());
  } else {
    await expect({ dir }).toHaveNoLocalSkills();
  }

  const agentsDir = path.join(dir, DIRS.CLAUDE, DIRS.AGENTS);
  if (options?.preservedAgentFiles?.length) {
    for (const file of options.preservedAgentFiles) {
      expect(await fileExists(path.join(agentsDir, file))).toBe(true);
    }
    expect(
      (await readdir(agentsDir)).sort(),
      "uninstall left an agent file beside the ones it was meant to preserve",
    ).toStrictEqual([...options.preservedAgentFiles].sort());
  } else {
    expect(await directoryExists(agentsDir)).toBe(false);
  }

  if (options?.removeConfig) {
    await expectNoSourceFolder(dir, "uninstall removed the config manifest it was asked to remove");
  }
}
