import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  seedDefaultSourceCache,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, SOURCE_PATHS, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";

/**
 * Sources step column set when init runs against a custom `--source`.
 *
 * The multi-source loader tags every skill with the primary source and then —
 * because the source URL is not the default public one — tags it a second time
 * with the public marketplace. Neither source carries a marketplace.json here,
 * so both tags fall back to the same marketplace name and the grid renders two
 * indistinguishable marketplace columns: the user cannot tell which column they
 * are selecting, and both write the same value.
 *
 * The public-source fetch is served from a pre-seeded on-disk cache so the test
 * never touches the network. KNOWN GAP: the seed is load-bearing and leaves no
 * post-fix residue to assert on — if the cache path derivation in
 * `seedDefaultSourceCache` ever drifts from `getCacheDir`, the public tagging
 * pass silently no-ops and the column assertions below pass vacuously. The
 * setup assertion on the seeded skills directory is the only guard available.
 */
describe("sources step — custom source column set", () => {
  let source: E2ESource;
  let tempDir: string;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (source) await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  it(
    "offers one marketplace column, not two identically labelled ones",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;

      const seededCacheDir = await seedDefaultSourceCache(env.fakeHome, source.sourceDir);
      expect(
        await directoryExists(path.join(seededCacheDir, SOURCE_PATHS.SKILLS_DIR)),
        "public-source cache seed must expose a skills directory for the loader to read",
      ).toBe(true);

      wizard = await InitWizard.launch({
        source,
        projectDir: env.projectDir,
        env: { HOME: env.fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();
      await sources.waitForReady();

      const frame = sources.getOutput();

      expect(frame).toContain("Local");
      expect(frame).toContain("Plugin");
      expect(frame).toContain("Eject");
      expect(frame).toContain("Agents Inc");
      expect(frame).not.toMatch(/Plugin[ \t]+Plugin/);
      expect(frame).not.toMatch(/Agents Inc[ \t]+Agents Inc/);

      // Read-only scenario: aborting installs nothing, so config AND filesystem
      // must be untouched at both scopes.
      const exitCode = await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      wizard = undefined;
      expect(exitCode, "aborting the sources step must exit as cancelled").toBe(
        EXIT_CODES.CANCELLED,
      );

      expect(
        await fileExists(configTsPath(env.projectDir)),
        "an aborted init must not write a project config.ts",
      ).toBe(false);
      expect(
        await directoryExists(skillsPath(env.projectDir)),
        "an aborted init must not create project skills",
      ).toBe(false);
      expect(
        await directoryExists(agentsPath(env.projectDir)),
        "an aborted init must not create project agents",
      ).toBe(false);
      expect(
        await directoryExists(skillsPath(env.fakeHome)),
        "an aborted init must not create global skills",
      ).toBe(false);
      expect(
        await directoryExists(agentsPath(env.fakeHome)),
        "an aborted init must not create global agents",
      ).toBe(false);
    },
  );
});
