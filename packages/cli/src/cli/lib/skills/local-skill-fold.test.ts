import path from "path";
import { readFile, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/logger");

import { foldLocalSkillIntoGlobal } from "./local-skill-mover";
import { resolveInstallPaths } from "../installation/install-base-dir";
import { writeTestSkill } from "../__tests__/helpers/disk-writers";
import { setupIsolatedHome, type IsolatedHome } from "../__tests__/helpers/isolated-home";
import { directoryExists, fileExists } from "../__tests__/test-fs-utils";
import { SKILLS } from "../__tests__/test-fixtures";
import { STANDARD_FILES } from "../../consts";

/**
 * `s` on a `[P][G]` pair whose halves are both Local folds the project's copy into the global
 * install, which every project reads. Kept apart from `local-skill-mover.test.ts`, which mocks
 * `utils/fs` wholesale: what the global folder holds afterwards is only observable on disk.
 */

/** A file only the global copy holds, which a fold must not leave beside the project's copy. */
const GLOBAL_ONLY_FILE = "global-only.md";

describe("foldLocalSkillIntoGlobal", () => {
  let home: IsolatedHome;

  beforeEach(async () => {
    home = await setupIsolatedHome("cc-local-skill-fold-");
  });

  afterEach(async () => {
    await home.cleanup();
  });

  const skillsDirAt = (scope: "project" | "global"): string =>
    resolveInstallPaths(home.projectDir, scope).skillsDir;

  it("replaces the global copy with the project's, whole, and moves the project's away", async () => {
    const globalCopy = await writeTestSkill(skillsDirAt("global"), SKILLS.react.id, {
      skipMetadata: true,
      skillContent: "the global copy\n",
    });
    await writeFile(path.join(globalCopy, GLOBAL_ONLY_FILE), "only the global copy has this\n");
    const projectCopy = await writeTestSkill(skillsDirAt("project"), SKILLS.react.id, {
      skipMetadata: true,
      skillContent: "the project's copy, edited\n",
    });

    await foldLocalSkillIntoGlobal(home.projectDir, SKILLS.react.id);

    expect(
      await readFile(path.join(globalCopy, STANDARD_FILES.SKILL_MD), "utf-8"),
      "the global copy is the project's now, edits included",
    ).toBe("the project's copy, edited\n");
    expect(
      await fileExists(path.join(globalCopy, GLOBAL_ONLY_FILE)),
      "a fold replaces the global copy rather than merging into it",
    ).toBe(false);
    expect(await directoryExists(projectCopy), "the project's copy is moved, not copied").toBe(
      false,
    );
  });
});
