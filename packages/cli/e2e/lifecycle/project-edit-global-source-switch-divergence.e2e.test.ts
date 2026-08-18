import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  createTestEnvironment,
  initGlobal,
  initProject,
  readAllSkillEntries,
} from "../fixtures/dual-scope-helpers.js";
import {
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  skillsPath,
} from "../helpers/test-utils.js";
import { EJECT_SOURCE } from "../../src/cli/consts.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";

/**
 * A source switch driven from a PROJECT context, applied to skills that live at
 * GLOBAL scope.
 *
 * `cc edit` resolves migration paths per-skill from each skill's own scope, so a
 * plugin -> eject switch on a global-scoped skill copies the skill under $HOME and
 * uninstalls its user-scope plugin registration. The config write, however, runs
 * with project authority ("owned"), under which an inherited global-active entry is
 * out of scope and preserved verbatim. Whatever the product decides — refuse the
 * switch for global-scoped skills (matching the existing project-scope guard) or
 * record it — the recorded source and the on-disk install mode must not diverge.
 *
 * The product has since decided: it REFUSES. The Sources step's bulk set-all keys are
 * withdrawn, `setAllLocal` walks the rows one at a time, and an inherited global install
 * renders as a locked row that the walk skips and `setInstallMode` would refuse anyway. So
 * react is expected to come out of Phase C exactly as it went in, and the divergence assertion
 * below has become a CONTAINMENT invariant: it can only break if something reaches the global
 * entry from here again. What keeps it from being vacuous is hono — the project-owned half the
 * walk genuinely does switch, asserted first, which proves the source-switch path fired at all.
 */

const REACT_ID = E2E_SKILL.react.id;
const HONO_ID = E2E_SKILL.hono.id;

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("project-context source switch on global-scoped skills", () => {
  let pluginSource: E2EPluginSource;
  let wizard: EditWizard | undefined;
  let currentTempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    pluginSource = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupFixture(pluginSource);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
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
      const phaseA = await initGlobal(pluginSource.sourceDir, pluginSource.tempDir, fakeHome);
      expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      // Phase B: establish a real project installation. hono moves G->P; sources stay
      // plugin, so no source switch has happened yet.
      const phaseB = await initProject(
        pluginSource.sourceDir,
        pluginSource.tempDir,
        fakeHome,
        projectDir,
        { setLocal: false },
      );
      expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

      // Pre-state: react is global, plugin-sourced, registered at user scope, and
      // has no ejected copy under $HOME.
      const reactBefore = (await readAllSkillEntries(fakeHome)).find(
        (s) => s.id === REACT_ID && s.scope === "global" && s.excluded !== true,
      );
      expect(reactBefore, "global config must carry an active global react entry").toBeDefined();
      if (!reactBefore) return;
      // The label the wizard records for the marketplace source (distinct from the
      // marketplace.json name used to build plugin refs).
      const pluginSourceLabel = reactBefore.origin;
      expect(pluginSourceLabel, "react must start plugin-sourced").not.toBe(EJECT_SOURCE);
      expect(
        await directoryExists(path.join(skillsPath(fakeHome), REACT_ID)),
        "plugin-sourced react must have no ejected copy under $HOME before the switch",
      ).toBe(false);
      await expect({ dir: fakeHome }).toHavePluginInRegistry(reactPluginRef, "user");

      // Phase C: from the PROJECT directory, switch every EDITABLE source to local.
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir: pluginSource.sourceDir, tempDir: pluginSource.tempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const sources = await wizard.build.passThroughAllDomains();
      await sources.waitForReady();
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

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
