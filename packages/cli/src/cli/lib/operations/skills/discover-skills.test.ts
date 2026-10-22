import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../../__tests__/helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

import { discoverInstalledSkills } from "./discover-skills.js";
import { hostAt } from "../../hosts/host-for.js";
import { setVerbose } from "../../../utils/logger.js";
import { resolveInstallPaths } from "../../installation/index.js";
import { initializeMatrix } from "../../matrix/matrix-provider.js";
import { createMockMatrix } from "../../__tests__/factories/matrix-factories.js";
import { writeTestPluginManifest, writeTestSkill } from "../../__tests__/helpers/disk-writers.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { silenceConsole } from "../../__tests__/helpers/silence-console.js";
import {
  renderSkillMd,
  renderUnparseableMetadataYaml,
} from "../../__tests__/content-generators.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { SKILLS } from "../../__tests__/test-fixtures.js";
import { STANDARD_FILES } from "../../../consts.js";
import type { SkillId } from "../../../types/index.js";

const mockListPlugins = vi.mocked(hostAt("/any-root").listPlugins);

/**
 * The host lists each root's plugins, each a real plugin folder on disk; copied-in skills are
 * written to disk at each scope.
 */
describe("discoverInstalledSkills", () => {
  const consoleSpies = silenceConsole(["log"]);
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    setVerbose(true);
    tempDir = await createTempDir("cc-discover-installed-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    initializeMatrix(createMockMatrix(SKILLS.react, SKILLS.hono, SKILLS.zustand, SKILLS.vitest));
  });

  afterEach(async () => {
    setVerbose(false);
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  const globalSkillsDir = (): string => resolveInstallPaths(home.dir, "global").skillsDir;
  const projectSkillsDir = (): string => resolveInstallPaths(projectDir, "project").skillsDir;

  /** One plugin per skill, installed where the host says; each lists only its own root's. */
  async function pluginSkillsAt(byRoot: { global: SkillId[]; project: SkillId[] }) {
    const pluginsOf = async (ids: SkillId[]) =>
      Promise.all(
        ids.map(async (id) => {
          const installPath = path.join(tempDir, "plugin-cache", id);
          await writeTestPluginManifest(installPath, { name: id });
          await writeTestSkill(path.join(installPath, "skills"), id);
          return { pluginKey: `${id}@test-marketplace`, installPath, enabled: true };
        }),
      );
    const global = await pluginsOf(byRoot.global);
    const project = await pluginsOf(byRoot.project);
    mockListPlugins.mockImplementation((root) =>
      Promise.resolve(root === home.dir ? global : project),
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
    await pluginSkillsAt({ global: [SKILLS.zustand.id], project: [SKILLS.vitest.id] });
    await writeTestSkill(globalSkillsDir(), SKILLS.react.id);
    await writeTestSkill(projectSkillsDir(), SKILLS.hono.id);

    const { allSkills, ...counts } = await discoverInstalledSkills(projectDir);

    expect(Object.keys(allSkills).toSorted()).toStrictEqual(
      [SKILLS.react.id, SKILLS.hono.id, SKILLS.zustand.id, SKILLS.vitest.id].toSorted(),
    );
    expect(counts).toStrictEqual({
      totalSkillCount: 4,
      pluginSkillCount: 2,
      globalPluginSkillCount: 1,
      globalLocalSkillCount: 1,
      unusableMetadata: [],
    });
    const said = (line: string) => expect(consoleSpies.log).toHaveBeenCalledWith(`    ${line}`);
    said("Found 1 skills from global plugins");
    said(`Found 1 global local skills from ${globalSkillsDir()}`);
    said("Found 1 skills from installed plugins");
    said(`Found 1 local skills from ${projectSkillsDir()}`);
  });

  it("says nothing about the global scope when it holds no skills", async () => {
    await pluginSkillsAt({ global: [], project: [] });

    await discoverInstalledSkills(projectDir);

    expect(consoleSpies.log).toHaveBeenCalledWith(
      `    Found 0 local skills from ${projectSkillsDir()}`,
    );
    expect(consoleSpies.log).not.toHaveBeenCalledWith(expect.stringContaining("global"));
  });

  it("reports the unusable metadata of both scopes, the global scope's first", async () => {
    await pluginSkillsAt({ global: [], project: [] });
    await writeUnusableSkill(globalSkillsDir(), "broken-global");
    await writeUnusableSkill(projectSkillsDir(), "broken-project");

    const { unusableMetadata } = await discoverInstalledSkills(projectDir);

    expect(unusableMetadata).toStrictEqual([
      expect.objectContaining({ skillDirName: "broken-global" }),
      expect.objectContaining({ skillDirName: "broken-project" }),
    ]);
  });
});
