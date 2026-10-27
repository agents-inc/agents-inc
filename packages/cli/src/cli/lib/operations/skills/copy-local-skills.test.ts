import path from "path";
import { readdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyLocalSkills } from "./copy-local-skills.js";
import { resolveInstallPaths } from "../../installation/index.js";
import { skillsDir } from "../../installation/install-layout.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";
import { PROVIDERS, sourceDirName } from "../../../consts.js";
import type { SkillId } from "../../../types/index.js";
import {
  buildProjectConfig,
  initMatrixAndSource,
} from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { createMatrixFromTestSkills } from "../../__tests__/factories/matrix-factories.js";
import {
  cleanupTestSource,
  createTestSource,
  type TestDirs,
} from "../../__tests__/fixtures/create-test-source.js";
import { buildSkillConfig } from "../../__tests__/helpers/index.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { INSTALL_MODE_SKILLS } from "../../__tests__/mock-data/mock-skills.js";
import { directoryExists } from "../../__tests__/test-fs-utils.js";

const REACT: SkillId = "web-framework-react";
const ZUSTAND: SkillId = "web-state-zustand";
const HONO: SkillId = "api-framework-hono";
const VITEST: SkillId = "web-testing-vitest";

/** Copies from a source on disk into a project and a fake home. */
describe("copyLocalSkills", () => {
  let dirs: TestDirs;
  let sourceResult: SourceLoadResult;

  beforeEach(async () => {
    dirs = await createTestSource({ skills: INSTALL_MODE_SKILLS });
    sourceResult = initMatrixAndSource(
      createMatrixFromTestSkills(INSTALL_MODE_SKILLS),
      dirs.sourceDir,
    );
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  const home = useFakeHome(() => dirs.tempDir);

  const projectSkillsDir = (): string => resolveInstallPaths(dirs.projectDir, "project").skillsDir;
  const globalSkillsDir = (): string => resolveInstallPaths(home.dir, "global").skillsDir;

  const skillFoldersIn = async (dir: string): Promise<string[]> =>
    (await directoryExists(dir)) ? (await readdir(dir)).toSorted() : [];

  it("copies each skill into the skills folder of its own scope, and counts them", async () => {
    const result = await copyLocalSkills(
      [
        buildSkillConfig(REACT, { scope: "project" }),
        buildSkillConfig(HONO, { scope: "global" }),
        buildSkillConfig(VITEST, { scope: "project" }),
      ],
      dirs.projectDir,
      sourceResult,
    );

    expect(await skillFoldersIn(projectSkillsDir())).toStrictEqual([REACT, VITEST].toSorted());
    expect(await skillFoldersIn(globalSkillsDir())).toStrictEqual([HONO]);
    expect({
      project: result.projectCopied.map((skill) => skill.destPath),
      global: result.globalCopied.map((skill) => skill.destPath),
      total: result.totalCopied,
    }).toStrictEqual({
      project: [path.join(projectSkillsDir(), REACT), path.join(projectSkillsDir(), VITEST)],
      global: [path.join(globalSkillsDir(), HONO)],
      total: 3,
    });
  });

  it("copies nothing and makes no skills folder when no skill is selected", async () => {
    expect(await copyLocalSkills([], dirs.projectDir, sourceResult)).toStrictEqual({
      projectCopied: [],
      globalCopied: [],
      totalCopied: 0,
    });
    expect(await directoryExists(projectSkillsDir())).toBe(false);
    expect(await directoryExists(globalSkillsDir())).toBe(false);
  });

  it("makes no global skills folder when every skill is the project's", async () => {
    const result = await copyLocalSkills(
      [
        buildSkillConfig(REACT, { scope: "project" }),
        buildSkillConfig(ZUSTAND, { scope: "project" }),
      ],
      dirs.projectDir,
      sourceResult,
    );

    expect(result.totalCopied).toBe(2);
    expect(await skillFoldersIn(projectSkillsDir())).toStrictEqual([REACT, ZUSTAND].toSorted());
    expect(await directoryExists(globalSkillsDir())).toBe(false);
  });

  it("makes no project skills folder when every skill is global", async () => {
    const result = await copyLocalSkills(
      [buildSkillConfig(HONO, { scope: "global" }), buildSkillConfig(VITEST, { scope: "global" })],
      dirs.projectDir,
      sourceResult,
    );

    expect(result.totalCopied).toBe(2);
    expect(await skillFoldersIn(globalSkillsDir())).toStrictEqual([HONO, VITEST].toSorted());
    expect(await directoryExists(projectSkillsDir())).toBe(false);
  });

  /**
   * A project inherits only its own provider's global installation. Claude is the control, being
   * also the provider a home holding both is read as.
   */
  describe("in a project under a home holding a Claude and a Codex global installation", () => {
    beforeEach(() => {
      vi.stubEnv("CODEX_HOME", "");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each(PROVIDERS)(
      "copies a %s project's global skills into its own provider's global installation only",
      async (provider) => {
        for (const atHome of PROVIDERS) {
          await writeTestTsConfig(home.dir, buildProjectConfig(), sourceDirName(atHome));
        }
        await writeTestTsConfig(dirs.projectDir, buildProjectConfig(), sourceDirName(provider));

        const result = await copyLocalSkills(
          [buildSkillConfig(HONO, { scope: "global" })],
          dirs.projectDir,
          sourceResult,
        );

        const ownGlobalSkills = skillsDir(provider, "global", home.dir);
        expect(result.globalCopied.map((skill) => skill.destPath)).toStrictEqual([
          path.join(ownGlobalSkills, HONO),
        ]);
        expect(await skillFoldersIn(ownGlobalSkills)).toStrictEqual([HONO]);
        for (const other of PROVIDERS.filter((atHome) => atHome !== provider)) {
          expect(
            await directoryExists(skillsDir(other, "global", home.dir)),
            `nothing is copied into the ${other} global installation`,
          ).toBe(false);
        }
      },
    );
  });
});
