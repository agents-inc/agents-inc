import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_SKILLS_PATH } from "../../../consts";
import { writeTestSkill } from "../../__tests__/helpers/disk-writers";
import { setupIsolatedHome, type IsolatedHome } from "../../__tests__/helpers/isolated-home";
import { typedKeys } from "../../../utils/typed-object";
import type { SkillId } from "../../../types";
import { discoverInstalledSkills } from "./discover-skills";

// The real logger remembers what it said for the whole file, so each spec uses distinct skill ids.

const PROJECTS = ["project-one", "project-two"] as const;

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
