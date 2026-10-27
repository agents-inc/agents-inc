import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFile } from "fs/promises";

import { withCatalogueSeatedFor } from "./catalogue-seat";
import { MarketplaceNameRefusedError } from "./source-fetcher";
import { EJECT_SOURCE, marketplaceManifestPath } from "../../consts";
import { buildProjectConfig } from "../__tests__/factories/config-factories";
import {
  createMockMarketplace,
  createMockMarketplacePlugin,
} from "../__tests__/factories/plugin-factories";
import { writeTestTsConfig } from "../__tests__/helpers/config-io";
import {
  cleanupTestSource,
  createTestSource,
  inTestMarketplace,
  type TestDirs,
  type TestSkill,
} from "../__tests__/fixtures/create-test-source";
import { createMockMatrix } from "../__tests__/factories/matrix-factories";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { silenceConsole } from "../__tests__/helpers/silence-console";
import { COMPILE_LOCAL_SKILL, DEFAULT_TEST_SKILLS } from "../__tests__/mock-data/mock-skills";
import { SKILLS } from "../__tests__/test-fixtures";
import { initializeMatrix, matrix } from "../matrix/matrix-provider";
import { setVerbose } from "../../utils/logger";

/** A skill the user wrote, in a category no marketplace declares. */
const LOCAL_SKILL: TestSkill = { ...COMPILE_LOCAL_SKILL, category: "web-house-conventions" };

const CALLERS_CATALOGUE = createMockMatrix(SKILLS.vue);

/** In its own namespace: a custom marketplace shipping a catalogue id is refused whole. */
const MARKETPLACE_SKILLS = inTestMarketplace(DEFAULT_TEST_SKILLS);

describe("withCatalogueSeatedFor", () => {
  const consoleSpies = silenceConsole(["log", "warn"]);
  let dirs: TestDirs;

  beforeEach(async () => {
    dirs = await createTestSource({
      skills: MARKETPLACE_SKILLS,
      localSkills: [LOCAL_SKILL],
    });
    initializeMatrix(CALLERS_CATALOGUE);
  });

  afterEach(async () => {
    setVerbose(false);
    await cleanupTestSource(dirs);
  });

  useFakeHome(() => dirs.tempDir);

  it("hands the body the project's own catalogue, its local skills included", async () => {
    const seatedIds = await withCatalogueSeatedFor(dirs.projectDir, (seated) =>
      Promise.resolve(Object.keys(seated.skills)),
    );

    expect(seatedIds).toContain(LOCAL_SKILL.id);
  });

  it("puts the caller's catalogue back once the body is done", async () => {
    await withCatalogueSeatedFor(dirs.projectDir, () => Promise.resolve());

    expect(matrix).toBe(CALLERS_CATALOGUE);
  });

  /** Refused by the manifest's name, which is read after the folder; the spec above is the twin. */
  it("a load refused after reading the folder leaves the caller's catalogue seated", async () => {
    await writeTestTsConfig(dirs.projectDir, buildProjectConfig({ marketplace: dirs.sourceDir }));
    await writeFile(
      marketplaceManifestPath(dirs.sourceDir),
      JSON.stringify({
        ...createMockMarketplace(
          MARKETPLACE_SKILLS.map((skill) => createMockMarketplacePlugin(skill.id)),
        ),
        name: EJECT_SOURCE,
      }),
    );

    await expect(
      withCatalogueSeatedFor(dirs.projectDir, () => Promise.resolve()),
    ).rejects.toBeInstanceOf(MarketplaceNameRefusedError);

    expect(matrix).toBe(CALLERS_CATALOGUE);
  });

  it("skips tagging skills with their sources, which a recompile never reads, as --verbose shows", async () => {
    setVerbose(true);

    await withCatalogueSeatedFor(dirs.projectDir, () => Promise.resolve());

    expect(consoleSpies.log).toHaveBeenCalledWith(
      "  Using default marketplace: github:agents-inc/skills",
    );
    expect(consoleSpies.log).not.toHaveBeenCalledWith(expect.stringContaining("Tagged"));
  });
});
