import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../plugins/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../plugins/index.js")>()),
  discoverAllPluginSkills: vi.fn(),
}));

vi.mock("../../../utils/logger.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../utils/logger.js")>()),
  verbose: vi.fn(),
}));

import { discoverInstalledSkills } from "./discover-skills.js";
import { discoverAllPluginSkills } from "../../plugins/index.js";
import { verbose } from "../../../utils/logger.js";
import { resolveInstallPaths } from "../../installation/index.js";
import { initializeMatrix } from "../../matrix/matrix-provider.js";
import { createMockMatrix } from "../../__tests__/factories/matrix-factories.js";
import { createMockSkillDefinition } from "../../__tests__/factories/skill-factories.js";
import { writeTestSkill } from "../../__tests__/helpers/disk-writers.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import {
  renderSkillMd,
  renderUnparseableMetadataYaml,
} from "../../__tests__/content-generators.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { SKILLS } from "../../__tests__/test-fixtures.js";
import { STANDARD_FILES } from "../../../consts.js";
import type { SkillDefinitionMap } from "../../../types/index.js";

const mockDiscoverAllPluginSkills = vi.mocked(discoverAllPluginSkills);

/** Plugin skills are scripted per root; copied-in skills are written to disk at each scope. */
describe("discoverInstalledSkills", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await createTempDir("cc-discover-installed-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    initializeMatrix(createMockMatrix(SKILLS.react, SKILLS.hono));
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  const globalSkillsDir = (): string => resolveInstallPaths(home.dir, "global").skillsDir;
  const projectSkillsDir = (): string => resolveInstallPaths(projectDir, "project").skillsDir;

  function pluginSkillsAt(byRoot: { global: SkillDefinitionMap; project: SkillDefinitionMap }) {
    mockDiscoverAllPluginSkills.mockImplementation((root) =>
      Promise.resolve(root === home.dir ? byRoot.global : byRoot.project),
    );
  }

  async function writeUnusableSkill(skillsDir: string, dirName: string): Promise<void> {
    const skillDir = path.join(skillsDir, dirName);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), renderSkillMd(dirName));
    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      renderUnparseableMetadataYaml(),
    );
  }

  it("counts plugin and copied-in skills at both scopes, and says what it found where", async () => {
    pluginSkillsAt({
      global: { [SKILLS.zustand.id]: createMockSkillDefinition(SKILLS.zustand.id) },
      project: { [SKILLS.vitest.id]: createMockSkillDefinition(SKILLS.vitest.id) },
    });
    await writeTestSkill(globalSkillsDir(), SKILLS.react.id);
    await writeTestSkill(projectSkillsDir(), SKILLS.hono.id);

    const { allSkills, ...counts } = await discoverInstalledSkills(projectDir);

    expect(Object.keys(allSkills).toSorted()).toStrictEqual(
      [SKILLS.react.id, SKILLS.hono.id, SKILLS.zustand.id, SKILLS.vitest.id].toSorted(),
    );
    expect(counts).toStrictEqual({
      totalSkillCount: 4,
      pluginSkillCount: 2,
      localSkillCount: 2,
      globalPluginSkillCount: 1,
      globalLocalSkillCount: 1,
      unusableMetadata: [],
    });
    expect(verbose).toHaveBeenCalledWith("  Found 1 skills from global plugins");
    expect(verbose).toHaveBeenCalledWith(`  Found 1 global local skills from ${globalSkillsDir()}`);
    expect(verbose).toHaveBeenCalledWith("  Found 1 skills from installed plugins");
    expect(verbose).toHaveBeenCalledWith(`  Found 1 local skills from ${projectSkillsDir()}`);
  });

  it("says nothing about the global scope when it holds no skills", async () => {
    pluginSkillsAt({ global: {}, project: {} });

    await discoverInstalledSkills(projectDir);

    expect(verbose).not.toHaveBeenCalledWith("  Found 0 skills from global plugins");
    expect(verbose).not.toHaveBeenCalledWith(
      `  Found 0 global local skills from ${globalSkillsDir()}`,
    );
  });

  it("reports the unusable metadata of both scopes, the global scope's first", async () => {
    pluginSkillsAt({ global: {}, project: {} });
    await writeUnusableSkill(globalSkillsDir(), "broken-global");
    await writeUnusableSkill(projectSkillsDir(), "broken-project");

    const { unusableMetadata } = await discoverInstalledSkills(projectDir);

    expect(unusableMetadata).toStrictEqual([
      expect.objectContaining({ skillDirName: "broken-global" }),
      expect.objectContaining({ skillDirName: "broken-project" }),
    ]);
  });
});
