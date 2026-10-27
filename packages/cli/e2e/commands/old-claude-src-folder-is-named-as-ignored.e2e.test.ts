import path from "path";
import { mkdir, rm } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { expectOnlySourceFolder } from "../assertions/source-folder-assertions.js";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import { runInitFromOnClaude, runInitFromOnCodex } from "../fixtures/codex-install.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  cliVersionUnderTest,
  createTempDir,
  directoryExists,
  flattenCliOutput,
  readCompiledAgents,
  readInstallTree,
  readTestFile,
  readTreeSnapshot,
  writeRetiredSourceFolder,
  type InstallTree,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import {
  DIRS,
  EXIT_CODES,
  FILES,
  HOME_SHORTHAND,
  STEP_TEXT,
  TIMEOUTS,
  oldSourceFolderIgnored,
} from "../pages/constants.js";
import type { Provider } from "../../src/cli/consts.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * CLI-931, owner 2026-10-24 (replacing 2026-10-23's "disregard old .claude-src folders"): every run
 * prints one line per root holding an old `.claude-src/`, HOME's first, saying it is ignored and
 * naming the folder agents-inc reads there, with or without an installation beside it. HOME is
 * written `~`, the project by its absolute path. The folder is left untouched, and the run is
 * otherwise the run without it.
 *
 * CLI-965, the same ruling ("name where it reads"): in a root holding a Codex installation agents-inc
 * reads `.agents-inc/codex/`, so that root's line names it. Those Codex roots hold no Claude folder.
 * CLI-967, the same ruling: on the `init --from --provider codex` run that creates that installation
 * in roots holding none, agents-inc reads `.agents-inc/codex/` there already, so that run's lines
 * name it; a bare `init --from` beside it names Claude's.
 * CLI-977, owner 2026-10-24 ("Follow the project's tool"): on a run naming no provider, HOME's line
 * names the folder in HOME for the project's tool, the one this run reads there, even where HOME
 * holds both installations.
 *
 * Each spec runs one command over one installation twice, without the old folder and then with it.
 * The second run's stderr must be the line(s) and then the first run's stderr, whole, so a line
 * printed twice, in the other order or anywhere but first fails it; stdout and the exit code must
 * be the first run's. The first run is the positive subject guard (it did the command's own work)
 * and the control (it names no old folder). The line is asserted last, so a red on it says every
 * assertion before it held.
 *
 * The "left as they were" assertions are green before the fix too, since no release ever wrote into
 * the old folder; they were checked by mutating the fixture (a write into the old folder after the
 * snapshot), which reddens them and nothing else.
 */

type Roots = { project: string; home: string };

type Trees = Record<keyof Roots, Record<string, TreeSnapshotEntry>>;

