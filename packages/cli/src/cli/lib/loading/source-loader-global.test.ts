import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";

vi.mock("./source-fetcher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./source-fetcher")>();
  return {
    ...actual,
    fetchFromSource: vi.fn(actual.fetchFromSource),
    fetchMarketplace: vi.fn(actual.fetchMarketplace),
  };
});

import { loadSkillsMatrixFromSource } from "./source-loader";
import { fetchFromSource, fetchMarketplace } from "./source-fetcher";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  TEST_MARKETPLACE_NAME,
  type TestDirs,
  type TestSkill,
} from "../__tests__/fixtures/create-test-source";
import { createTestSkill } from "../__tests__/factories/skill-factories.js";
import { buildProjectConfig, buildSourceConfig } from "../__tests__/factories/config-factories.js";
import { renderUnparseableConfigTs } from "../__tests__/factories/unloadable-config-factories.js";
import { writeRawTestConfig, writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";
import { silenceConsole } from "../__tests__/helpers/silence-console.js";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { DEFAULT_TEST_SKILLS } from "../__tests__/mock-data/mock-skills";
import { setVerbose } from "../../utils/logger";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../consts";
import { DEFAULT_SOURCE, SOURCE_ENV_VAR } from "../configuration/config";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import type { MergedSkillsMatrix, ResolvedSkill, SkillId } from "../../types";

const actualFetcher = await vi.importActual<typeof import("./source-fetcher")>("./source-fetcher");

/** The marketplace this machine's project loads: the fixture skills in their own namespace. */
const PROJECT_SKILLS = inTestMarketplace(DEFAULT_TEST_SKILLS);

/** One skill both marketplaces carry, so which one a load keeps is visible. */
const SHARED_SKILL = firstElement(PROJECT_SKILLS);
const SHARED_SKILL_AS_GLOBALLY_PUBLISHED: TestSkill = {
  ...SHARED_SKILL,
  description: "As the global installation's marketplace publishes it",
};

/** A skill only the global installation's marketplace carries, in a category only it declares. */
const GLOBAL_ONLY_SKILL: TestSkill = {
  ...firstElement(inTestMarketplace([createTestSkill("web-state-pinia", "Global-only store")])),
  category: "web-global-conventions",
};

const GLOBAL_MARKETPLACE_NAME = "global-marketplace";

/** A catalogue skill the project's marketplace does not ship and whose slug none of it claims. */
const CATALOGUE_ONLY_SKILL_ID: SkillId = "web-state-pinia";

const MISSING_GLOBAL_MARKETPLACE = "/no/such/global/marketplace";

const REMOTE_SOURCE = "github:acme/skills";

/** Widens once here: namespaced ids are strings outside the `SkillId` union. */
function loadedSkill(matrix: MergedSkillsMatrix, id: string): ResolvedSkill | undefined {
  // Boundary cast: skills keys are branded SkillId, widened to string for test indexing
  return (matrix.skills as Record<string, ResolvedSkill>)[id];
}

describe("source-loader: what the global installation adds to a project's load", () => {
  const consoleSpies = silenceConsole(["log", "warn"]);
  let fakeHome: string;
  let savedHome: string | undefined;
  let projectSource: TestDirs;
  let globalSource: TestDirs | undefined;

  beforeEach(async () => {
    fakeHome = await createTempDir("cc-loader-global-home-");
    savedHome = process.env.HOME;
    process.env.HOME = fakeHome;
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
    delete process.env[SOURCE_ENV_VAR];
    projectSource = await createTestSource({ skills: PROJECT_SKILLS });
    setVerbose(true);
  });

  afterEach(async () => {
    setVerbose(false);
    vi.mocked(os.homedir).mockRestore();
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    await cleanupTestSource(projectSource);
    await cleanupTestSource(globalSource);
    globalSource = undefined;
    await cleanupTempDir(fakeHome);
  });

  async function installGlobally(
    skillIds: string[],
    { marketplace, origin }: { marketplace?: string; origin: string },
  ): Promise<void> {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        skills: buildSkillConfigs(skillIds, { scope: "global", origin }),
        ...(marketplace !== undefined && {
          marketplace,
          marketplaceName: GLOBAL_MARKETPLACE_NAME,
        }),
      }),
    );
  }

  function loadProject(): ReturnType<typeof loadSkillsMatrixFromSource> {
    return loadSkillsMatrixFromSource({
      sourceFlag: projectSource.sourceDir,
      projectDir: projectSource.projectDir,
      skipExtraSources: true,
    });
  }

  it("seats a public-catalogue plugin out of the built-in matrix, without fetching the catalogue", async () => {
    await installGlobally([CATALOGUE_ONLY_SKILL_ID], { origin: DEFAULT_PUBLIC_SOURCE_NAME });

    const { matrix } = await loadProject();

    expect(loadedSkill(matrix, CATALOGUE_ONLY_SKILL_ID)).toMatchObject({
      id: CATALOGUE_ONLY_SKILL_ID,
      description: BUILT_IN_MATRIX.skills[CATALOGUE_ONLY_SKILL_ID]?.description,
      availableSources: [
        { name: DEFAULT_PUBLIC_SOURCE_NAME, type: "public", installed: false, primary: true },
      ],
    });
    expect(matrix.slugMap.slugToId["pinia"]).toBe(CATALOGUE_ONLY_SKILL_ID);
    expect(fetchFromSource).not.toHaveBeenCalledWith(DEFAULT_SOURCE);
  });

  it("brings a seated skill's category along when the project's marketplace declares none", async () => {
    globalSource = await createTestSource({ skills: [GLOBAL_ONLY_SKILL] });
    await installGlobally([GLOBAL_ONLY_SKILL.id], {
      marketplace: globalSource.sourceDir,
      origin: GLOBAL_MARKETPLACE_NAME,
    });

    const { matrix } = await loadProject();

    expect(loadedSkill(matrix, GLOBAL_ONLY_SKILL.id)?.category).toBe(GLOBAL_ONLY_SKILL.category);
    expect(Object.keys(matrix.categories)).toContain(GLOBAL_ONLY_SKILL.category);
  });

  it("keeps the project's marketplace's copy of a skill both marketplaces carry", async () => {
    globalSource = await createTestSource({ skills: [SHARED_SKILL_AS_GLOBALLY_PUBLISHED] });
    await installGlobally([SHARED_SKILL.id], {
      marketplace: globalSource.sourceDir,
      origin: GLOBAL_MARKETPLACE_NAME,
    });

    const { matrix } = await loadProject();

    expect(loadedSkill(matrix, SHARED_SKILL.id)?.description).toBe(SHARED_SKILL.description);
  });

  it("reads its own marketplace once when that is the global installation's marketplace too", async () => {
    await installGlobally([GLOBAL_ONLY_SKILL.id], {
      marketplace: projectSource.sourceDir,
      origin: GLOBAL_MARKETPLACE_NAME,
    });

    await loadProject();

    expect(fetchFromSource).toHaveBeenCalledExactlyOnceWith(projectSource.sourceDir);
  });

  it("goes on without the global skills when the global config cannot be read, and says why", async () => {
    await writeTestTsConfig(
      projectSource.projectDir,
      buildSourceConfig({ marketplace: projectSource.sourceDir }),
    );
    await writeRawTestConfig(fakeHome, renderUnparseableConfigTs());

    const { matrix } = await loadProject();

    expect(Object.keys(matrix.skills)).toContain(SHARED_SKILL.id);
    expect(consoleSpies.log).toHaveBeenCalledWith(
      expect.stringContaining("  Global installation's skills not seated — "),
    );
  });

  it("goes on without the global skills when their marketplace cannot be loaded, and says why", async () => {
    await installGlobally([GLOBAL_ONLY_SKILL.id], {
      marketplace: MISSING_GLOBAL_MARKETPLACE,
      origin: GLOBAL_MARKETPLACE_NAME,
    });

    const { matrix } = await loadProject();

    expect(loadedSkill(matrix, GLOBAL_ONLY_SKILL.id)).toBeUndefined();
    expect(consoleSpies.log).toHaveBeenCalledWith(
      expect.stringContaining(
        `  Global installation's marketplace not loaded — Local marketplace not found: '${MISSING_GLOBAL_MARKETPLACE}'`,
      ),
    );
  });

  it("does not load the global installation's marketplace when it holds nothing to seat", async () => {
    await installGlobally([], {
      marketplace: MISSING_GLOBAL_MARKETPLACE,
      origin: GLOBAL_MARKETPLACE_NAME,
    });

    await loadProject();

    expect(consoleSpies.log).not.toHaveBeenCalledWith(
      expect.stringContaining("Global installation's marketplace not loaded"),
    );
  });
});

