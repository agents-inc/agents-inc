import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_PSEUDO_CATEGORY, LOCAL_SKILLS_PATH } from "../../../consts";
import { createMockMatrix } from "../../__tests__/factories/matrix-factories";
import { writeTestSkill } from "../../__tests__/helpers/disk-writers";
import { setupIsolatedHome, type IsolatedHome } from "../../__tests__/helpers/isolated-home";
import { SKILLS } from "../../__tests__/test-fixtures";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { setVerbose } from "../../../utils/logger";
import { typedKeys } from "../../../utils/typed-object";
import type { SkillId } from "../../../types";
import { discoverInstalledSkills } from "./discover-skills";

// The real logger remembers what it said for the whole file, so no two specs say the same global line.

const PROJECTS = ["project-one", "project-two"] as const;

const REGISTERED = SKILLS.react;
const PLACEHOLDER_CATEGORY = SKILLS.pinia;

const ONE_PROJECT_FOLDER_SKIPPED =
  "  Warning: Skipped 1 skill in '.claude/skills/' that isn't registered with the CLI (no metadata.yaml).";

/** The global folder named apart from a project's own `.claude/skills/`, as `~/` or in full. */
const ONE_GLOBAL_FOLDER_SKIPPED = expect.stringMatching(
  /^ {2}Warning: Skipped 1 skill in '.+\.claude\/skills\/' that isn't registered with the CLI \(no metadata\.yaml\)\.$/,
);

const TWO_GLOBAL_FOLDERS_SKIPPED = expect.stringMatching(
  /^ {2}Warning: Skipped 2 skills in '.+\.claude\/skills\/' that aren't registered with the CLI \(no metadata\.yaml\)\.$/,
);

function writeStraySkill(scopeRoot: string, skillId: SkillId): Promise<string> {
  return writeTestSkill(path.join(scopeRoot, LOCAL_SKILLS_PATH), skillId, { skipMetadata: true });
}

function writeRegisteredSkill(scopeRoot: string, skillId: SkillId): Promise<string> {
  return writeTestSkill(path.join(scopeRoot, LOCAL_SKILLS_PATH), skillId);
}

function writePlaceholderCategorySkill(scopeRoot: string, skillId: SkillId): Promise<string> {
  return writeTestSkill(path.join(scopeRoot, LOCAL_SKILLS_PATH), skillId, {
    extraMetadata: { category: LOCAL_PSEUDO_CATEGORY },
  });
}

describe("skill folders missing their metadata.yaml, across one run's discoveries", () => {
  let home: IsolatedHome;
  let projectDirs: string[];
  let projectDir: string;

  beforeEach(async () => {
    home = await setupIsolatedHome("global-skill-said-once-");
    projectDirs = PROJECTS.map((name) => path.join(home.tempDir, name));
    projectDir = path.join(home.tempDir, PROJECTS[0]);
    await Promise.all(projectDirs.map((dir) => mkdir(dir, { recursive: true })));
    initializeMatrix(createMockMatrix(REGISTERED, PLACEHOLDER_CATEGORY));
  });

  afterEach(async () => {
    setVerbose(false);
    vi.restoreAllMocks();
    await home.cleanup();
  });

  it("in the global installation, are said in one line once by a run discovering for HOME and for every project", async () => {
    const stray: SkillId = "web-framework-react";
    await writeStraySkill(home.fakeHome, stray);
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    const discovered = await Promise.all(
      [home.fakeHome, ...projectDirs].map((dir) => discoverInstalledSkills(dir)),
    );

    expect(said.mock.calls).toStrictEqual([[ONE_GLOBAL_FOLDER_SKIPPED]]);
    expect(
      discovered.map((result) => typedKeys<SkillId>(result.allSkills)),
      "every discovery still leaves the skill out",
    ).toStrictEqual([[], [], []]);
  });

  it("in each project, are said in one line per project, since two projects' copies are two files", async () => {
    const stray: SkillId = "api-framework-hono";
    await Promise.all(projectDirs.map((dir) => writeStraySkill(dir, stray)));
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    await Promise.all(projectDirs.map((dir) => discoverInstalledSkills(dir)));

    expect(said.mock.calls).toStrictEqual([
      [ONE_PROJECT_FOLDER_SKIPPED],
      [ONE_PROJECT_FOLDER_SKIPPED],
    ]);
  });

  it("are counted into one line naming the folder, which leaves out the registered and placeholder-category skills", async () => {
    const strays: SkillId[] = ["web-state-zustand", "api-framework-hono", "web-testing-vitest"];
    await Promise.all(strays.map((stray) => writeStraySkill(projectDir, stray)));
    await writeRegisteredSkill(projectDir, REGISTERED.id);
    await writePlaceholderCategorySkill(projectDir, PLACEHOLDER_CATEGORY.id);
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { allSkills } = await discoverInstalledSkills(projectDir);

    expect(said.mock.calls).toStrictEqual([
      [
        "  Warning: Skipped 3 skills in '.claude/skills/' that aren't registered with the CLI (no metadata.yaml).",
      ],
    ]);
    expect(typedKeys<SkillId>(allSkills), "only the registered skill is discovered").toStrictEqual([
      REGISTERED.id,
    ]);
  });

  it("are said nowhere when every folder carries a metadata.yaml", async () => {
    await writeRegisteredSkill(projectDir, REGISTERED.id);
    await writePlaceholderCategorySkill(projectDir, PLACEHOLDER_CATEGORY.id);
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { allSkills } = await discoverInstalledSkills(projectDir);

    expect(said.mock.calls).toStrictEqual([]);
    expect(typedKeys<SkillId>(allSkills)).toStrictEqual([REGISTERED.id]);
  });

  it("are each named under --verbose, beside the one line", async () => {
    const strays: SkillId[] = ["web-state-zustand", "web-testing-vitest"];
    await Promise.all(strays.map((stray) => writeStraySkill(projectDir, stray)));
    setVerbose(true);
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    await discoverInstalledSkills(projectDir);

    expect(said.mock.calls).toStrictEqual([
      [
        "  Warning: Skipped 2 skills in '.claude/skills/' that aren't registered with the CLI (no metadata.yaml).",
      ],
    ]);
    for (const stray of strays) {
      expect(logged).toHaveBeenCalledWith(expect.stringContaining(stray));
    }
  });

  it("in both scopes of a project run, are said in one line per folder, the global one named apart", async () => {
    await Promise.all([
      writeStraySkill(home.fakeHome, "web-state-zustand"),
      writeStraySkill(home.fakeHome, "web-testing-vitest"),
      writeStraySkill(projectDir, "web-state-zustand"),
      writeStraySkill(projectDir, "web-testing-vitest"),
    ]);
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    await discoverInstalledSkills(projectDir);

    expect(said.mock.calls).toStrictEqual([
      [TWO_GLOBAL_FOLDERS_SKIPPED],
      [
        "  Warning: Skipped 2 skills in '.claude/skills/' that aren't registered with the CLI (no metadata.yaml).",
      ],
    ]);
  });
});
