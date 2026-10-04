import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import {
  CONFIG_READER_NAMES,
  EMPTY_CONFIG_FILE,
  TERMINAL_CONFIG_READERS,
  UNREADABLE_CONFIG_SHAPES,
  runEveryReaderOverABrokenConfig,
  runEveryReaderOverReadableConfigs,
  runOf,
  setAsideInstallation,
  type ConfigReaderRun,
  type RunsOverABrokenConfig,
  type RunsOverReadableConfigs,
} from "../fixtures/config-reading-commands.js";
import { createDualScopeEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  compactCliOutput,
  configTsPath,
  flattenCliOutput,
  writeCorruptConfig,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * A global `config.ts` that EXISTS and cannot be loaded stops every command run from a project
 * under it, though the project's own config is fine — journey 38, driven from scratch.
 *
 * The installation is the product's own work: a real global install and a real project set up
 * under it, both through the wizard. Only the broken file is written by hand, because no command
 * writes one.
 *
 * **Every command that reads the configs refuses, and says the same thing.** The write commands
 * — `init`, `edit`, `compile`, `update`, `share` and `eject` — and the two that only read, `search`
 * and `list`. A project inherits the global config, so a broken global one is a config this folder
 * uses as surely as its own. Against the unfixed binary `init`, `edit` and `compile` refused while
 * `update`, `eject`, `share`, `search` and `list` went ahead over it — `share` published, `eject`
 * wrote, `search` answered.
 *
 * **The refusal says WHICH config, and where to recreate it from.** Recreating is `uninstall`,
 * then `init`, run from the broken config's own folder — the home directory here. A remedy naming
 * no folder, read from the project, sends the user to uninstall the project: the one config that
 * was fine. Against the unfixed binary the three commands that did refuse said neither.
 *
 * **`doctor` reports it and finishes; `uninstall` always works.** The first is pinned as a report
 * with its summary printed; the second runs from the home directory over the broken file and
 * removes the installation. The other half of the pair is the second describe: the same commands
 * over the same kind of installation with both configs readable, each of which runs. A guard that
 * had swallowed its whole domain would satisfy every refusal without it.
 *
 * Each shape is driven over the installation as the wizard left it — set aside once, put back
 * before every shape — so a command that went ahead over one shape cannot leave the next shape's
 * byte-identity check with nothing to catch.
 */

describe("a real installation whose GLOBAL config.ts cannot be loaded, seen from its project", () => {
  let env: DualScopeEnv;
  let store: SeedConfigStore;
  let globalConfig: string;
  const broken = new Map<string, RunsOverABrokenConfig>();
  let uninstall: CLIResult;

  beforeAll(async () => {
    env = await createDualScopeEnv(E2E_SOURCE);
    store = await startSeedConfigStore();
    globalConfig = configTsPath(env.fakeHome);
    const restoreInstallation = await setAsideInstallation(env.fakeHome);

    for (const { shape, body } of UNREADABLE_CONFIG_SHAPES) {
      await restoreInstallation();
      broken.set(shape, await runEveryReaderOverABrokenConfig(env, env.fakeHome, body, store));
    }

    await restoreInstallation();
    await writeCorruptConfig(env.fakeHome, EMPTY_CONFIG_FILE);
    uninstall = await CLI.run(
      ["uninstall", "--yes"],
      { dir: env.fakeHome },
      { env: { HOME: env.fakeHome } },
    );
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await env.destroy();
  });

  /** What every command did over one shape, which the hook above recorded for every shape. */
  function brokenBy(shape: string): RunsOverABrokenConfig {
    const runs = broken.get(shape);
    if (!runs) throw new Error(`nothing was recorded for a global config that ${shape}`);
    return runs;
  }

  /**
   * The paths are compared compacted, both sides: oclif breaks a word longer than its line wherever
   * the column runs out, and a temp path is one under any but a short `TMPDIR`.
   */
  function expectRefusalNamingTheGlobalConfig({ exitCode, output }: ConfigReaderRun): void {
    expect(exitCode, output).toBe(EXIT_CODES.ERROR);
    const compacted = compactCliOutput(output);
    expect(
      compacted,
      "the refusal says the broken config is the global one, by its path",
    ).toContain(compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_GLOBAL} '${globalConfig}'`));
    expect(flattenCliOutput(output)).toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
    expect(
      compacted,
      "and that uninstall, then init, are run from the home directory, where that config lives",
    ).toContain(compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_RECREATE_FROM} '${env.fakeHome}'`));
    expect(
      compacted,
      "never from the project, whose config is fine and which an uninstall there would delete",
    ).not.toContain(
      compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_RECREATE_FROM} '${env.projectDir}'`),
    );
  }

  describe.each(UNREADABLE_CONFIG_SHAPES)("when it $shape", ({ shape }) => {
    it.each(CONFIG_READER_NAMES)("refuses '%s', naming the global config", (name) => {
      expectRefusalNamingTheGlobalConfig(runOf(brokenBy(shape).runs, name));
    });

    it.each(TERMINAL_CONFIG_READERS)(
      "refuses '%s' in a terminal, naming the global config",
      (name) => {
        expectRefusalNamingTheGlobalConfig(brokenBy(shape).terminal[name]);
      },
    );

    it("answers no search out of the marketplace the project's config names", () => {
      expect(runOf(brokenBy(shape).runs, "search").output).not.toContain(E2E_SKILL.react.display);
    });

    it("withholds the eject tick for an ejection it refused", () => {
      for (const name of ["eject templates", "eject skills"] as const) {
        expect(runOf(brokenBy(shape).runs, name).output, name).not.toContain(
          STEP_TEXT.EJECT_SUCCESS,
        );
      }
    });

    it("sends nothing to the config store when share refuses", () => {
      expect(brokenBy(shape).shareRequests).toStrictEqual([]);
    });

    it("leaves the installation, both scopes of it, byte-identical", () => {
      const { treeBefore, treeAfter } = brokenBy(shape);
      expect(Object.keys(treeBefore).length, "the snapshot holds the installation").toBeGreaterThan(
        0,
      );
      expect(treeAfter, "a refused command writes nothing anywhere").toStrictEqual(treeBefore);
    });

    it("is reported by doctor, which finishes its report", () => {
      const { stdout } = brokenBy(shape).doctor;
      expect(stdout).toContain(`~/${DIRS.SOURCE_CLAUDE}/${FILES.CONFIG_TS}`);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
      expect(stdout, "doctor reports the fault rather than stopping on it").toContain(
        STEP_TEXT.DOCTOR_SUMMARY,
      );
    });
  });

  it("is removed by uninstall from the home directory, which still works on it", async () => {
    expect(uninstall.exitCode, uninstall.output).toBe(EXIT_CODES.SUCCESS);
    expect(
      flattenCliOutput(uninstall.output),
      "the warning names the config it could not read, which at the home directory is the global one",
    ).toContain(STEP_TEXT.UNINSTALL_GLOBAL_CONFIG_UNREADABLE);
    expect(uninstall.output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
    await expectCleanUninstall(env.fakeHome, { removeConfig: true });
  });
});

describe("the same installation with both configs readable", () => {
  let env: DualScopeEnv;
  let store: SeedConfigStore;
  let readable: RunsOverReadableConfigs;

  beforeAll(async () => {
    env = await createDualScopeEnv(E2E_SOURCE);
    store = await startSeedConfigStore();
    readable = await runEveryReaderOverReadableConfigs(env, store);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await env.destroy();
  });

  it.each(CONFIG_READER_NAMES.filter((name) => name !== "share"))("runs '%s'", (name) => {
    const { exitCode, output } = runOf(readable.runs, name);
    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).not.toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
  });

  /**
   * Whether `share` then publishes an all-ejected installation is another spec's subject — only
   * that the config refusal is not what stops it is this one's, so its exit code is left alone.
   */
  it("lets share past the config check", () => {
    expect(runOf(readable.runs, "share").output).not.toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
  });

  it("answers the search out of the marketplace the config names", () => {
    expect(runOf(readable.runs, "search").output).toContain(E2E_SKILL.react.display);
  });

  it("ejects the templates it was asked for", () => {
    expect(readable.templateEjected).toBe(true);
  });

  it("opens init's dashboard and edit's wizard", () => {
    expect(readable.dashboardScreen).toContain(STEP_TEXT.DASHBOARD);
    expect(readable.editBuild).toContain(STEP_TEXT.BUILD_FOOTER);
  });
});
