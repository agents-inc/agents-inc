import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installThroughOperations } from "./install-through-operations.js";
import { buildWizardResult, initMatrixAndSource } from "../factories/config-factories.js";
import { buildSkillConfigs } from "./wizard-simulation.js";
import { readTestTsConfig } from "./config-io.js";
import { useFakeHome } from "./isolated-home.js";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { createMatrixFromTestSkills } from "../factories/matrix-factories.js";
import { INSTALL_MODE_SKILLS } from "../mock-data/mock-skills.js";
import { fileExists } from "../test-fs-utils";
import { LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../../consts";
import type { ProjectConfig, SkillId } from "../../../types";

// Boundary cast: TestSkill.id is string, but INSTALL_MODE_SKILLS carries valid SkillIds
const SKILL_IDS = INSTALL_MODE_SKILLS.map((skill) => skill.id) as SkillId[];
const AGENT = "web-developer";

describe("installThroughOperations", () => {
  let dirs: TestDirs;

  // Registered before `useFakeHome`, whose own `beforeEach` reads `dirs.tempDir`.
  beforeEach(async () => {
    dirs = await createTestSource({ skills: INSTALL_MODE_SKILLS });
  });

  useFakeHome(() => dirs.tempDir);

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  it("runs all three install operations and answers with each one's own result", async () => {
    const skills = buildSkillConfigs(SKILL_IDS, { origin: "eject" });
    const sourceResult = initMatrixAndSource(
      createMatrixFromTestSkills(INSTALL_MODE_SKILLS),
      dirs.sourceDir,
    );

    const { copied, config, compilation } = await installThroughOperations({
      wizardResult: buildWizardResult(skills, { selectedAgents: [AGENT] }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // The copy step: every selected skill on disk under the project's skills directory.
    expect(copied.projectCopied.map((skill) => skill.skillId).sort()).toStrictEqual(
      [...SKILL_IDS].sort(),
    );
    for (const id of SKILL_IDS) {
      const skillPath = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, id, STANDARD_FILES.SKILL_MD);
      expect(await fileExists(skillPath)).toBe(true);
    }

    // The config step: a config.ts naming exactly those skills.
    const written = await readTestTsConfig<ProjectConfig>(config.configPath);
    expect(written.skills.map((skill) => skill.id).sort()).toStrictEqual([...SKILL_IDS].sort());

    // The compile step: the selected sub-agent compiled, with nothing failed.
    expect(compilation.compiled).toStrictEqual([AGENT]);
    expect(compilation.failed).toStrictEqual([]);
  });
});