describe("an old .claude-src folder, in the project or in HOME", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  /** A Claude installation in HOME and in the project, each with skills and sub-agents. */
  async function installedInBoth(): Promise<Roots> {
    const { project, globalHome } = await ProjectBuilder.dualScope();
    tempDir = path.dirname(project.dir);
    return { project: project.dir, home: globalHome.dir };
  }

  /** A project and a HOME holding no installation. */
  async function installedInNeither(): Promise<Roots> {
    tempDir = await createTempDir();
    const roots = { project: path.join(tempDir, "project"), home: path.join(tempDir, "home") };
    await mkdir(roots.project, { recursive: true });
    await mkdir(roots.home, { recursive: true });
    return roots;
  }

  function run(args: string[], { project, home }: Roots): Promise<CLIResult> {
    return CLI.run(args, { dir: project, globalHome: home });
  }

  async function treesOf({ project, home }: Roots): Promise<Trees> {
    return { project: await readTreeSnapshot(project), home: await readTreeSnapshot(home) };
  }

  async function oldFoldersOf({ project, home }: Roots): Promise<Trees> {
    return {
      project: await readTreeSnapshot(path.join(project, DIRS.RETIRED_SOURCE)),
      home: await readTreeSnapshot(path.join(home, DIRS.RETIRED_SOURCE)),
    };
  }

  /** Bytes only, the old folder aside: compile rewrites `config-types.ts` unchanged on every run. */
  async function contentOf({ project, home }: Roots): Promise<Record<keyof Roots, InstallTree>> {
    const skip = [DIRS.RETIRED_SOURCE];
    return {
      project: await readInstallTree(project, { skip }),
      home: await readInstallTree(home, { skip }),
    };
  }

  /** The output half of the ruling: the lines first on stderr, and the rest the run without. */
  function expectOnlyTheLines(
    without: CLIResult,
    withOld: CLIResult,
    lines: readonly string[],
  ): void {
    // execa strips one final newline, so where the run writes nothing else there, the last line ends it.
    const restOfStderr = without.stderr === "" ? [] : [without.stderr];

    expect(without.output, "a run with no old folder names none").not.toContain(
      DIRS.RETIRED_SOURCE,
    );
    expect(withOld.stdout, "stdout is what it is without the old folder").toBe(without.stdout);
    expect(withOld.exitCode, "the exit code is what it is without the old folder").toBe(
      without.exitCode,
    );
    expect(
      withOld.stderr,
      "stderr opens with one line per root holding the old folder, HOME's first, then is what it is without it",
    ).toBe([...lines, ...restOfStderr].join("\n"));
  }

  /** Nothing on disk moved, then the output half. */
  async function expectNamedAsIgnored(
    roots: Roots,
    before: Trees,
    without: CLIResult,
    withOld: CLIResult,
    lines: readonly string[],
  ): Promise<void> {
    expect(
      await readTreeSnapshot(roots.project),
      "the project, its old folder included, is left as it was",
    ).toStrictEqual(before.project);
    expect(
      await readTreeSnapshot(roots.home),
      "HOME, its old folder included, is left as it was",
    ).toStrictEqual(before.home);
    expectOnlyTheLines(without, withOld, lines);
  }

  async function withoutThenWith(
    args: string[],
    roots: Roots,
    oldFolderRoots: readonly string[],
  ): Promise<{ without: CLIResult; withOld: CLIResult; before: Trees }> {
    const without = await run(args, roots);
    for (const root of oldFolderRoots) await writeRetiredSourceFolder(root);
    const before = await treesOf(roots);
    const withOld = await run(args, roots);
    return { without, withOld, before };
  }

  it("is named as ignored by a named command, HOME's line first, when both hold one beside their installation", async () => {
    const roots = await installedInBoth();

    // The project's folder is written first, so HOME's line leading is not the order of creation.
    const { without, withOld, before } = await withoutThenWith(["list"], roots, [
      roots.project,
      roots.home,
    ]);

    expect(without.exitCode, without.output).toBe(EXIT_CODES.SUCCESS);
    await expectNamedAsIgnored(roots, before, without, withOld, [
      oldSourceFolderIgnored(HOME_SHORTHAND, DIRS.SOURCE_CLAUDE),
      oldSourceFolderIgnored(roots.project, DIRS.SOURCE_CLAUDE),
    ]);
  });

  it("is named for HOME alone when only HOME holds one", async () => {
    const roots = await installedInBoth();

    const { without, withOld, before } = await withoutThenWith(["list"], roots, [roots.home]);

    expect(without.exitCode, without.output).toBe(EXIT_CODES.SUCCESS);
    await expectNamedAsIgnored(roots, before, without, withOld, [
      oldSourceFolderIgnored(HOME_SHORTHAND, DIRS.SOURCE_CLAUDE),
    ]);
  });

  it("is named for the project alone, by its path, when only the project holds one", async () => {
    const roots = await installedInBoth();

    const { without, withOld, before } = await withoutThenWith(["list"], roots, [roots.project]);

    expect(without.exitCode, without.output).toBe(EXIT_CODES.SUCCESS);
    await expectNamedAsIgnored(roots, before, without, withOld, [
      oldSourceFolderIgnored(roots.project, DIRS.SOURCE_CLAUDE),
    ]);
  });

  it("is named as ignored ahead of --version, which is otherwise unchanged", async () => {
    const roots = await installedInBoth();

    const { without, withOld, before } = await withoutThenWith(["--version"], roots, [
      roots.home,
      roots.project,
    ]);

    expect(without.stdout).toContain(await cliVersionUnderTest());
    await expectNamedAsIgnored(roots, before, without, withOld, [
      oldSourceFolderIgnored(HOME_SHORTHAND, DIRS.SOURCE_CLAUDE),
      oldSourceFolderIgnored(roots.project, DIRS.SOURCE_CLAUDE),
    ]);
  });

  it("is named as ignored ahead of --help, which is otherwise unchanged", async () => {
    const roots = await installedInBoth();

    const { without, withOld, before } = await withoutThenWith(["--help"], roots, [
      roots.home,
      roots.project,
    ]);

    expect(without.stdout).toContain(STEP_TEXT.ROOT_HELP_USAGE);
    await expectNamedAsIgnored(roots, before, without, withOld, [
      oldSourceFolderIgnored(HOME_SHORTHAND, DIRS.SOURCE_CLAUDE),
      oldSourceFolderIgnored(roots.project, DIRS.SOURCE_CLAUDE),
    ]);
  });

  it("is named as ignored ahead of the installation's dashboard on a run naming no command", async () => {
    const roots = await installedInBoth();

    const { without, withOld, before } = await withoutThenWith([], roots, [
      roots.home,
      roots.project,
    ]);

    expect(without.exitCode, without.output).toBe(EXIT_CODES.SUCCESS);
    expect(without.stdout).toContain(STEP_TEXT.DASHBOARD);
    await expectNamedAsIgnored(roots, before, without, withOld, [
      oldSourceFolderIgnored(HOME_SHORTHAND, DIRS.SOURCE_CLAUDE),
      oldSourceFolderIgnored(roots.project, DIRS.SOURCE_CLAUDE),
    ]);
  });

  it("is named, and not read, where it is all there is: a run naming no command prints the root help, as with nothing there", async () => {
    const roots = await installedInNeither();

    const { without, withOld, before } = await withoutThenWith([], roots, [
      roots.home,
      roots.project,
    ]);

    expect(without.stdout).toContain(STEP_TEXT.ROOT_HELP_USAGE);
    await expectNamedAsIgnored(roots, before, without, withOld, [
      oldSourceFolderIgnored(HOME_SHORTHAND, DIRS.SOURCE_CLAUDE),
      oldSourceFolderIgnored(roots.project, DIRS.SOURCE_CLAUDE),
    ]);
  });

  it("is named, and not read, where it is all there is: list finds no installation, as with nothing there", async () => {
    const roots = await installedInNeither();

    const { without, withOld, before } = await withoutThenWith(["list"], roots, [
      roots.home,
      roots.project,
    ]);

    expect(without.stdout).toContain(STEP_TEXT.NO_INSTALLATION);
    await expectNamedAsIgnored(roots, before, without, withOld, [
      oldSourceFolderIgnored(HOME_SHORTHAND, DIRS.SOURCE_CLAUDE),
      oldSourceFolderIgnored(roots.project, DIRS.SOURCE_CLAUDE),
    ]);
  });

  it("is named as ignored ahead of compile, which leaves both roots as it leaves them without one", async () => {
    const roots = await installedInBoth();
    // The first compile writes the sub-agents, so the two runs compared are both recompiles.
    const first = await run(["compile"], roots);
    expect(first.exitCode, first.output).toBe(EXIT_CODES.SUCCESS);
    const without = await run(["compile"], roots);
    const compiledWithout = await readCompiledAgents(roots.project);
    const leftWithout = await contentOf(roots);
    await writeRetiredSourceFolder(roots.home);
    await writeRetiredSourceFolder(roots.project);
    const oldFoldersBefore = await oldFoldersOf(roots);

    const withOld = await run(["compile"], roots);

    expect(without.exitCode, without.output).toBe(EXIT_CODES.SUCCESS);
    expect(compiledWithout, "the project compiled sub-agents").not.toStrictEqual({});
    expect(await oldFoldersOf(roots), "both old folders are left as they were").toStrictEqual(
      oldFoldersBefore,
    );
    expect(
      await contentOf(roots),
      "both roots, config pairs and sub-agents included, hold what compile leaves without the old folder",
    ).toStrictEqual(leftWithout);
    expectOnlyTheLines(without, withOld, [
      oldSourceFolderIgnored(HOME_SHORTHAND, DIRS.SOURCE_CLAUDE),
      oldSourceFolderIgnored(roots.project, DIRS.SOURCE_CLAUDE),
    ]);
  });

  describe("beside a Codex installation", () => {
    let store: SeedConfigStore;

    beforeAll(async () => {
      store = await startSeedConfigStore();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await store.close();
    });

    afterEach(() => {
      store.reset();
    });

    const PAYLOAD_ID = "OldCdxBo";

    /** A configuration with a global half, for HOME, and a project half, for the project. */
    function publishOneInEachRoot(): void {
      const webDeveloper = E2E_AGENT["web-developer"].name;
      const apiDeveloper = E2E_AGENT["api-developer"].name;
      store.publish(
        PAYLOAD_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "eject",
              scope: "global",
              assignments: { [webDeveloper]: "lazy" },
            }),
            [E2E_SKILL.hono.id]: buildSeedSkill({
              install: "eject",
              scope: "project",
              assignments: { [apiDeveloper]: "lazy" },
            }),
          },
          agents: { [webDeveloper]: { scope: "global" }, [apiDeveloper]: { scope: "project" } },
        }),
      );
    }

    /** One `init --from --provider codex` in the project, whose global half lands in HOME. */
    async function installedOnCodexInBoth(): Promise<Roots> {
      const roots = await installedInNeither();
      publishOneInEachRoot();
      const installed = await runInitFromOnCodex(
        store,
        PAYLOAD_ID,
        { dir: roots.project, globalHome: roots.home },
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);

      // Subject guards: each root's installation is on the Codex folder, and neither holds a Claude one.
      expect(
        await readTestFile(path.join(roots.home, DIRS.SOURCE_CODEX, FILES.CONFIG_TS)),
        "HOME's installation is on the Codex folder",
      ).toContain(E2E_SKILL.react.id);
      expect(
        await readTestFile(path.join(roots.project, DIRS.SOURCE_CODEX, FILES.CONFIG_TS)),
        "the project's installation is on the Codex folder",
      ).toContain(E2E_SKILL.hono.id);
      await expectOnlySourceFolder(roots.home, [DIRS.SOURCE_ROOT], "HOME holds no Claude folder");
      await expectOnlySourceFolder(
        roots.project,
        [DIRS.SOURCE_ROOT],
        "the project holds no Claude folder",
      );
      return roots;
    }

    it(
      "is named in each root by the Codex folder agents-inc reads there, HOME's line first, ahead of a named command that is otherwise unchanged",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const roots = await installedOnCodexInBoth();

        const { without, withOld, before } = await withoutThenWith(["list"], roots, [
          roots.project,
          roots.home,
        ]);

        expect(without.exitCode, without.output).toBe(EXIT_CODES.SUCCESS);
        expect(without.stdout, "list read the project's Codex installation").toContain(
          path.join(roots.project, DIRS.SOURCE_CODEX, FILES.CONFIG_TS),
        );
        await expectNamedAsIgnored(roots, before, without, withOld, [
          oldSourceFolderIgnored(HOME_SHORTHAND, DIRS.SOURCE_CODEX),
          oldSourceFolderIgnored(roots.project, DIRS.SOURCE_CODEX),
        ]);
      },
    );

    /**
     * A project on each tool under one HOME, installed as a user would: the Claude project's
     * `init --from` installs HOME on Claude, and the Codex project's then installs HOME on Codex
     * beside it.
     */
    async function aProjectOnEachToolUnderOneHome(): Promise<Record<Provider, Roots>> {
      const claude = await installedInNeither();
      const codex = {
        project: path.join(path.dirname(claude.project), "codex-project"),
        home: claude.home,
      };
      await mkdir(codex.project);
      publishOneInEachRoot();
      const onClaude = await runInitFromOnClaude(
        store,
        PAYLOAD_ID,
        { dir: claude.project, globalHome: claude.home },
        E2E_SOURCE.sourceDir,
      );
      expect(onClaude.exitCode, flattenCliOutput(onClaude.output)).toBe(EXIT_CODES.SUCCESS);
      const onCodex = await runInitFromOnCodex(
        store,
        PAYLOAD_ID,
        { dir: codex.project, globalHome: codex.home },
        E2E_SOURCE.sourceDir,
      );
      expect(onCodex.exitCode, flattenCliOutput(onCodex.output)).toBe(EXIT_CODES.SUCCESS);

      // Subject guards: HOME holds both installations, and each project its own tool's alone.
      for (const folder of [DIRS.SOURCE_CLAUDE, DIRS.SOURCE_CODEX]) {
        expect(
          await readTestFile(path.join(claude.home, folder, FILES.CONFIG_TS)),
          `HOME holds an installation on ${folder}`,
        ).toContain(E2E_SKILL.react.id);
      }
      expect(
        await readTestFile(path.join(claude.project, DIRS.SOURCE_CLAUDE, FILES.CONFIG_TS)),
        "the Claude project's installation is on the Claude folder",
      ).toContain(E2E_SKILL.hono.id);
      expect(
        await directoryExists(path.join(claude.project, DIRS.SOURCE_CODEX)),
        "the Claude project holds no Codex folder",
      ).toBe(false);
      expect(
        await readTestFile(path.join(codex.project, DIRS.SOURCE_CODEX, FILES.CONFIG_TS)),
        "the Codex project's installation is on the Codex folder",
      ).toContain(E2E_SKILL.hono.id);
      await expectOnlySourceFolder(
        codex.project,
        [DIRS.SOURCE_ROOT],
        "the Codex project holds no Claude folder",
      );
      return { claude, codex };
    }

    it.each([
      { tool: "Codex", provider: "codex", readFrom: DIRS.SOURCE_CODEX },
      { tool: "Claude", provider: "claude", readFrom: DIRS.SOURCE_CLAUDE },
    ] as const)(
      "is named in HOME, holding both installations, by the folder for a $tool project's tool, and in the project by its own, ahead of a named command that is otherwise unchanged",
      { timeout: TIMEOUTS.LIFECYCLE },
      async ({ provider, readFrom }) => {
        const roots = (await aProjectOnEachToolUnderOneHome())[provider];

        const { without, withOld, before } = await withoutThenWith(["list"], roots, [
          roots.project,
          roots.home,
        ]);

        expect(without.exitCode, without.output).toBe(EXIT_CODES.SUCCESS);
        expect(without.stdout, "list read the project's own installation").toContain(
          path.join(roots.project, readFrom, FILES.CONFIG_TS),
        );
        await expectNamedAsIgnored(roots, before, without, withOld, [
          oldSourceFolderIgnored(HOME_SHORTHAND, readFrom),
          oldSourceFolderIgnored(roots.project, readFrom),
        ]);
      },
    );

    /** The roots at the same paths, holding nothing again, so a second install prints what the first did. */
    async function emptied({ project, home }: Roots): Promise<void> {
      for (const root of [project, home]) {
        await rm(root, { recursive: true, force: true });
        await mkdir(root, { recursive: true });
      }
    }

    it.each([
      {
        naming: "codex",
        install: runInitFromOnCodex,
        readFrom: DIRS.SOURCE_CODEX,
        sourceFolders: [DIRS.SOURCE_ROOT],
      },
      {
        naming: "no provider",
        install: runInitFromOnClaude,
        readFrom: DIRS.SOURCE_CLAUDE,
        sourceFolders: [DIRS.SOURCE_ROOT, DIRS.SOURCE_CLAUDE],
      },
    ] as const)(
      "is named in each root by the folder the init --from run naming $naming creates there, on that very run, HOME's line first",
      { timeout: TIMEOUTS.LIFECYCLE },
      async ({ install, readFrom, sourceFolders }) => {
        const roots = await installedInNeither();
        publishOneInEachRoot();
        const installInBoth = () =>
          install(
            store,
            PAYLOAD_ID,
            { dir: roots.project, globalHome: roots.home },
            E2E_SOURCE.sourceDir,
          );

        const without = await installInBoth();
        await emptied(roots);
        await writeRetiredSourceFolder(roots.home);
        await writeRetiredSourceFolder(roots.project);
        const oldFoldersBefore = await oldFoldersOf(roots);
        const withOld = await installInBoth();

        expect(without.exitCode, without.output).toBe(EXIT_CODES.SUCCESS);
        expect(
          await readTestFile(path.join(roots.home, readFrom, FILES.CONFIG_TS)),
          "subject guard: HOME's installation is on the folder the run creates",
        ).toContain(E2E_SKILL.react.id);
        expect(
          await readTestFile(path.join(roots.project, readFrom, FILES.CONFIG_TS)),
          "subject guard: the project's installation is on the folder the run creates",
        ).toContain(E2E_SKILL.hono.id);
        await expectOnlySourceFolder(roots.home, sourceFolders, "HOME holds no other folder");
        await expectOnlySourceFolder(
          roots.project,
          sourceFolders,
          "the project holds no other folder",
        );
        expect(await oldFoldersOf(roots), "both old folders are left as they were").toStrictEqual(
          oldFoldersBefore,
        );
        expectOnlyTheLines(without, withOld, [
          oldSourceFolderIgnored(HOME_SHORTHAND, readFrom),
          oldSourceFolderIgnored(roots.project, readFrom),
        ]);
      },
    );
  });
});
