import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  configTypesTsPath,
  listFiles,
  loadConfigOrFail,
  readCompiledAgents,
  readMarketplaceJson,
  skillsPath,
  writeTestPackageJson,
} from "../helpers/test-utils.js";
import {
  E2E_MARKETPLACE_NAME,
  EXIT_CODES,
  SOURCE_PATHS,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";
import "../matchers/setup.js";

/**
 * The arc an author of a marketplace walks: check the repository, build its
 * plugins, generate its marketplace, and install from the result.
 *
 * Each command in that chain has its own spec, and `createE2EPluginSource` runs
 * two of them as SETUP for other tests — throwing on a non-zero exit and
 * asserting nothing about what they produced. So the pipeline was exercised
 * constantly and never checked: nothing compared the marketplace's plugin list
 * against the skills the repository ships, and nothing asked whether a
 * repository that has been built is still one the CLI can install from.
 *
 * `doctor` is run from the source-repo cwd at both ends. It is the author's own
 * check, and it is the one command whose answer must CHANGE between the two
 * cwds: in the repository it validates content and skips the operational layer
 * (there is no installation there to be operational about), and in the installed
 * project it runs both.
 *
 * The install leg here is the eject one. Installing the BUILT PLUGINS requires
 * a registered marketplace and the Claude CLI — the same dependency that blocks
 * journey 10's refresh branch — so it is not attempted unconditionally.
 */

/**
 * The name the author publishes under. The fixture marketplace's own, because the
 * repository this arc builds is `createE2ESource()`'s — its skill ids carry that
 * name as their prefix, so publishing under any other one would ship plugins whose
 * ids belong to a different marketplace.
 */
const MARKETPLACE_NAME = E2E_MARKETPLACE_NAME;

/** The aliases an install fills in, whatever repository it read. */
const GENERATED_ALIASES = ["SkillId", "AgentName", "Category"] as const;

describe("marketplace author arc — check, build, publish, install", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "validates the repository, builds a plugin per skill, and lists every one in the marketplace",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // The author's first command, run where they run it. In a repository there
      // is nothing installed, so the operational layer has nothing to report on
      // and says so rather than emitting rows about an absent installation.
      const beforeBuild = await CLI.run(["doctor"], { dir: sourceDir });
      expect(beforeBuild.exitCode, beforeBuild.output).toBe(EXIT_CODES.SUCCESS);
      expect(beforeBuild.stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(beforeBuild.stdout).toContain(sourceDir);
      expect(beforeBuild.stdout).toContain(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION);
      expect(
        beforeBuild.stdout,
        "a source repository has no installed state, so operational rows would be noise",
      ).not.toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);

      const buildPlugins = await CLI.run(["build", "plugins"], { dir: sourceDir });
      expect(buildPlugins.exitCode, buildPlugins.output).toBe(EXIT_CODES.SUCCESS);
      expect(buildPlugins.stdout).toContain(`Compiled ${E2E_SKILL_IDS.length} skill plugins`);
      // One plugin per skill the repository ships, compared as a whole set: a
      // count passes for the right number of wrong directories.
      expect(
        (await listFiles(path.join(sourceDir, SOURCE_PATHS.PLUGINS_DIST))).sort(),
        "every skill in the repository must become a plugin",
      ).toStrictEqual([...E2E_SKILL_IDS].sort());

      await writeTestPackageJson(sourceDir, { name: MARKETPLACE_NAME });
      const buildMarketplace = await CLI.run(["build", "marketplace"], { dir: sourceDir });
      expect(buildMarketplace.exitCode, buildMarketplace.output).toBe(EXIT_CODES.SUCCESS);
      expect(buildMarketplace.stdout).toContain(
        `Marketplace generated with ${E2E_SKILL_IDS.length} plugins!`,
      );

      const marketplace = await readMarketplaceJson(
        path.join(sourceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR, "marketplace.json"),
      );
      expect(marketplace.name).toBe(MARKETPLACE_NAME);
      expect(
        marketplace.plugins.map((plugin) => plugin.name).sort(),
        "the marketplace must list every plugin the build produced, and no others",
      ).toStrictEqual([...E2E_SKILL_IDS].sort());

      // The other end of the arc's first half: building must not have left the
      // repository in a state its own author's check rejects.
      const afterBuild = await CLI.run(["doctor"], { dir: sourceDir });
      expect(
        afterBuild.exitCode,
        `doctor must still pass over a repository that has been built:\n${afterBuild.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      expect(afterBuild.stdout).toContain(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION);
    },
  );

  it(
    "installs from the built repository and passes doctor over the installation",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Runs after the build spec above and against the same repository, which
      // now carries dist/plugins and a marketplace.json — the state a consumer
      // meets, rather than the pre-build one every other install spec uses.
      wizard = await InitWizard.launchInProject({
        source: { sourceDir, tempDir: sourceTempDir },
      });
      const globalHome = wizard.globalHome;

      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode, `init from the built repo failed:\n${result.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      const installOutput = result.rawOutput;

      // Surface 2.
      expect(installOutput).toContain(STEP_TEXT.INIT_SUCCESS);

      // Surface 3: the built repository is what the installation records.
      expect(
        (await loadConfigOrFail(globalHome)).marketplace,
        "the install must record the built repository it read",
      ).toBe(sourceDir);

      // Surface 1.
      expect(
        Object.keys(await readCompiledAgents(globalHome)).length,
        "installing from a built repository must still compile agents",
      ).toBeGreaterThan(0);
      expect((await listFiles(skillsPath(globalHome))).length).toBeGreaterThan(0);

      // Surface 4.
      const claudeSrcDir = path.dirname(configTypesTsPath(globalHome));
      const typecheck = await typecheckGeneratedConfig(claudeSrcDir);
      expect(
        typecheck.exitCode,
        `the installed config must type-check.\ntsc output:\n${typecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      const probe = await probeConfigTypesNarrowing(claudeSrcDir, GENERATED_ALIASES);
      expect(
        probe.exitCode,
        `a bogus literal must not type-check against the installed pair.\ntsc output:\n${probe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(probe.output).toContain(TS_NOT_ASSIGNABLE);

      // The same command that skipped the operational layer in the repository
      // runs both layers here — the difference IS the installation.
      const doctor = await CLI.run(["doctor"], result.project);
      expect(doctor.exitCode, doctor.output).toBe(EXIT_CODES.SUCCESS);
      expect(doctor.stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(doctor.stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(
        doctor.stdout,
        "an installation must reach the operational layer, not just report clean content",
      ).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(doctor.stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION);

      await result.destroy();
    },
  );
});
