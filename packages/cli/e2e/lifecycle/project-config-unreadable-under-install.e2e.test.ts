import path from "path";
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
  readTreeSnapshot,
  writeCorruptConfig,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * A project's own `config.ts` that EXISTS and cannot be loaded stops every command run in that
 * project, under a global installation that is fine — journey 38's other config, driven from
 * scratch.
 *
 * The installation is the product's own work: a real global install and a real project set up
 * under it, both through the wizard. Only the broken file is written by hand, because no command
 * writes one.
 *
 * **Every command that reads the configs refuses, and says the same thing** — the write commands
 * `init`, `edit`, `compile`, `update`, `share` and `eject`, and `search` and `list`. Against the
 * unfixed binary `eject` and `search` read an empty or schema-refused project config as ABSENT and
 * went on out of the marketplace the global one names, `eject templates` wrote whatever the shape,
 * and `list` died on a stack trace instead of a refusal.
 *
 * **The refusal says WHICH config, and where to recreate it from** — `uninstall`, then `init`,
 * run from this project, never from the home directory, whose installation is fine. Against the
 * unfixed binary the commands that did refuse said neither.
 *
 * **`doctor` reports it and finishes; `uninstall` always works.** `uninstall` runs in the project
 * over the broken file, removes the project's installation and leaves the global one's skills and
 * compiled agents alone. The other half of the pair is the second describe: the same commands
 * with both configs readable, each of which runs. A guard that had swallowed its whole domain
 * would satisfy every refusal without it.
 *
 * Each shape is driven over the installation as the wizard left it — set aside once, put back
 * before every shape — so a command that went ahead over one shape cannot leave the next shape's
 * byte-identity check with nothing to catch.
 */

