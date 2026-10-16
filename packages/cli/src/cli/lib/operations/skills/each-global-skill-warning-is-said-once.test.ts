import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_SKILLS_PATH } from "../../../consts";
import { writeTestSkill } from "../../__tests__/helpers/disk-writers";
import { setupIsolatedHome, type IsolatedHome } from "../../__tests__/helpers/isolated-home";
import { typedKeys } from "../../../utils/typed-object";
import type { SkillId } from "../../../types";
import { discoverInstalledSkills } from "./discover-skills";

/**
 * A run says what it finds wrong with the global installation's skills once, however many
 * projects it discovers skills for.
 *
 * A global `compile` or `edit --from` discovers the installed skills for itself and then again for
 * every registered project its fan-out recompiles, and each project's discovery reads the global
 * scope as well as its own. The global scope is one directory for every project, so a skill copied
 * into it with no metadata.yaml was said 1 + N times for N registered projects.
 *
 * The logger is real here and holds what it has said for the life of the file, which is why each
 * spec names its skills apart from every other's: the line names the skill directory relative to
 * its scope, not the temporary directory it sits in.
 */

const PROJECTS = ["project-one", "project-two"] as const;

/** Writes a skill directory holding a SKILL.md and no metadata.yaml. */
function writeStraySkill(scopeRoot: string, skillId: SkillId): Promise<string> {
  return writeTestSkill(path.join(scopeRoot, LOCAL_SKILLS_PATH), skillId, { skipMetadata: true });
}

describe("a skill missing its metadata.yaml, across one run's discoveries", () => {
  let home: IsolatedHome;
  let projectDirs: string[];

  beforeEach(async () => {
    home = await setupIsolatedHome("global-skill-said-once-");
    projectDirs = PROJECTS.map((name) => path.join(home.tempDir, name));
    await Promise.all(projectDirs.map((dir) => mkdir(dir, { recursive: true })));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await home.cleanup();
  });

  it("in the global installation, is said once by a run discovering for HOME and for every project", async () => {
    const stray: SkillId = "web-framework-react";
    await writeStraySkill(home.fakeHome, stray);
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    const discovered = await Promise.all(
      [home.fakeHome, ...projectDirs].map((dir) => discoverInstalledSkills(dir)),
    );

    expect(said.mock.calls).toStrictEqual([[expect.stringContaining(`Skill '${stray}' in`)]]);
    expect(
      discovered.map((result) => typedKeys<SkillId>(result.allSkills)),
      "every discovery still leaves the skill out",
    ).toStrictEqual([[], [], []]);
  });

  it("in each project, is said once per project, since two projects' copies are two files", async () => {
    const stray: SkillId = "api-framework-hono";
    await Promise.all(projectDirs.map((dir) => writeStraySkill(dir, stray)));
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    await Promise.all(projectDirs.map((dir) => discoverInstalledSkills(dir)));

    expect(said.mock.calls).toStrictEqual([
      [expect.stringContaining(`Skill '${stray}' in`)],
      [expect.stringContaining(`Skill '${stray}' in`)],
    ]);
  });
});
