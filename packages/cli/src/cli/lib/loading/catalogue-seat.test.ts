import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { withCatalogueSeatedFor } from "./catalogue-seat";
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

describe("withCatalogueSeatedFor", () => {
  const consoleSpies = silenceConsole(["log", "warn"]);
  let dirs: TestDirs;

  beforeEach(async () => {
    dirs = await createTestSource({
      skills: inTestMarketplace(DEFAULT_TEST_SKILLS),
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

  it("skips tagging skills with their sources, which a recompile never reads, as --verbose shows", async () => {
    setVerbose(true);

    await withCatalogueSeatedFor(dirs.projectDir, () => Promise.resolve());

    expect(consoleSpies.log).toHaveBeenCalledWith(
      "  Using default marketplace: github:agents-inc/skills",
    );
    expect(consoleSpies.log).not.toHaveBeenCalledWith(expect.stringContaining("Tagged"));
  });
});
