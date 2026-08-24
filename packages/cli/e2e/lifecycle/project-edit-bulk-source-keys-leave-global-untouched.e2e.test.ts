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
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { createTestEnvironment, initGlobal, initProject } from "../fixtures/dual-scope-helpers.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  injectMarketplaceIntoConfig,
  isClaudeCLIAvailable,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";

/**
 * A project edit's bulk install-mode keys must not reach the global install.
 *
 * On the Sources step of a PROJECT edit, an inherited global skill renders as a locked row:
 * dimmed, lock-marked, and skipped by focus (`isRowInert`), so the per-row toggle provably
 * cannot commit a mode for it. The bulk keys `l` / `p` ignored that — they rewrote `source`
 * on every non-excluded entry, global-active rows included — and the run then acted on it for
 * real: a `claude plugin install` at Claude user scope, the global working copy deleted or
 * created under $HOME, and the GLOBAL `config.ts` rewritten by `recordGlobalSourceMigrations`.
 * The resolution is that both keys are withdrawn outright.
 *
 * The two tests are the two directions, each against the baseline the key can actually move:
 *
 *   `p` — globals installed EJECT. Pressing it migrated them to plugin: real installs, and
 *          the ejected working copies under $HOME deleted the moment each plugin registered.
 *   `l` — globals installed PLUGIN. Pressing it migrated them to eject: copies written into
 *          $HOME's skills directory and the user-scope plugin registrations removed.
 *
 * Each asserts the same three surfaces, and all three go red against the unfixed binary:
 * the global `config.ts` is byte-identical across the run, the global scope's on-disk install
 * is exactly as it was, and the Claude plugin registry at user scope is unchanged.
 *
 * The keys are pressed through `pressSetAllPluginHotkey` / `pressSetAllLocalHotkey` rather
 * than `setAllPlugin` / `setAllLocal`: the latter are the suite's DRIVERS for reaching a given
 * install mode and will be re-pointed at a per-row sequence, at which point a spec calling
 * them would no longer be pressing the key it is named for. See `SourcesStep`.
 *
 * Requires the Claude CLI: both fixtures and the unfixed behaviour perform real plugin
 * operations, and the registry assertion reads what they wrote.
 */

const REACT_ID = E2E_SKILL.react.id;

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "project-edit bulk install-mode keys — global containment",
  () => {
    let pluginSource: E2EPluginSource;
    let wizard: EditWizard | undefined;
    let currentTempDir: string | undefined;

    beforeAll(async () => {
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
      "leaves the global install untouched when the set-all-plugin key is pressed in a project edit",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        currentTempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        // Phase A: a GLOBAL install with every skill ejected, reached by committing `Local` on
        // each Sources row in turn. Deliberately NOT `initGlobalWithEject` (or any other helper
        // in `dual-scope-helpers.ts`): every one of them presses the very key this test is about,
        // so the fixture would collapse to a no-op the moment the key is withdrawn and the test
        // would pass by never establishing the state it needs. A spec may not depend on the
        // behaviour it is pinning the removal of.
        const initWizard = await InitWizard.launch({
          source: pluginSource,
          projectDir: fakeHome,
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });
        const initDomains = await initWizard.stack.selectFirstStack();
        const initBuild = await initDomains.acceptDefaults();
        const initSources = await initBuild.passThroughAllDomains();
        await initSources.waitForReady();
        await initSources.commitLocalOnEveryRow();
        const initAgents = await initSources.advance();
        const initConfirm = await initAgents.acceptDefaults("init");
        const initResult = await initConfirm.confirm();
        expect(await initResult.exitCode, initResult.rawOutput).toBe(EXIT_CODES.SUCCESS);
        await initResult.destroy();

        // Phase B: the project install. `setLocal: false` keeps every bulk key out of the setup.
        const phaseB = await initProject(pluginSource, fakeHome, projectDir, { setLocal: false });
        expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

        // Both configs must name a marketplace or plugin mode is not reachable at all, and
        // the key under test would be inert for a reason that has nothing to do with the fix.
        await injectMarketplaceIntoConfig(fakeHome, pluginSource.marketplaceName);
        await injectMarketplaceIntoConfig(projectDir, pluginSource.marketplaceName);

        // Pre-state, captured AFTER the marketplace injection so the snapshot is the file the
        // edit actually opens.
        const globalConfigBefore = await readTestFile(configTsPath(fakeHome));
        expect(
          await directoryExists(path.join(skillsPath(fakeHome), REACT_ID)),
          "the ejected global react copy must exist before the press — it is what a migration would delete",
        ).toBe(true);
        await expect({ dir: fakeHome }).toHaveNoPlugins();

        wizard = await EditWizard.launch({
          projectDir,
          source: pluginSource,
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        const sources = await wizard.build.passThroughAllDomains();
        await sources.waitForReady();
        await sources.pressSetAllPluginHotkey();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        // Proof of execution: the session drove the whole edit pipeline to completion. Without
        // it, a run that died before the write would satisfy every containment claim below for
        // the wrong reason.
        expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();

        expect(
          await readTestFile(configTsPath(fakeHome)),
          "a project edit may not rewrite the global config.ts",
        ).toBe(globalConfigBefore);
        expect(
          await directoryExists(path.join(skillsPath(fakeHome), REACT_ID)),
          "a project edit may not delete the global scope's ejected working copy",
        ).toBe(true);
        await expect({ dir: fakeHome }).toHaveNoPlugins();
      },
    );

    it(
      "leaves the global install untouched when the set-all-local key is pressed in a project edit",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const reactPluginRef = buildMarketplacePluginRef(REACT_ID, pluginSource.marketplaceName);

        const env = await createTestEnvironment();
        currentTempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        // Global install: every skill plugin-sourced (the marketplace init default). Project
        // install: hono moved G->P with `setLocal: false`, so no bulk key runs in setup and the
        // globals are still plugin-sourced when the test presses one.
        const phaseA = await initGlobal(pluginSource, fakeHome);
        expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);
        const phaseB = await initProject(pluginSource, fakeHome, projectDir, { setLocal: false });
        expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

        const globalConfigBefore = await readTestFile(configTsPath(fakeHome));
        await expect({ dir: fakeHome }).toHavePluginInRegistry(reactPluginRef, "user");
        expect(
          await directoryExists(path.join(skillsPath(fakeHome), REACT_ID)),
          "a plugin-sourced global react must have no ejected copy under $HOME before the press",
        ).toBe(false);

        wizard = await EditWizard.launch({
          projectDir,
          source: pluginSource,
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        const sources = await wizard.build.passThroughAllDomains();
        await sources.waitForReady();
        await sources.pressSetAllLocalHotkey();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
        await result.destroy();

        expect(
          await readTestFile(configTsPath(fakeHome)),
          "a project edit may not rewrite the global config.ts",
        ).toBe(globalConfigBefore);
        expect(
          await directoryExists(path.join(skillsPath(fakeHome), REACT_ID)),
          "a project edit may not eject the global scope's plugin-sourced skill into $HOME",
        ).toBe(false);
        await expect({ dir: fakeHome }).toHavePluginInRegistry(reactPluginRef, "user");
      },
    );
  },
);