describe("a real project whose own config.ts cannot be loaded, under a readable global one", () => {
  let env: DualScopeEnv;
  let store: SeedConfigStore;
  let projectConfig: string;
  const broken = new Map<string, RunsOverABrokenConfig>();
  let uninstall: CLIResult;
  let globalClaudeBefore: Record<string, TreeSnapshotEntry>;
  let globalClaudeAfter: Record<string, TreeSnapshotEntry>;

  beforeAll(async () => {
    env = await createDualScopeEnv(E2E_SOURCE);
    store = await startSeedConfigStore();
    projectConfig = configTsPath(env.projectDir);
    const restoreInstallation = await setAsideInstallation(env.fakeHome);

    for (const { shape, body } of UNREADABLE_CONFIG_SHAPES) {
      await restoreInstallation();
      broken.set(shape, await runEveryReaderOverABrokenConfig(env, env.projectDir, body, store));
    }

    await restoreInstallation();
    await writeCorruptConfig(env.projectDir, EMPTY_CONFIG_FILE);
    const globalClaude = path.join(env.fakeHome, DIRS.CLAUDE);
    globalClaudeBefore = await readTreeSnapshot(globalClaude);
    uninstall = await CLI.run(
      ["uninstall", "--yes"],
      { dir: env.projectDir },
      { env: { HOME: env.fakeHome } },
    );
    globalClaudeAfter = await readTreeSnapshot(globalClaude);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await env.destroy();
  });

  /** What every command did over one shape, which the hook above recorded for every shape. */
  function brokenBy(shape: string): RunsOverABrokenConfig {
    const runs = broken.get(shape);
    if (!runs) throw new Error(`nothing was recorded for a project config that ${shape}`);
    return runs;
  }

  /**
   * The paths are compared compacted, both sides: oclif breaks a word longer than its line wherever
   * the column runs out, and a temp path is one under any but a short `TMPDIR`.
   */
  function expectRefusalNamingTheProjectConfig({ exitCode, output }: ConfigReaderRun): void {
    expect(exitCode, output).toBe(EXIT_CODES.ERROR);
    const compacted = compactCliOutput(output);
    expect(
      compacted,
      "the refusal says the broken config is this project's, by its path",
    ).toContain(compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_PROJECT} '${projectConfig}'`));
    expect(flattenCliOutput(output)).toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
    expect(
      compacted,
      "and that uninstall, then init, are run from this project, where that config lives",
    ).toContain(
      compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_RECREATE_FROM} '${env.projectDir}'`),
    );
    expect(compacted, "never from the home directory, whose installation is fine").not.toContain(
      compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_RECREATE_FROM} '${env.fakeHome}'`),
    );
  }

  describe.each(UNREADABLE_CONFIG_SHAPES)("when it $shape", ({ shape }) => {
    it.each(CONFIG_READER_NAMES)("refuses '%s', naming this project's config", (name) => {
      expectRefusalNamingTheProjectConfig(runOf(brokenBy(shape).runs, name));
    });

    it.each(TERMINAL_CONFIG_READERS)(
      "refuses '%s' in a terminal, naming this project's config",
      (name) => {
        expectRefusalNamingTheProjectConfig(brokenBy(shape).terminal[name]);
      },
    );

    it("answers no search out of a marketplace read past the unreadable config", () => {
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
      expect(stdout).toContain(`~/${path.relative(env.fakeHome, projectConfig)}`);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
      expect(stdout, "doctor reports the fault rather than stopping on it").toContain(
        STEP_TEXT.DOCTOR_SUMMARY,
      );
    });
  });

  it("is removed by uninstall in the project, which still works on it", async () => {
    expect(uninstall.exitCode, uninstall.output).toBe(EXIT_CODES.SUCCESS);
    const said = flattenCliOutput(uninstall.output);
    expect(said, "the warning names the config it could not read: this project's").toContain(
      STEP_TEXT.UNINSTALL_PROJECT_CONFIG_UNREADABLE,
    );
    expect(said).not.toContain(STEP_TEXT.UNINSTALL_GLOBAL_CONFIG_UNREADABLE);
    expect(uninstall.output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
    await expectCleanUninstall(env.projectDir, { removeConfig: true });
  });

  it("leaves the global installation's skills and compiled agents alone when it does", () => {
    expect(Object.keys(globalClaudeBefore).length, "the global tree holds content").toBeGreaterThan(
      0,
    );
    expect(globalClaudeAfter).toStrictEqual(globalClaudeBefore);
  });
});

/**
 * Both configs a project reads broken at once: its own, and the global one it inherits. The
 * refusal names each, with the folder its own way out is run from — naming only the first sends
 * the user round twice: recreate the project, run again, and only then learn of the global one.
 */
describe("a real project whose own config.ts and the global one both cannot be loaded", () => {
  let env: DualScopeEnv;
  const refusals = new Map<string, CLIResult>();

  /** One command that writes and one that only reads, each refused at the same guard. */
  const COMMANDS = ["compile", "list"] as const;

  beforeAll(async () => {
    env = await createDualScopeEnv(E2E_SOURCE);
    await writeCorruptConfig(env.projectDir, EMPTY_CONFIG_FILE);
    await writeCorruptConfig(env.fakeHome, EMPTY_CONFIG_FILE);

    for (const command of COMMANDS) {
      refusals.set(
        command,
        await CLI.run([command], { dir: env.projectDir }, { env: { HOME: env.fakeHome } }),
      );
    }
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await env.destroy();
  });

  it.each(COMMANDS)(
    "refuses '%s', naming both configs and the folder each is recreated from",
    (command) => {
      const refusal = refusals.get(command);
      if (!refusal) throw new Error(`nothing was recorded for '${command}'`);
      expect(refusal.exitCode, refusal.output).toBe(EXIT_CODES.ERROR);

      // Compacted, both sides, for the reason the describes above give.
      const compacted = compactCliOutput(refusal.output);
      expect(compacted, "this project's config, by its path").toContain(
        compactCliOutput(
          `${STEP_TEXT.CONFIG_UNREADABLE_PROJECT} '${configTsPath(env.projectDir)}'`,
        ),
      );
      expect(compacted, "recreated from this project").toContain(
        compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_RECREATE_FROM} '${env.projectDir}'`),
      );
      expect(compacted, "and the global one, by its path").toContain(
        compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_GLOBAL} '${configTsPath(env.fakeHome)}'`),
      );
      expect(compacted, "recreated from the home directory").toContain(
        compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_RECREATE_FROM} '${env.fakeHome}'`),
      );
    },
  );
});

describe("the same project with both configs readable", () => {
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