describe("source-loader: a marketplace fetched from a remote ref", () => {
  const consoleSpies = silenceConsole(["log", "warn"]);
  let fakeHome: string;
  let savedHome: string | undefined;
  let fetched: TestDirs;

  beforeEach(async () => {
    fakeHome = await createTempDir("cc-loader-remote-home-");
    savedHome = process.env.HOME;
    process.env.HOME = fakeHome;
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
    delete process.env[SOURCE_ENV_VAR];
    fetched = await createTestSource({ skills: PROJECT_SKILLS });
    vi.mocked(fetchFromSource).mockImplementation(async (source) =>
      source === REMOTE_SOURCE
        ? { path: fetched.sourceDir, fromCache: false, source }
        : actualFetcher.fetchFromSource(source),
    );
    vi.mocked(fetchMarketplace).mockImplementation(async (source) =>
      actualFetcher.fetchMarketplace(source === REMOTE_SOURCE ? fetched.sourceDir : source),
    );
    setVerbose(true);
  });

  afterEach(async () => {
    setVerbose(false);
    vi.mocked(fetchFromSource).mockImplementation(actualFetcher.fetchFromSource);
    vi.mocked(fetchMarketplace).mockImplementation(actualFetcher.fetchMarketplace);
    vi.mocked(os.homedir).mockRestore();
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    await cleanupTestSource(fetched);
    await cleanupTempDir(fakeHome);
  });

  it("reads the fetched copy as a remote marketplace, naming the ref and where it landed", async () => {
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: REMOTE_SOURCE,
      projectDir: fetched.projectDir,
      skipExtraSources: true,
    });

    expect(result.isLocal).toBe(false);
    expect(result.sourcePath).toBe(fetched.sourceDir);
    expect(result.marketplace).toBe(TEST_MARKETPLACE_NAME);
    expect(Object.keys(result.matrix.skills)).toContain(SHARED_SKILL.id);
    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  Fetching skills from remote source: ${REMOTE_SOURCE}`,
    );
    expect(consoleSpies.log).toHaveBeenCalledWith(`  Fetched to: ${fetched.sourceDir}`);
  });
});
