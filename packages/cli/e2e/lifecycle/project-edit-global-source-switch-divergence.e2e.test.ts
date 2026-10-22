import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { TIMEOUTS } from "../pages/constants.js";
import { createTestEnvironment, readAllSkillEntries } from "../fixtures/dual-scope-helpers.js";
import {
  DUAL_SCOPE,
  applyFromSeed,
  e2eStackPayload,
  installFromSeed,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  isClaudeCLIAvailable,
  skillsPath,
} from "../helpers/test-utils.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";

const REACT_ID = E2E_SKILL.react.id;
const HONO_ID = E2E_SKILL.hono.id;

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("project-context source switch on global-scoped skills", () => {
  let pluginSource: E2EPluginSource;
  let store: SeedConfigStore;
  let currentTempDir: string | undefined;

  beforeAll(async () => {
    pluginSource = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(pluginSource);
  });

  afterEach(async () => {
    if (currentTempDir) {
      await cleanupTempDir(currentTempDir);
      currentTempDir = undefined;
    }
  });

  it(
    "records the switch it performed on disk, so config and filesystem agree at global scope",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const marketplace = pluginSource.marketplaceName;
      const reactPluginRef = pluginKeyFor(REACT_ID, marketplace);

      const env = await createTestEnvironment();
      currentTempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      await installFromSeed(
        store,
        "Plugins1",
        e2eStackPayload({ install: "plugin" }),
        { dir: fakeHome, home: fakeHome },
        pluginSource.sourceDir,
      );

      // hono moves G->P; sources stay plugin, so no switch has happened yet.
      const project = { dir: projectDir, home: fakeHome };
      await installFromSeed(
        store,
        "Plugins2",
        e2eStackPayload({ ...DUAL_SCOPE, install: "plugin" }),
        project,
        pluginSource.sourceDir,
      );

      const reactBefore = (await readAllSkillEntries(fakeHome)).find(
        (s) => s.id === REACT_ID && s.scope === "global" && s.excluded !== true,
      );
      expect(reactBefore, "global config must carry an active global react entry").toBeDefined();
      if (!reactBefore) return;
      // Distinct from the marketplace.json name used to build plugin refs.
      const pluginSourceLabel = reactBefore.origin;
      expect(pluginSourceLabel, "react must start plugin-sourced").not.toBe("eject");
      expect(
        await directoryExists(path.join(skillsPath(fakeHome), REACT_ID)),
        "plugin-sourced react must have no ejected copy under $HOME before the switch",
      ).toBe(false);
      await expect({ dir: fakeHome }).toHavePluginInRegistry(reactPluginRef, "user");

      await applyFromSeed(store, "Ejected1", e2eStackPayload(DUAL_SCOPE), project);

      // Proof the source-switch path fired, on the skill the project owns.
      const projectSkills = await readAllSkillEntries(projectDir);
      const honoAfter = projectSkills.find((s) => s.id === HONO_ID && s.scope === "project");
      expect(honoAfter?.origin, "project-owned hono must record the eject switch").toBe("eject");
      expect(
        await directoryExists(path.join(skillsPath(projectDir), HONO_ID)),
        "project-owned hono must have an ejected copy in the project tree",
      ).toBe(true);

      const reactAfter = (await readAllSkillEntries(fakeHome)).find(
        (s) => s.id === REACT_ID && s.scope === "global" && s.excluded !== true,
      );
      expect(
        reactAfter,
        "global config must still carry an active global react entry",
      ).toBeDefined();
      if (!reactAfter) return;

      const reactEjectedInHome = await directoryExists(path.join(skillsPath(fakeHome), REACT_ID));
      expect(
        reactEjectedInHome ? "eject" : pluginSourceLabel,
        "global-scoped react: the install mode on disk under $HOME must match the source recorded in the global config.ts",
      ).toBe(reactAfter.origin);

      if (reactAfter.origin === "eject") {
        await expect({ dir: fakeHome }).not.toHavePluginInRegistry(reactPluginRef, "user");
      } else {
        await expect({ dir: fakeHome }).toHavePluginInRegistry(reactPluginRef, "user");
      }

      const reactInProjectView = projectSkills.find(
        (s) => s.id === REACT_ID && s.scope === "global" && s.excluded !== true,
      );
      expect(
        reactInProjectView,
        "project config.ts must report the same global react entry as the global config.ts",
      ).toStrictEqual(reactAfter);
      expect(
        await directoryExists(path.join(skillsPath(projectDir), REACT_ID)),
        "global-scoped react must never be ejected into the project tree",
      ).toBe(false);
    },
  );
});
