import { rm } from "fs/promises";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, initGlobalWithEject } from "../fixtures/dual-scope-helpers.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  ensureBinaryExists,
  fileExists,
  listFiles,
  readCompiledAgents,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";

/**
 * The user deletes `~/.claude-src/config.ts` and the installation it described is
 * still on disk.
 *
 * The suite covered a config that cannot be READ (`commands/{edit,compile,doctor,
 * uninstall}-corrupt-config`) and one that is absent from an EMPTY directory
 * (`commands/doctor`). Neither is this state: here the config is gone and seven
 * ejected skills and two compiled agents remain, which is what a user actually
 * has after deleting the file the CLI told them was the manifest.
 *
 * What every command does with it is pinned below rather than argued about,
 * because the recovery advice they print is the only thing standing between the
 * user and deleting directories by hand. The last case is the one that names the
 * leftovers themselves: `doctor`'s orphan row is the only report that lists each
 * stranded file, and it is an error rather than a warning because no command
 * repairs this state.
 */

/** The config the deletion leaves behind — nothing removes or refreshes it. */
const ORPHANED_TYPE_SURFACE = "export type SkillId";

describe("a global install whose config.ts was deleted", () => {
  let tempDir: string | undefined;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  /**
   * A real global install with its `config.ts` deleted and everything else left
   * exactly as `init` wrote it.
   */
  async function installThenDeleteConfig(): Promise<{
    fakeHome: string;
    skillIds: string[];
    agentFiles: string[];
  }> {
    const env = await createTestEnvironment();
    tempDir = env.tempDir;

    const install = await initGlobalWithEject(E2E_SOURCE, env.fakeHome);
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

      // The content layer still sees the installation — it reads the disk, not
      // the config — and its counts are the leftovers, named exactly.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(stdout).toContain(`${skillIds.length} ${STEP_TEXT.DOCTOR_SKILLS_VALIDATED}`);
      expect(stdout).toContain(`${agentFiles.length} ${STEP_TEXT.DOCTOR_AGENTS_VALIDATED}`);

      // The operational layer names the missing file and the way back. This is
      // the recovery advice the whole state hinges on: an "unreadable" verdict
      // here would send the user to the recreate path for a file that is gone.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_NOT_FOUND);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_CREATE_CONFIG);
      expect(
        stdout,
        "a deleted config is absent, not unreadable — the two have different remedies",
      ).not.toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);

      // Every row that reads the config is skipped, because there is none.
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

      // `edit` refuses on the same grounds rather than opening a wizard over
      // content it cannot describe — the refusal lands before the wizard mounts,
      // which is what makes it a refusal rather than a lost session.
      const edit = await CLI.run(["edit"], { dir: fakeHome }, { env: { HOME: fakeHome } });
      expect(edit.exitCode, edit.output).toBe(EXIT_CODES.ERROR);
      expect(edit.output).toContain(STEP_TEXT.NO_INSTALLATION);

      const list = await CLI.run(["list"], { dir: fakeHome }, { env: { HOME: fakeHome } });
      expect(list.exitCode, list.output).toBe(EXIT_CODES.SUCCESS);
      expect(list.stdout).toContain(STEP_TEXT.NO_INSTALLATION);

      // Refusing is not the same as repairing: three refusals must leave the
      // stranded installation exactly as they found it, on every surface.
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
      // Surface 4: the generated type surface outlives the config it was
      // generated from, unchanged and now describing nothing.
      expect(await readTestFile(configTypesTsPath(fakeHome))).toBe(typesBefore);
      expect(typesBefore).toContain(ORPHANED_TYPE_SURFACE);
    },
  );

  it(
    "offers a fresh setup wizard rather than the dashboard when init is run again",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, skillIds } = await installThenDeleteConfig();

      // `init` picks between a dashboard and a wizard by detecting an
      // installation, and detection reads the config — so the way out of this
      // state is the from-scratch wizard, on a directory that is anything but.
      wizard = await InitWizard.launch({
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });

      const frame = wizard.getScreen();
      // The stack step is the positive subject guard for the negative below:
      // the wizard's first screen painted, so the dashboard's absence from the
      // append-only raw output is a screen that never rendered.
      expect(frame).toContain(STEP_TEXT.STACK);
      expect(
        wizard.getRawOutput(),
        "a deleted config leaves no installation for the dashboard to open",
      ).not.toContain(STEP_TEXT.DASHBOARD);

      const exitCode = await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      wizard = undefined;
      expect(exitCode).toBe(EXIT_CODES.CANCELLED);

      expect(
        (await listFiles(skillsPath(fakeHome))).sort(),
        "opening and cancelling the wizard must leave the stranded skills alone",
      ).toStrictEqual(skillIds);
    },
  );

  /**
   * The row whose whole purpose is "these files belong to no configuration",
   * in the one state where every installed file qualifies. It stands down for a
   * config that exists and cannot be used, because there the ownership question
   * has no answer — here it has one answer, and it is "none of them".
   */
  it(
    "reports the stranded skills and agents as orphans",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, skillIds, agentFiles } = await installThenDeleteConfig();

      const { stdout } = await CLI.run(["doctor"], { dir: fakeHome }, { env: { HOME: fakeHome } });

      // An error, not a warning: no command repairs this state. The row's other
      // verdict is a warning because the next `compile` prunes what it names.
      expect(stdout).toMatch(
        new RegExp(`${STEP_TEXT.DOCTOR_ROW_NO_ORPHANS}\\s+${UI_SYMBOLS.CROSS}\\s`),
      );
      expect(stdout).toContain(STEP_TEXT.DOCTOR_UNOWNED_INSTALL);

      // Named, not counted: the content layer already counts these files, and a
      // second count is not what a user deciding their fate can act on.
      for (const skillId of skillIds) {
        expect(stdout, `${skillId} is stranded and the orphan row must name it`).toContain(skillId);
      }
      for (const agentFile of agentFiles) {
        expect(stdout, `${agentFile} is stranded and the orphan row must name it`).toContain(
          agentFile.replace(".md", ""),
        );
      }

      // Naming the files is half a report. The other half is what to do with
      // them, which `init` alone does not say — it recreates the configuration
      // and leaves the reader to guess what happened to the leftovers.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_UNOWNED_INSTALL);
    },
  );
});
