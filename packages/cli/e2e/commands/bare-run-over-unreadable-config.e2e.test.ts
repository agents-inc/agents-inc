import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  cleanupTempDir,
  compactCliOutput,
  configTsPath,
  createTempDir,
  flattenCliOutput,
  readTreeSnapshot,
  sourceFolderIn,
  writeCorruptConfig,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { DashboardSession } from "../pages/dashboard-session.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

/**
 * `agents-inc` with no command, over a `config.ts` that exists and cannot be loaded — journey 38's
 * refusal, reached through the one door that is not a command.
 *
 * The bare run shows the dashboard of the installation it finds, and finding it means loading the
 * config. Every named command refuses that file, naming it and the folder to recreate it from; the
 * bare run must do the same and exit as they do, not print the root help and exit 0 as though
 * nothing were installed.
 *
 * Both readers' files are driven: the global installation's, from the home directory, and a
 * project's own, from that project. The last spec is the permitted twin — the same project with
 * its config readable, which shows the dashboard and exits clean.
 */

/** One bare run, as a refusal is asserted on. */
type BareRun = { exitCode: number; output: string };

/** The refusal every named command prints over the file, read through oclif's wrapping. */
function expectConfigRefusal(
  { exitCode, output }: BareRun,
  whose: string,
  configPath: string,
  recreateFrom: string,
): void {
  const compacted = compactCliOutput(output);
  expect(
    compacted,
    "the bare run names the config it cannot load, as every command does",
  ).toContain(compactCliOutput(`${whose} '${configPath}'`));
  expect(flattenCliOutput(output)).toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
  expect(compacted, "and the folder uninstall, then init, are run from").toContain(
    compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_RECREATE_FROM} '${recreateFrom}'`),
  );
  expect(exitCode, output).toBe(EXIT_CODES.ERROR);
  expect(output, "a refusal is not a request for the help").not.toContain(
    STEP_TEXT.ROOT_HELP_USAGE,
  );
}

describe("agents-inc with no command over a config.ts that cannot be loaded", () => {
  const tempDirs: string[] = [];
  let dashboard: DashboardSession | undefined;

  afterEach(async () => {
    await dashboard?.destroy();
    dashboard = undefined;
  });

  afterAll(async () => {
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /** An empty home directory, so a project's config is the only one in play. */
  async function emptyHome(): Promise<string> {
    const tempDir = await createTempDir();
    tempDirs.push(tempDir);
    const home = path.join(tempDir, "home");
    await mkdir(home, { recursive: true });
    return home;
  }

  /** An installed project, whose config.ts is replaced by one that does not parse when asked. */
  async function installedProject(options: { broken: boolean }): Promise<string> {
    const project = await ProjectBuilder.editable();
    tempDirs.push(path.dirname(project.dir));
    if (options.broken) await writeCorruptConfig(project.dir, renderUnparseableConfigTs());
    return project.dir;
  }

  describe("the global installation's config, from the home directory", () => {
    let home: string;
    let run: BareRun;
    let before: Record<string, TreeSnapshotEntry>;

    beforeAll(async () => {
      home = await emptyHome();
      await writeCorruptConfig(home, renderUnparseableConfigTs());
      before = await readTreeSnapshot(sourceFolderIn(home));
      run = await CLI.run([], { dir: home }, { env: { HOME: home } });
    }, TIMEOUTS.SETUP);

    it("refuses as every other command does, naming the global config", () => {
      expectConfigRefusal(run, STEP_TEXT.CONFIG_UNREADABLE_GLOBAL, configTsPath(home), home);
    });

    it("leaves the installation byte-identical", async () => {
      expect(await readTreeSnapshot(sourceFolderIn(home))).toStrictEqual(before);
    });
  });

  describe("a project's own config, from that project", () => {
    let home: string;
    let projectDir: string;
    let run: BareRun;
    let before: Record<string, TreeSnapshotEntry>;

    beforeAll(async () => {
      home = await emptyHome();
      projectDir = await installedProject({ broken: true });
      before = await readTreeSnapshot(projectDir);
      run = await CLI.run([], { dir: projectDir }, { env: { HOME: home } });
    }, TIMEOUTS.SETUP);

    it("refuses as every other command does, naming the project's config", () => {
      expectConfigRefusal(
        run,
        STEP_TEXT.CONFIG_UNREADABLE_PROJECT,
        configTsPath(projectDir),
        projectDir,
      );
    });

    it("refuses in a terminal too, where the dashboard would have been", async () => {
      dashboard = await InitWizard.launchForDashboard({
        projectDir,
        bare: true,
        env: { HOME: home },
      });

      const exitCode = await dashboard.waitForExit(TIMEOUTS.EXIT_WAIT);

      expectConfigRefusal(
        { exitCode, output: dashboard.getOutput() },
        STEP_TEXT.CONFIG_UNREADABLE_PROJECT,
        configTsPath(projectDir),
        projectDir,
      );
    });

    it("leaves the project byte-identical", async () => {
      expect(await readTreeSnapshot(projectDir)).toStrictEqual(before);
    });
  });

  it("shows the dashboard and exits clean once the same project's config is readable", async () => {
    const home = await emptyHome();
    const projectDir = await installedProject({ broken: false });

    const { exitCode, stdout, output } = await CLI.run(
      [],
      { dir: projectDir },
      { env: { HOME: home } },
    );

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(stdout, "the dashboard's text is printed").toContain(STEP_TEXT.DASHBOARD);
    expect(output).not.toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
  });
});
