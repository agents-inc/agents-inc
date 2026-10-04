import { cp, mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  expectNoSourceFolder,
  expectOnlySourceFolder,
} from "../assertions/source-folder-assertions.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import { CLI } from "../fixtures/cli.js";
import {
  createDualScopeEnv,
  createTestEnvironment,
  initGlobalWithEject,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  createTempDir,
  fileExists,
  readTestFile,
  readTreeSnapshot,
  writeConfigTypes,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

/**
 * `uninstall` over a scope holding BOTH source folders removes the installation under both names
 * in one run — journey 52's exception, driven from a real installation.
 *
 * Every other write command refuses this state, because with two folders on disk the resolver
 * reads whichever holds a `config.ts` and that can be the stale one. `uninstall` is how a user
 * gets out of any state, this one included, so it never refuses: it takes the CLI's files out of
 * both folders, keeps what the user made themselves, and leaves nothing a later command reads as
 * an installation. Against the unfixed binary it removed only the folder being read, reported the
 * uninstall done, and `list` went on reporting the installation out of the other one.
 *
 * Both ways into the state are a copy of the live folder under the other name — what a compiled
 * `agent-summoner` authoring into the layout it was compiled under amounts to, and what a user
 * moving folders by hand leaves behind. The copy is the only hand-made step; the installation it
 * copies is a real wizard run.
 *
 * The last case is the terminal-size wait every command takes before it starts. A small terminal
 * is a wizard's problem, not an uninstall's, and `uninstall --yes` draws nothing that needs room.
 */

/** What a summoner compiled under the other layout writes there — the user's, not the CLI's. */
const AUTHORED_BY_THE_SUMMONER = path.join("agents", "summoned-agent", "identity.md");
const AUTHORED_BY_THE_SUMMONER_BODY = "You are an agent a summoner wrote into the other folder.\n";

/** Copies `dir`'s live source folder under the legacy name, so both hold the same installation. */
async function copyUnderTheOtherName(dir: string): Promise<void> {
  await cp(path.join(dir, DIRS.SOURCE_CLAUDE), path.join(dir, DIRS.CLAUDE_SRC), {
    recursive: true,
  });
  for (const folder of [DIRS.SOURCE_CLAUDE, DIRS.CLAUDE_SRC]) {
    expect(
      await fileExists(path.join(dir, folder, FILES.CONFIG_TS)),
      `the state under test holds a config under ${folder}/`,
    ).toBe(true);
  }
}

describe("uninstall over a scope holding both source folders", () => {
  let tempDir: string | undefined;
  let env: DualScopeEnv | undefined;
  let prompt: InteractivePrompt | undefined;

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    await env?.destroy();
    env = undefined;
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  /** A real global installation from the wizard, its source folder copied under the other name. */
  async function globalInstallationUnderBothNames(): Promise<string> {
    const testEnv = await createTestEnvironment();
    tempDir = testEnv.tempDir;
    const install = await initGlobalWithEject(E2E_SOURCE, testEnv.fakeHome);
    expect(install.exitCode, `global init failed:\n${install.output}`).toBe(EXIT_CODES.SUCCESS);
    await copyUnderTheOtherName(testEnv.fakeHome);
    return testEnv.fakeHome;
  }

  it(
    "removes a global installation under both names, and list then finds none",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const fakeHome = await globalInstallationUnderBothNames();

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: fakeHome },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output, "uninstall is the one write this state does not stop").not.toContain(
        STEP_TEXT.WRITE_REFUSED_RIVAL_FOLDERS,
      );
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
      await expectCleanUninstall(fakeHome, { removeConfig: true });

      const list = await CLI.run(["list"], { dir: fakeHome }, { env: { HOME: fakeHome } });
      expect(
        list.stdout,
        "a folder left behind is read as the installation this run reported gone",
      ).toContain(STEP_TEXT.NO_INSTALLATION);
    },
  );

  it(
    "removes both even when the copy not being read cannot be loaded",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const fakeHome = await globalInstallationUnderBothNames();
      await writeFile(
        path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
        renderUnparseableConfigTs(),
      );

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: fakeHome },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
      await expectCleanUninstall(fakeHome, { removeConfig: true });
    },
  );

  it(
    "removes a project's installation under both names, keeps what the user wrote there, and leaves the global one alone",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(E2E_SOURCE);
      const { fakeHome, projectDir } = env;
      await copyUnderTheOtherName(projectDir);
      const authored = path.join(projectDir, DIRS.CLAUDE_SRC, AUTHORED_BY_THE_SUMMONER);
      await mkdir(path.dirname(authored), { recursive: true });
      await writeFile(authored, AUTHORED_BY_THE_SUMMONER_BODY);
      const globalClaude = path.join(fakeHome, DIRS.CLAUDE);
      const globalBefore = await readTreeSnapshot(globalClaude);

      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).not.toContain(STEP_TEXT.WRITE_REFUSED_RIVAL_FOLDERS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
      for (const folder of [DIRS.SOURCE_CLAUDE, DIRS.CLAUDE_SRC]) {
        for (const file of [FILES.CONFIG_TS, FILES.CONFIG_TYPES_TS]) {
          expect(
            await fileExists(path.join(projectDir, folder, file)),
            `uninstall left the CLI's ${file} under ${folder}/`,
          ).toBe(false);
        }
      }
      expect(
        await readTestFile(authored),
        "a sub-agent the user wrote is not this CLI's to remove, whichever folder it is in",
      ).toBe(AUTHORED_BY_THE_SUMMONER_BODY);
      await expectOnlySourceFolder(
        projectDir,
        [DIRS.CLAUDE_SRC],
        "only the folder holding the user's own file is left, and nothing of the CLI's in it",
      );
      await expectCleanUninstall(projectDir);

      expect(
        Object.keys(globalBefore).length,
        "the global installation holds content",
      ).toBeGreaterThan(0);
      expect(
        await readTreeSnapshot(globalClaude),
        "a project uninstall leaves the global installation's skills and compiled agents alone",
      ).toStrictEqual(globalBefore);

      const list = await CLI.run(["list"], { dir: projectDir }, { env: { HOME: fakeHome } });
      expect(list.stdout, "the project inherits the global installation").toContain(
        configTsPath(fakeHome),
      );
      expect(
        list.stdout,
        "and reports no installation of its own out of a folder left behind",
      ).not.toContain(path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS));
    },
  );

  it(
    "does not wait for a bigger terminal before it starts",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const home = path.join(tempDir, "home");
      await writeProjectConfig(
        home,
        buildProjectConfig({ name: "small-terminal-uninstall", skills: [], agents: [] }),
      );
      await writeConfigTypes(home);

      prompt = new InteractivePrompt(["uninstall", "--yes"], home, {
        ...TERMINAL_SIZE.BELOW_MINIMUM,
        env: { HOME: home },
      });
      // A run held at the size gate never exits, so the wait is bounded and its timeout read as
      // the answer rather than thrown: the assertion below says why the run did not finish.
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT).catch(() => undefined);
      const output = prompt.getRawOutput();

      expect(output, "uninstall stopped to ask for a bigger terminal").not.toContain(
        STEP_TEXT.RESIZE_PROMPT,
      );
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      await expectNoSourceFolder(home, "uninstall removed the config it was asked to remove");
    },
  );
});
