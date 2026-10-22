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
 * The agent moves to project scope too, since a global agent never carries a project-scoped
 * skill.
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

      // Without vitest, so picking it later is a genuine addition.
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

      await installFromSeed(
        store,
        "VitestInProject1",
        e2eStackPayload({
          projectSkills: [E2E_SKILL.vitest.id],
          projectAgents: [E2E_AGENT["web-developer"].name],
        }),
        { dir: projectDir, home: fakeHome },
      );

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

      // Skills compared, not bytes: registering the project in `projects` is the one global write.
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

      // A project taking its category's only skill regenerates the global unions without it.
      await expectFourSurfaces(projectDir, { globalHome: fakeHome });
      await expectFourSurfaces(fakeHome);
    },
  );
});
