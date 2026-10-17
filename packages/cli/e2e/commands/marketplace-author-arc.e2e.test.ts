import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  flattenCliOutput,
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
  MARKETPLACE_MANIFEST_PATH,
  SOURCE_PATHS,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";
import "../matchers/setup.js";

/**
 * A marketplace author's arc: doctor, build plugins, build marketplace, then install from the
 * result. In the repository `doctor` skips the operational layer and warns about the manifest until
 * it is built. Eject only: plugin install needs the Claude CLI.
 */

/** The fixture's own name: its skill ids carry it as their prefix. */
const MARKETPLACE_NAME = E2E_MARKETPLACE_NAME;

const GENERATED_ALIASES = ["SkillId", "AgentName", "Category"] as const;

describe("marketplace author arc — check, build, publish, install", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    const source = await createE2ESource({ unbuilt: true });
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "validates the repository, builds a plugin per skill, and lists every one in the marketplace",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Nothing is installed in a repository, so the operational layer says so rather than
      // reporting rows.
      const beforeBuild = await CLI.run(["doctor"], { dir: sourceDir });
      expect(beforeBuild.exitCode, beforeBuild.output).toBe(EXIT_CODES.SUCCESS);
      expect(beforeBuild.stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(beforeBuild.stdout).toContain(sourceDir);
      expect(beforeBuild.stdout).toContain(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION);
      expect(
        beforeBuild.stdout,
        "a source repository has no installed state, so operational rows would be noise",
      ).not.toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(
        flattenCliOutput(beforeBuild.stdout),
        "a repository nobody has built has no marketplace.json yet, which its author is told as a warning against the file",
      ).toContain(`[WARN] ${MARKETPLACE_MANIFEST_PATH}`);

      const buildPlugins = await CLI.run(["build", "plugins"], { dir: sourceDir });
      expect(buildPlugins.exitCode, buildPlugins.output).toBe(EXIT_CODES.SUCCESS);
      expect(buildPlugins.stdout).toContain(`Compiled ${E2E_SKILL_IDS.length} skill plugins`);
      // Compared as a set: a count passes for the right number of wrong directories.
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
        path.join(sourceDir, MARKETPLACE_MANIFEST_PATH),
      );
      expect(marketplace.name).toBe(MARKETPLACE_NAME);
      expect(
        marketplace.plugins.map((plugin) => plugin.name).sort(),
        "the marketplace must list every plugin the build produced, and no others",
      ).toStrictEqual([...E2E_SKILL_IDS].sort());

      // Building must not leave the repository in a state its own check rejects.
      const afterBuild = await CLI.run(["doctor"], { dir: sourceDir });
      expect(
        afterBuild.exitCode,
        `doctor must still pass over a repository that has been built:\n${afterBuild.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      expect(afterBuild.stdout).toContain(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION);
      expect(
        flattenCliOutput(afterBuild.stdout),
        "a built repository carries its marketplace.json, so doctor has nothing to say about it",
      ).not.toContain(MARKETPLACE_MANIFEST_PATH);
    },
  );

  it(
    "installs from the built repository and passes doctor over the installation",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Runs after the build spec, against the built repository a consumer meets.
      env = await createTestEnvironment();
      const globalHome = env.fakeHome;
      const project = { dir: env.projectDir, globalHome };

      const { output: installOutput } = await installFromSeed(
        store,
        "AuthorArc",
        e2eStackPayload(),
        { dir: project.dir, home: globalHome },
        sourceDir,
      );

      expect(installOutput).toContain(STEP_TEXT.INIT_SUCCESS);

      expect(
        (await loadConfigOrFail(globalHome)).marketplace,
        "the install must record the built repository it read",
      ).toBe(sourceDir);

      expect(
        Object.keys(await readCompiledAgents(globalHome)).length,
        "installing from a built repository must still compile agents",
      ).toBeGreaterThan(0);
      expect((await listFiles(skillsPath(globalHome))).length).toBeGreaterThan(0);

      const sourceFolderDir = path.dirname(configTypesTsPath(globalHome));
      const typecheck = await typecheckGeneratedConfig(sourceFolderDir);
      expect(
        typecheck.exitCode,
        `the installed config must type-check.\ntsc output:\n${typecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      const probe = await probeConfigTypesNarrowing(sourceFolderDir, GENERATED_ALIASES);
      expect(
        probe.exitCode,
        `a bogus literal must not type-check against the installed pair.\ntsc output:\n${probe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(probe.output).toContain(TS_NOT_ASSIGNABLE);
      // Each alias, not any: one rejecting while others collapse to `string`.
      expect(
        probe.rejected,
        `every alias asked for must reject its bogus literal.\ntsc output:\n${probe.output}`,
      ).toStrictEqual([...GENERATED_ALIASES]);

      const doctor = await CLI.run(["doctor"], project);
      expect(doctor.exitCode, doctor.output).toBe(EXIT_CODES.SUCCESS);
      expect(doctor.stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(doctor.stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(
        doctor.stdout,
        "an installation must reach the operational layer, not just report clean content",
      ).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(doctor.stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION);
    },
  );
});
