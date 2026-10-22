import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadSource, sayCapturedWarnings } from "./load-source.js";
import { SOURCE_ENV_VAR } from "../../configuration/config.js";
import { STANDARD_FILES } from "../../../consts.js";
import { disableBuffering, drainBuffer, enableBuffering, warn } from "../../../utils/logger.js";
import { renderUnparseableSkillMd } from "../../__tests__/content-generators.js";
import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import {
  cleanupTestSource,
  createTestSource,
  inTestMarketplace,
  type TestDirs,
} from "../../__tests__/fixtures/create-test-source.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { firstElement } from "../../__tests__/helpers/element-at.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { DEFAULT_TEST_SKILLS } from "../../__tests__/mock-data/mock-skills.js";
import { createTempDir, cleanupTempDir } from "../../__tests__/test-fs-utils.js";

/** The logger says each line once per process, so every spec loads a marketplace of its own. */
describe("loadSource", () => {
  let tempDir: string;
  const created: TestDirs[] = [];

  beforeEach(async () => {
    tempDir = await createTempDir("cc-load-source-");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await Promise.all(created.splice(0).map(cleanupTestSource));
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  async function marketplace(): Promise<TestDirs> {
    const dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
    created.push(dirs);
    return dirs;
  }

  /** One SKILL.md that cannot be parsed, so the load warns about exactly that file. */
  async function marketplaceThatWarns(): Promise<{ dirs: TestDirs; brokenSkillMd: string }> {
    const skills = inTestMarketplace(DEFAULT_TEST_SKILLS);
    const broken = firstElement(skills);
    const dirs = await createTestSource({
      skills: [{ ...broken, content: renderUnparseableSkillMd(broken.id) }, ...skills.slice(1)],
    });
    created.push(dirs);
    return {
      dirs,
      brokenSkillMd: path.join(dirs.skillsDir, broken.category, broken.id, STANDARD_FILES.SKILL_MD),
    };
  }

  const missingSource = (): string => path.join(tempDir, "no-marketplace-here");

  it("loads the catalogue of the marketplace it is pointed at", async () => {
    const dirs = await marketplace();

    const { sourceResult, startupMessages } = await loadSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
    });

    expect(sourceResult.sourceConfig).toStrictEqual(
      expect.objectContaining({ source: dirs.sourceDir, sourceOrigin: "flag" }),
    );
    expect([...sourceResult.marketplaceSkillIds].toSorted()).toStrictEqual(
      inTestMarketplace(DEFAULT_TEST_SKILLS)
        .map((skill) => skill.id)
        .toSorted(),
    );
    expect(startupMessages).toStrictEqual([]);
  });

  it("says a load's warnings as it goes when it is not capturing them", async () => {
    const { dirs, brokenSkillMd } = await marketplaceThatWarns();
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { startupMessages } = await loadSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
    });

    expect(said.mock.calls).toStrictEqual([[expect.stringContaining(brokenSkillMd)]]);
    expect(startupMessages).toStrictEqual([]);
  });

  it("holds a captured load's warnings back and hands them over instead", async () => {
    const { dirs, brokenSkillMd } = await marketplaceThatWarns();
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { startupMessages } = await loadSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
      captureStartupMessages: true,
    });

    expect(said).not.toHaveBeenCalled();
    expect(startupMessages).toStrictEqual([
      { level: "warn", text: expect.stringContaining(brokenSkillMd) },
    ]);
  });

  it("stops capturing when a captured load fails, so the next load's warnings are said", async () => {
    const { dirs, brokenSkillMd } = await marketplaceThatWarns();
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      loadSource({
        sourceFlag: missingSource(),
        projectDir: dirs.projectDir,
        captureStartupMessages: true,
      }),
    ).rejects.toThrow(missingSource());
    await loadSource({ sourceFlag: dirs.sourceDir, projectDir: dirs.projectDir });

    expect(said.mock.calls).toStrictEqual([[expect.stringContaining(brokenSkillMd)]]);
  });

  it("leaves a caller's own capture running when a load it was not capturing for fails", async () => {
    const dirs = await marketplace();
    const held = `held back by the caller's capture in ${tempDir}`;
    enableBuffering();
    try {
      await expect(
        loadSource({ sourceFlag: missingSource(), projectDir: dirs.projectDir }),
      ).rejects.toThrow(missingSource());
      warn(held);

      expect(drainBuffer()).toStrictEqual([{ level: "warn", text: held }]);
    } finally {
      disableBuffering();
    }
  });

  describe("the caller it loads for", () => {
    it("reads the marketplace environment variable for init, ahead of the stored marketplace", async () => {
      const fromEnv = await marketplace();
      const stored = await marketplace();
      await writeTestTsConfig(
        fromEnv.projectDir,
        buildProjectConfig({ marketplace: stored.sourceDir }),
      );
      vi.stubEnv(SOURCE_ENV_VAR, fromEnv.sourceDir);

      const { sourceResult } = await loadSource({ projectDir: fromEnv.projectDir, caller: "init" });

      expect(sourceResult.sourceConfig).toStrictEqual(
        expect.objectContaining({ source: fromEnv.sourceDir, sourceOrigin: "env" }),
      );
    });

    it("keeps to the stored marketplace for any other caller", async () => {
      const fromEnv = await marketplace();
      const stored = await marketplace();
      await writeTestTsConfig(
        fromEnv.projectDir,
        buildProjectConfig({ marketplace: stored.sourceDir }),
      );
      vi.stubEnv(SOURCE_ENV_VAR, fromEnv.sourceDir);

      const { sourceResult } = await loadSource({ projectDir: fromEnv.projectDir });

      expect(sourceResult.sourceConfig).toStrictEqual(
        expect.objectContaining({ source: stored.sourceDir, sourceOrigin: "project" }),
      );
    });
  });
});

describe("sayCapturedWarnings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says each captured warning, in order", () => {
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    sayCapturedWarnings([
      { level: "warn", text: "first captured warning, said by sayCapturedWarnings" },
      { level: "warn", text: "second captured warning, said by sayCapturedWarnings" },
    ]);

    expect(said.mock.calls).toStrictEqual([
      ["  Warning: first captured warning, said by sayCapturedWarnings"],
      ["  Warning: second captured warning, said by sayCapturedWarnings"],
    ]);
  });
});
