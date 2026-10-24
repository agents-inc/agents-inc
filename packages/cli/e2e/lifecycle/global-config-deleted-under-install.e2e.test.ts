import { rm } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  fileExists,
  listFiles,
  readCompiledAgents,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { doctorRow, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/** `doctor`'s orphan row names each stranded file, as an error because no command repairs it. */

/** Nothing removes or refreshes it. */
const ORPHANED_TYPE_SURFACE = "export type SkillId";

const STACK_AT_HOME_ID = "StackHm2";

describe("a global install whose config.ts was deleted", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(STACK_AT_HOME_ID, e2eStackPayload({ scope: "global" }));
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  async function installThenDeleteConfig(): Promise<{
    fakeHome: string;
    skillIds: string[];
    agentFiles: string[];
  }> {
    const env = await createTestEnvironment();
    tempDir = env.tempDir;

    const install = await runInitFrom(
      store,
      STACK_AT_HOME_ID,
      { dir: env.fakeHome },
      E2E_SOURCE.sourceDir,
    );
    expect(install.exitCode, `global init failed:\n${install.output}`).toBe(EXIT_CODES.SUCCESS);

    const skillIds = (await listFiles(skillsPath(env.fakeHome))).sort();
    const agentFiles = Object.keys(await readCompiledAgents(env.fakeHome)).sort();
    expect(skillIds.length, "the install must have ejected skills to strand").toBeGreaterThan(0);
    expect(agentFiles.length, "the install must have compiled agents to strand").toBeGreaterThan(0);

    await rm(configTsPath(env.fakeHome), { force: true });
    expect(await fileExists(configTsPath(env.fakeHome))).toBe(false);

    return { fakeHome: env.fakeHome, skillIds, agentFiles };
  }

  it(
    "is reported by doctor as content that exists with no configuration to describe it",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, skillIds, agentFiles } = await installThenDeleteConfig();

      const { exitCode, stdout, output } = await CLI.run(
        ["doctor"],
        { dir: fakeHome },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.ERROR);

      // The content layer reads the disk, not the config, so its counts are the leftovers.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(stdout).toContain(`${skillIds.length} ${STEP_TEXT.DOCTOR_SKILLS_VALIDATED}`);
      expect(stdout).toContain(`${agentFiles.length} ${STEP_TEXT.DOCTOR_AGENTS_VALIDATED}`);

      // An "unreadable" verdict here would send the user to recreate a file that is gone.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_NOT_FOUND);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_CREATE_CONFIG);
      expect(
        stdout,
        "a deleted config is absent, not unreadable — the two have different remedies",
      ).not.toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);

      expect(stdout).toContain(STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID);
    },
  );

  it(
    "refuses to compile or edit, and says which command creates a configuration",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, skillIds, agentFiles } = await installThenDeleteConfig();
      const agentsBefore = await readCompiledAgents(fakeHome);
      const typesBefore = await readTestFile(configTypesTsPath(fakeHome));

      const compile = await CLI.run(["compile"], { dir: fakeHome }, { env: { HOME: fakeHome } });
      expect(compile.exitCode, compile.output).toBe(EXIT_CODES.ERROR);
      expect(compile.output).toContain(STEP_TEXT.NO_INSTALLATION);

      const edit = await CLI.run(["edit"], { dir: fakeHome }, { env: { HOME: fakeHome } });
      expect(edit.exitCode, edit.output).toBe(EXIT_CODES.ERROR);
      expect(edit.output).toContain(STEP_TEXT.NO_INSTALLATION);

      const list = await CLI.run(["list"], { dir: fakeHome }, { env: { HOME: fakeHome } });
      expect(list.exitCode, list.output).toBe(EXIT_CODES.SUCCESS);
      expect(list.stdout).toContain(STEP_TEXT.NO_INSTALLATION);

      expect(
        (await listFiles(skillsPath(fakeHome))).sort(),
        "a refused command must not remove the stranded skills",
      ).toStrictEqual(skillIds);
      expect(
        await readCompiledAgents(fakeHome),
        "a refused command must not rewrite the stranded agents",
      ).toStrictEqual(agentsBefore);
      expect(Object.keys(agentsBefore).sort()).toStrictEqual(agentFiles);
      expect(
        await fileExists(configTsPath(fakeHome)),
        "no command may silently recreate the config the user deleted",
      ).toBe(false);
      expect(await readTestFile(configTypesTsPath(fakeHome))).toBe(typesBefore);
      expect(typesBefore).toContain(ORPHANED_TYPE_SURFACE);
    },
  );

  it(
    "opens the editor rather than the dashboard when init is run again",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, skillIds } = await installThenDeleteConfig();

      // Detection reads the config, so with it deleted a bare init takes the editor route.
      const init = await CLI.run(["init"], { dir: fakeHome }, { env: { HOME: fakeHome } });

      expect(init.exitCode, init.output).toBe(EXIT_CODES.SUCCESS);
      expect(init.stdout).toContain(`Build it at ${STEP_TEXT.EDITOR_URL}`);
      expect(
        init.output,
        "a deleted config leaves no installation for the dashboard to open",
      ).not.toContain(STEP_TEXT.DASHBOARD);

      expect(
        (await listFiles(skillsPath(fakeHome))).sort(),
        "opening the editor must leave the stranded skills alone",
      ).toStrictEqual(skillIds);
    },
  );

  /** Stands down for an unusable config; here every installed file belongs to none. */
  it(
    "reports the stranded skills and agents as orphans",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, skillIds, agentFiles } = await installThenDeleteConfig();

      const { stdout } = await CLI.run(["doctor"], { dir: fakeHome }, { env: { HOME: fakeHome } });

      // The row's other verdict is a warning because the next `compile` prunes what it names.
      expect(stdout).toMatch(
        doctorRow(STEP_TEXT.DOCTOR_ROW_NO_ORPHANS, STEP_TEXT.DOCTOR_STATUS_FAIL),
      );
      expect(stdout).toContain(STEP_TEXT.DOCTOR_UNOWNED_INSTALL);

      // Named, not counted: the content layer already counts them.
      for (const skillId of skillIds) {
        expect(stdout, `${skillId} is stranded and the orphan row must name it`).toContain(skillId);
      }
      for (const agentFile of agentFiles) {
        expect(stdout, `${agentFile} is stranded and the orphan row must name it`).toContain(
          agentFile.replace(".md", ""),
        );
      }

      // What to do with them, which `init` alone does not say.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_UNOWNED_INSTALL);
    },
  );
});
