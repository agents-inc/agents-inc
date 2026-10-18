import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { lazyGateDeps } from "../index.js";
import { resolveGateDeps } from "../deps.js";
import {
  cleanupTestSource,
  createTestSource,
  inTestMarketplace,
  type TestDirs,
  type TestSkill,
} from "../../__tests__/fixtures/create-test-source.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { silenceConsole } from "../../__tests__/helpers/silence-console.js";
import { COMPILE_LOCAL_SKILL, DEFAULT_TEST_SKILLS } from "../../__tests__/mock-data/mock-skills.js";
import { setVerbose } from "../../../utils/logger.js";

/** A skill the user wrote, in a category no marketplace declares. */
const LOCAL_SKILL: TestSkill = { ...COMPILE_LOCAL_SKILL, category: "web-house-conventions" };

describe("lazyGateDeps", () => {
  const consoleSpies = silenceConsole(["log", "warn"]);
  let dirs: TestDirs;

  beforeEach(async () => {
    dirs = await createTestSource({
      skills: inTestMarketplace(DEFAULT_TEST_SKILLS),
      localSkills: [LOCAL_SKILL],
    });
  });

  afterEach(async () => {
    setVerbose(false);
    await cleanupTestSource(dirs);
  });

  useFakeHome(() => dirs.tempDir);

  it("loads the catalogue as the project it was made for sees it, its local skills included", async () => {
    // T2 reads the matrix alone, through the loader lazyGateDeps hands out.
    const loaded = await resolveGateDeps(lazyGateDeps(dirs.projectDir), "T2");

    if (loaded === null) throw new Error("a T2 write reads the matrix, so its deps must load");
    expect(Object.keys(loaded.matrix.skills)).toContain(LOCAL_SKILL.id);
  });

  it("skips tagging skills with their sources, which classification never reads, as --verbose shows", async () => {
    setVerbose(true);

    await resolveGateDeps(lazyGateDeps(dirs.projectDir), "T2");

    expect(consoleSpies.log).toHaveBeenCalledWith(
      "  Using default marketplace: github:agents-inc/skills",
    );
    expect(consoleSpies.log).not.toHaveBeenCalledWith(expect.stringContaining("Tagged"));
  });
});
