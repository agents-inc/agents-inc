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
import { EJECT_SOURCE } from "../../src/cli/consts.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";

/**
 * A source switch driven from a PROJECT context, applied to skills that live at
 * GLOBAL scope: the recorded source and the on-disk install mode must not diverge. What keeps
 * the check from being vacuous is hono — the project-owned half the run genuinely does switch,
 * asserted first, which proves the source-switch path fired at all.
 */

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
      const reactPluginRef = buildMarketplacePluginRef(REACT_ID, marketplace);

      const env = await createTestEnvironment();
      currentTempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase A: init at HOME against the plugin marketplace — every skill is
      // global-scoped and plugin-sourced.
      await installFromSeed(
        store,
        "Plugins1",
        e2eStackPayload({ install: "plugin" }),
        { dir: fakeHome, home: fakeHome },
        pluginSource.sourceDir,
      );

      // Phase B: establish a real project installation. hono moves G->P; sources stay
      // plugin, so no source switch has happened yet.
      const project = { dir: projectDir, home: fakeHome };
      await installFromSeed(
        store,
        "Plugins2",
        e2eStackPayload({ ...DUAL_SCOPE, install: "plugin" }),
        project,
        pluginSource.sourceDir,
      );

      // Pre-state: react is global, plugin-sourced, registered at user scope, and
      // has no ejected copy under $HOME.
      const reactBefore = (await readAllSkillEntries(fakeHome)).find(
        (s) => s.id === REACT_ID && s.scope === "global" && s.excluded !== true,
      );
      expect(reactBefore, "global config must carry an active global react entry").toBeDefined();
      if (!reactBefore) return;
      // The label recorded for the marketplace source (distinct from the
      // marketplace.json name used to build plugin refs).
      const pluginSourceLabel = reactBefore.origin;
      expect(pluginSourceLabel, "react must start plugin-sourced").not.toBe(EJECT_SOURCE);
      expect(
        await directoryExists(path.join(skillsPath(fakeHome), REACT_ID)),
        "plugin-sourced react must have no ejected copy under $HOME before the switch",
      ).toBe(false);
      await expect({ dir: fakeHome }).toHavePluginInRegistry(reactPluginRef, "user");

      // Phase C: from the PROJECT directory, every source local.
      await applyFromSeed(store, "Ejected1", e2eStackPayload(DUAL_SCOPE), project);

      // Proof the source-switch path fired: the PROJECT-scoped skill, which the
      // project genuinely owns, records eject and has its copied directory.
      const projectSkills = await readAllSkillEntries(projectDir);
      const honoAfter = projectSkills.find((s) => s.id === HONO_ID && s.scope === "project");
      expect(honoAfter?.origin, "project-owned hono must record the eject switch").toBe(
        EJECT_SOURCE,
      );
      expect(
        await directoryExists(path.join(skillsPath(projectDir), HONO_ID)),
        "project-owned hono must have an ejected copy in the project tree",
      ).toBe(true);

      // The defect: the global-scoped skill. Config and disk must agree.
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
        reactEjectedInHome ? EJECT_SOURCE : pluginSourceLabel,
        "global-scoped react: the install mode on disk under $HOME must match the source recorded in the global config.ts",
      ).toBe(reactAfter.origin);

      // The plugin registry must agree with the same recorded source.
      if (reactAfter.origin === EJECT_SOURCE) {
        await expect({ dir: fakeHome }).not.toHavePluginInRegistry(reactPluginRef, "user");
      } else {
        await expect({ dir: fakeHome }).toHavePluginInRegistry(reactPluginRef, "user");
      }

      // Both configs must tell the same story about the global entry, and a
      // global-scoped skill must never be ejected into the project tree.
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
