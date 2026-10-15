import { realpathSync } from "fs";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import { TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  configTsPath,
  directoryExists,
  readCompiledAgents,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  readAllSkillEntries,
  readSkillEntries,
} from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";

/**
 * A skill the global install does not carry, set up in a project over that install at project
 * scope: a REAL project install, so all three of its sides are asserted (the copied skill
 * directory, the project config entry, the compiled project agent carrying it) against a global
 * scope that must be byte-identical afterwards. The agent is moved to project scope in the same
 * run for that last one: a global agent can never carry a project-scoped skill, so without it
 * the project side has nowhere to be observed in compiled output.
 */

describe("a fresh pick set up at project scope over a global install", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "installs it project-side and leaves the global scope untouched",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase A — global install WITHOUT vitest, so picking it later is a
      // genuine addition rather than a re-selection of an inherited install.
      await installFromSeed(
        store,
        "WithoutVitest1",
        e2eStackPayload({ without: [E2E_SKILL.vitest.id] }),
        { dir: fakeHome, home: fakeHome },
      );
      expect(
        (await readAllSkillEntries(fakeHome)).map((entry) => entry.id),
        "the deselected skill must not be installed globally — the whole premise of a fresh pick",
      ).not.toContain(E2E_SKILL.vitest.id);

      const globalSkillsBefore = await readAllSkillEntries(fakeHome);
      const globalAgentsBefore = await readCompiledAgents(fakeHome);
      expect(
        Object.keys(globalAgentsBefore).length,
        "the global scope must hold compiled agents before the edit, or its unchanged-ness is vacuous",
      ).toBeGreaterThan(0);

      // Phase B — set the project up over that global install, with the skill the
      // global install lacks, and web-developer, in the project.
      await installFromSeed(
        store,
        "VitestInProject1",
        e2eStackPayload({
          projectSkills: [E2E_SKILL.vitest.id],
          projectAgents: [E2E_AGENT["web-developer"].name],
        }),
        { dir: projectDir, home: fakeHome },
      );

      // The project side is real: config entry, copied files, compiled agent.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.vitest.id),
        "the pick must be recorded at project scope only",
      ).toStrictEqual([{ id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" }]);
      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.vitest.id)),
        "the pick's files must land under the project's skills dir",
      ).toBe(true);
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        { contains: [E2E_SKILL.vitest.id] },
      );

      // The global side is untouched: no entry, no files, no rewritten agents.
      // The global config's SKILLS are compared rather than its bytes — setting a
      // project up registers its path in the global `projects` list, which is the
      // one global write this flow owes and is asserted below.
      expect(
        await readAllSkillEntries(fakeHome),
        "a project-scoped pick must not reach the global config's skills",
      ).toStrictEqual(globalSkillsBefore);
      expect(
        await directoryExists(path.join(skillsPath(fakeHome), E2E_SKILL.vitest.id)),
        "a project-scoped pick must not copy files into the global skills dir",
      ).toBe(false);
      expect(
        await readCompiledAgents(fakeHome),
        "a project-scoped pick must not rewrite the global agents",
      ).toStrictEqual(globalAgentsBefore);
      expect(
        await readTestFile(configTsPath(fakeHome)),
        "setting a project up must register it globally — the one global write this flow owes",
      ).toContain(realpathSync(projectDir));

      // Both scopes at four-surface strength. The run moved a skill and an agent across
      // the boundary, so the generated pair on EACH side has to still narrow — a project that
      // took the only skill of its category leaves the global unions to be regenerated without
      // it, and that regeneration is where a union collapses unnoticed.
      await expectFourSurfaces(projectDir, { globalHome: fakeHome });
      await expectFourSurfaces(fakeHome);
    },
  );
});
