import { readdir } from "fs/promises";
import path from "path";
import { expect } from "vitest";
import { DIRS } from "../pages/constants.js";
import { fileExists, directoryExists } from "../helpers/test-utils.js";
import { expectNoSourceFolder } from "./source-folder-assertions.js";
import "../matchers/setup.js";

/**
 * `removeConfig` asked after ONE folder until 2026-09-20, and an install this release creates
 * never has that folder — so the check was true of every one of the eleven call sites whatever
 * uninstall had left behind, including an emptied `.agents-inc/` naming this product with nothing
 * in it. `expectNoSourceFolder` asks after every name a source folder is spelled in, the parent
 * included, and names the one it found rather than reporting a boolean.
 *
 * **"Preserved" means these and nothing else.** Until 2026-09-26 `preservedSkills` and
 * `preservedAgentFiles` asked only that each named entry was still there, so an uninstall that
 * removed NOTHING satisfied both — the preserved entry is present, and so is everything uninstall
 * should have taken. Each is now the whole roster of its directory.
 */

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
