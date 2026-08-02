import { symlink } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTypesTsPath,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  loadConfigOrFail,
  readTestFile,
  skillsPath,
  writeConfigTypes,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { FEATURE_FLAGS } from "../../src/cli/lib/feature-flags.js";
import "../matchers/setup.js";

/**
 * Adding a source in the wizard's settings overlay writes it to `config.ts`
 * IMMEDIATELY, and cancelling the wizard afterwards keeps it. That is deliberate:
 * a marketplace registration is a machine-level preference the user just
 * confirmed by URL, not part of the install the wizard is still assembling — and
 * losing it on cancel would mean re-typing the URL on every abandoned run.
 *
 * This spec is a GREEN guard, not a red one. It pins the semantics as they are
 * today so the config-gate migration cannot quietly convert this write into a
 * gated, install-shaped one: a source add touches the config half only, so it
 * must NOT regenerate the global `config-types.ts` (no skill, agent, domain or
 * category union moves) and must NOT fan out to registered projects.
 *
 * Run at $HOME (cwd === HOME), the global scope, where the config the overlay
 * writes is the global manifest.
 *
 * The global config pair is seeded blank up front so "config-types.ts is
 * unchanged" is a real byte comparison rather than an assertion about a file
 * that never existed. A blank config declares no skills and no agents, so it
 * represents no installation and init still renders the setup wizard (see
 * cancelled-init-blank-global-config.e2e.test.ts).
 *
 * SKIPPED while `WIZARD_SETTINGS_OVERLAY` is off (D-307): the overlay this spec
 * drives is withdrawn, so `s` opens nothing and there is no add-source input to
 * type into. The spec is kept, not deleted — it is the persistence contract the
 * overlay must still satisfy when it returns.
 *
 * DEFECT the fixture works around, and which must be fixed BEFORE the flag is
 * flipped back on: the wizard root's `useInput` (wizard.tsx) intercepts the
 * settings hotkey `s` whenever `store.showSettings` is true — including while the
 * add-source TEXT INPUT is open. Typing any URL containing an `s` therefore
 * closes the overlay mid-word and drops the rest of the URL into the sources
 * grid, where `l`/`p` are further hotkeys and Enter advances the step. No URL
 * with an `s` in it can be entered at all. The marketplace is reached through a
 * symlink whose whole relative path is `s`-free so this spec pins the persistence
 * semantics rather than the input defect; a spec for the defect itself belongs
 * with the sources step's input handling.
 */

/**
 * Relative path typed into the add-source input, resolved against the wizard's
 * cwd (`fetchFromLocalSource`). Deliberately free of the `s` hotkey — see the
 * defect note above — and free of `..`/`~`, which `isLocalSource` rejects.
 */
const MARKETPLACE_LINK = "./mkt";

const settingsOverlayEnabled = FEATURE_FLAGS.WIZARD_SETTINGS_OVERLAY;

describe.skipIf(!settingsOverlayEnabled)("adding a source then cancelling the init wizard", () => {
  let pluginSource: E2EPluginSource;
  let wizard: InitWizard | undefined;
  let fakeHome: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    pluginSource = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (pluginSource) await cleanupTempDir(pluginSource.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (fakeHome) {
      await cleanupTempDir(fakeHome);
      fakeHome = undefined;
    }
  });

  it(
    "persists the source in the global config while leaving config-types.ts and registered projects untouched",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const home = await createTempDir();
      fakeHome = home;
      await symlink(pluginSource.sourceDir, path.join(home, MARKETPLACE_LINK));

      await writeProjectConfig(home, { name: "global", skills: [], agents: [] });
      await writeConfigTypes(home);
      const configTypesBefore = await readTestFile(configTypesTsPath(home));

      const w = await InitWizard.launchInGlobal({
        source: { sourceDir: pluginSource.sourceDir, tempDir: pluginSource.tempDir },
        projectDir: home,
      });
      wizard = w;

      const domain = await w.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();
      await sources.waitForReady();

      await sources.openSettings();
      await sources.addSourceUrl(MARKETPLACE_LINK);

      w.abort();
      const exitCode = await w.waitForExit(TIMEOUTS.EXIT_WAIT);
      expect(exitCode, "aborting the sources step must exit as cancelled").toBe(
        EXIT_CODES.CANCELLED,
      );

      // The add survives the cancel — the documented semantics.
      const config = await loadConfigOrFail(home);
      expect(config.sources, "the added source must survive the cancelled wizard").toStrictEqual([
        { name: pluginSource.marketplaceName, url: MARKETPLACE_LINK },
      ]);

      // ...and nothing else did. A cancelled wizard installs nothing, so the
      // config's install halves stay empty and no content lands on disk.
      expect(config.skills, "a cancelled wizard must install no skills").toStrictEqual([]);
      expect(config.agents, "a cancelled wizard must install no agents").toStrictEqual([]);
      expect(
        await directoryExists(skillsPath(home)),
        "a cancelled wizard must not create global skills",
      ).toBe(false);
      expect(
        await directoryExists(agentsPath(home)),
        "a cancelled wizard must not create global agents",
      ).toBe(false);

      // A source add moves no type union, so the types half must be byte-identical.
      expect(
        await readTestFile(configTypesTsPath(home)),
        "adding a source must not regenerate the global config-types.ts",
      ).toBe(configTypesBefore);

      // ...and it is not an install, so it must not fan out to registered projects.
      expect(
        w.getOutput(),
        "adding a source must not trigger a propagated recompile",
      ).not.toContain(STEP_TEXT.PROPAGATED_RECOMPILE);
    },
  );
});
