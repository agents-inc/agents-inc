import path from "path";
import { chmod, mkdir, realpath } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import "../matchers/setup.js";
import {
  claudeConfigDir,
  cleanupFixture,
  cleanupTempDir,
  compactCliOutput,
  configTsPath,
  execCommand,
  isClaudeCLIAvailable,
  listFiles,
  loadConfigOrFail,
  readInstallTree,
  readTreeSnapshot,
  skillsPath,
  type InstallTree,
} from "../helpers/test-utils.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  createTestEnvironment,
  homeAndProjectTrees,
  type HomeAndProjectTrees,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  CLAUDE_FILES_LEFT_EMPTY,
  claudeFilesLeftEmptyByClaude,
  claudeFilesPresent,
  claudeHomeEntriesPresent,
  claudeHomeLeftByClaude,
  holdClaudeFilesLeftEmpty,
  holdAPluginRegistryTheCliCannotRead,
  holdClaudeHomeLeftEmpty,
  holdPluginsForTheUser,
  pluginKeyFor,
  readMarketplaceRegistrations,
  readPluginRegistrations,
  registerMarketplaceForTheUser,
  type ClaudeFileLeftEmpty,
  type ClaudeFilesPresent,
  type ClaudeHomeEntriesPresent,
  type ClaudeHomeEntryLeftEmpty,
} from "../fixtures/plugin-install-state.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import type { CLIResult } from "../fixtures/cli.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfig } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { useClaudeStub } from "../../src/cli/lib/__tests__/helpers/claude-stub.js";

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const REACT = E2E_SKILL.react.id;
const HONO = E2E_SKILL.hono.id;
const VITEST = E2E_SKILL.vitest.id;

const READ_ONLY_DIR = 0o555;
const WRITABLE_DIR = 0o755;
const READ_ONLY_FILE = 0o444;
const WRITABLE_FILE = 0o644;

const SEED_ID = "Refused01";
const GLOBAL_SEED_ID = "Refused02";

const COPIED = 2;

const claudeAvailable = await isClaudeCLIAvailable();

const ejected = (scope: "project" | "global", agent: string) =>
  buildSeedSkill({ install: "eject", scope, assignments: { [agent]: "lazy" } });
const plugin = (scope: "project" | "global", agent: string) =>
  buildSeedSkill({ install: "plugin", scope, assignments: { [agent]: "lazy" } });

const reactAndHonoPlugin = (honoScope: "project" | "global"): SeedPayload =>
  buildSeedPayload({
    skills: { [REACT]: ejected("project", WEB_DEV), [HONO]: plugin(honoScope, API_DEV) },
    agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: honoScope } },
  });

const twoCopiesAndAProjectHonoPlugin = (): SeedPayload =>
  buildSeedPayload({
    skills: {
      [REACT]: ejected("project", WEB_DEV),
      [VITEST]: ejected("project", API_DEV),
      [HONO]: plugin("project", API_DEV),
    },
    agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: "project" } },
  });

const globalReactAndProjectHonoPlugin = (): SeedPayload =>
  buildSeedPayload({
    skills: { [REACT]: ejected("global", WEB_DEV), [HONO]: plugin("project", API_DEV) },
    agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "project" } },
  });

type RefusedRun = { run: CLIResult; before: HomeAndProjectTrees };

const noneOfThem: ClaudeFilesPresent = {
  projectSettings: false,
  userSettings: false,
  knownMarketplaces: false,
};

/** The empty registry and folder gone; what holds Claude's own state stays. */
const onlyClaudesOwnState: ClaudeHomeEntriesPresent = {
  pluginRegistry: false,
  marketplacesFolder: false,
  stateFile: true,
  stateBackups: true,
  pluginCache: true,
};

const CLAUDE_HOME_LEFT_EMPTY: { held: ClaudeHomeEntryLeftEmpty; named: string }[] = [
  { held: "pluginRegistry", named: "plugin registry holding no plugin" },
  { held: "marketplacesFolder", named: "empty marketplaces folder" },
];

const keepingAlso = (held: ClaudeHomeEntryLeftEmpty): ClaudeHomeEntriesPresent => ({
  ...onlyClaudesOwnState,
  [held]: true,
});

const copiesRemoved = (count: number) =>
  `${STEP_TEXT.COPIES_REMOVED_PREFIX} ${count} ${STEP_TEXT.COPIES_REMOVED_SUFFIX}`;
const marketplaceRemoved = (marketplace: string) =>
  `${STEP_TEXT.MARKETPLACE_REMOVED_PREFIX} "${marketplace}" ${STEP_TEXT.MARKETPLACE_REMOVED_SUFFIX}`;
const pluginKept = (pluginRef: string) =>
  `${STEP_TEXT.PLUGIN_KEPT_PREFIX} "${pluginRef}" ${STEP_TEXT.PLUGIN_KEPT_SUFFIX}`;

/** The project's config folder made read-only around `run`, so the save is refused. */
async function withTheConfigFolderReadOnly<T>(
  projectDir: string,
  run: () => Promise<T>,
): Promise<T> {
  const sourceFolder = path.join(projectDir, DIRS.SOURCE_CLAUDE);
  await mkdir(sourceFolder, { recursive: true });
  await chmod(sourceFolder, READ_ONLY_DIR);
  try {
    return await run();
  } finally {
    await chmod(sourceFolder, WRITABLE_DIR);
  }
}

// Root writes through the mode bits, so a refused save cannot happen there.
describe.skipIf(process.getuid?.() === 0)(
  "init --from <id>: a refused save takes back its plugins",
  () => {
    const claude = useClaudeStub();
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let env: TestEnvironment | undefined;

    beforeAll(async () => {
      fixture = await createE2EPluginSource();
      store = await startSeedConfigStore();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await store.close();
      await cleanupFixture(fixture);
    });

    afterEach(async () => {
      store.reset();
      if (env) await cleanupTempDir(env.tempDir);
      env = undefined;
    });

    const ref = (skillId: string) => pluginKeyFor(skillId, fixture.marketplaceName);
    const marketplaceAdded = () => `plugin marketplace add ${fixture.sourceDir}`;
    const marketplaceRefreshed = () => `plugin marketplace update ${fixture.marketplaceName}`;
    const marketplaceTakenBack = () => `plugin marketplace remove ${fixture.marketplaceName}`;
    const installed = (skillId: string, scope: "project" | "user") =>
      `plugin install ${ref(skillId)} --scope ${scope}`;
    const uninstalled = (skillId: string, scope: "project" | "user") =>
      `plugin uninstall ${ref(skillId)} --scope ${scope}`;

    const claudeHomeOf = (environment: TestEnvironment) =>
      readTreeSnapshot(path.join(environment.fakeHome, DIRS.CLAUDE));

    async function homeSurfaces(environment: TestEnvironment) {
      const [source, claudeHome] = await Promise.all([
        readTreeSnapshot(path.join(environment.fakeHome, DIRS.SOURCE_ROOT)),
        claudeHomeOf(environment),
      ]);
      return { source, claudeHome };
    }

    function initFrom(environment: TestEnvironment, payload: SeedPayload): Promise<CLIResult> {
      store.publish(SEED_ID, payload);
      return runInitFrom(
        store,
        SEED_ID,
        { dir: environment.projectDir, globalHome: environment.fakeHome },
        fixture.sourceDir,
      );
    }

    /** `before` is read once the read-only folder is made, so that folder is not counted as the run's. */
    function initFromUnwritable(
      environment: TestEnvironment,
      payload: SeedPayload,
    ): Promise<RefusedRun> {
      return withTheConfigFolderReadOnly(environment.projectDir, async () => {
        const before = await homeAndProjectTrees(environment);
        return { run: await initFrom(environment, payload), before };
      });
    }

    /** As an earlier `claude plugin marketplace add` leaves it, in both files, and as listed. */
    async function holdTheMarketplaceForTheUser(environment: TestEnvironment): Promise<void> {
      await registerMarketplaceForTheUser(environment.fakeHome, {
        name: fixture.marketplaceName,
        sourceDir: fixture.sourceDir,
      });
      await claude.holdMarketplaces([
        { name: fixture.marketplaceName, source: "directory", path: fixture.sourceDir },
      ]);
    }

    const heldByClaude = () => ({
      known: [fixture.marketplaceName],
      declared: [fixture.marketplaceName],
    });

    const copiedOneSkillTo = (skillsDir: string) =>
      compactCliOutput(
        `${STEP_TEXT.COPIED_LOCAL_SKILLS_PREFIX} 1 ${STEP_TEXT.COPIED_LOCAL_SKILLS_SUFFIX} to ${skillsDir}/`,
      );

    async function initFromWithTheGlobalConfigUnwritable(
      environment: TestEnvironment,
      payload: SeedPayload,
    ): Promise<RefusedRun> {
      const globalConfig = configTsPath(environment.fakeHome);
      await chmod(globalConfig, READ_ONLY_FILE);
      try {
        const before = await homeAndProjectTrees(environment);
        return { run: await initFrom(environment, payload), before };
      } finally {
        await chmod(globalConfig, WRITABLE_FILE);
      }
    }

    function initHonoGloballyFrom(environment: TestEnvironment): Promise<CLIResult> {
      store.publish(
        GLOBAL_SEED_ID,
        buildSeedPayload({
          skills: { [HONO]: plugin("global", API_DEV) },
          agents: { [API_DEV]: { scope: "global" } },
        }),
      );
      return runInitFrom(
        store,
        GLOBAL_SEED_ID,
        { dir: environment.fakeHome, globalHome: environment.fakeHome },
        fixture.sourceDir,
      );
    }

    async function expectARefusedSave(
      environment: TestEnvironment,
      { run, before }: RefusedRun,
      refusedConfig = configTsPath(environment.projectDir),
    ): Promise<void> {
      expect(run.exitCode, run.output).toBe(EXIT_CODES.ERROR);
      expect(compactCliOutput(run.output)).toContain(
        compactCliOutput(`${STEP_TEXT.CONFIG_WRITE_REFUSED} '${refusedConfig}'`),
      );
      expect(
        await homeAndProjectTrees(environment),
        "a refused save leaves the home and the project as they were: no config, no copy, no blank global config and no folder it made",
      ).toStrictEqual(before);
    }

    it(
      "uninstalls the project plugin it installed when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();
        const claudeHomeBefore = await claudeHomeOf(env);

        const refused = await initFromUnwritable(env, reactAndHonoPlugin("project"));

        await expectARefusedSave(env, refused);
        expect(
          await claude.changes(),
          "the plugin this run installed for the project is uninstalled from the project, then the marketplace this run registered is removed",
        ).toStrictEqual([
          marketplaceAdded(),
          installed(HONO, "project"),
          uninstalled(HONO, "project"),
          marketplaceTakenBack(),
        ]);
        expect(await claudeHomeOf(env), "Claude's home is as it was").toStrictEqual(
          claudeHomeBefore,
        );
      },
    );

    it(
      "takes back the skills folder it made at home for a global copy when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();

        const refused = await initFromUnwritable(env, globalReactAndProjectHonoPlugin());

        expect(
          compactCliOutput(refused.run.output),
          "precondition: the run copied React into a skills folder at home before the save",
        ).toContain(copiedOneSkillTo(skillsPath(env.fakeHome)));
        await expectARefusedSave(env, refused);
        expect(
          await claude.changes(),
          "the plugin this run installed for the project is uninstalled from the project, then the marketplace this run registered is removed",
        ).toStrictEqual([
          marketplaceAdded(),
          installed(HONO, "project"),
          uninstalled(HONO, "project"),
          marketplaceTakenBack(),
        ]);
      },
    );

    it(
      "removes the marketplace it registered, and says so after the skills it copied, when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();

        const refused = await initFromUnwritable(env, twoCopiesAndAProjectHonoPlugin());

        await expectARefusedSave(env, refused);
        expect(
          await claude.changes(),
          "the marketplace this run registered is removed once the plugin it installed from it is uninstalled",
        ).toStrictEqual([
          marketplaceAdded(),
          installed(HONO, "project"),
          uninstalled(HONO, "project"),
          marketplaceTakenBack(),
        ]);
        const ending = compactCliOutput(
          [
            STEP_TEXT.GENERATING_CONFIGURATION,
            copiesRemoved(COPIED),
            marketplaceRemoved(fixture.marketplaceName),
          ].join("\n"),
        );
        expect(compactCliOutput(refused.run.stdout).slice(-ending.length), refused.run.stdout).toBe(
          ending,
        );
      },
    );

    it(
      "keeps a marketplace Claude held before the run, and says nothing of it, when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();
        await holdTheMarketplaceForTheUser(env);

        const refused = await initFromUnwritable(env, twoCopiesAndAProjectHonoPlugin());

        await expectARefusedSave(env, refused);
        expect(
          await claude.changes(),
          "a marketplace Claude held is refreshed rather than registered, so the take-back leaves it",
        ).toStrictEqual([
          marketplaceRefreshed(),
          installed(HONO, "project"),
          uninstalled(HONO, "project"),
        ]);
        expect(
          await readMarketplaceRegistrations(env.fakeHome),
          "both of Claude's files still hold the marketplace",
        ).toStrictEqual(heldByClaude());
        const ending = compactCliOutput(
          [STEP_TEXT.GENERATING_CONFIGURATION, copiesRemoved(COPIED)].join("\n"),
        );
        expect(compactCliOutput(refused.run.stdout).slice(-ending.length), refused.run.stdout).toBe(
          ending,
        );
      },
    );

    it(
      "keeps the marketplace when it cannot tell whether Claude held it before the run, and the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();
        await registerMarketplaceForTheUser(env.fakeHome, {
          name: fixture.marketplaceName,
          sourceDir: fixture.sourceDir,
        });
        await claude.failMarketplaceList();

        const refused = await initFromUnwritable(env, twoCopiesAndAProjectHonoPlugin());

        await expectARefusedSave(env, refused);
        expect(
          await claude.changes(),
          "a marketplace not known to be this run's is never removed, as a plugin not known to be is never uninstalled",
        ).not.toContain(marketplaceTakenBack());
        const ending = compactCliOutput(
          [STEP_TEXT.GENERATING_CONFIGURATION, copiesRemoved(COPIED)].join("\n"),
        );
        expect(compactCliOutput(refused.run.stdout).slice(-ending.length), refused.run.stdout).toBe(
          ending,
        );
      },
    );

    it(
      "keeps the marketplace it registered while it keeps a plugin it cannot tell Claude held before the run, and says so of the plugin, when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();
        await holdAPluginRegistryTheCliCannotRead(env.fakeHome);

        const refused = await initFromUnwritable(env, twoCopiesAndAProjectHonoPlugin());

        await expectARefusedSave(env, refused);
        expect(
          await claude.changes(),
          "Claude's `marketplace remove` uninstalls the marketplace's plugins, so the marketplace stays while the plugin is kept",
        ).toStrictEqual([marketplaceAdded(), installed(HONO, "project")]);
        const ending = compactCliOutput(
          [STEP_TEXT.GENERATING_CONFIGURATION, copiesRemoved(COPIED), pluginKept(ref(HONO))].join(
            "\n",
          ),
        );
        expect(compactCliOutput(refused.run.stdout).slice(-ending.length), refused.run.stdout).toBe(
          ending,
        );
      },
    );

    it(
      "keeps the skills folder the project held before the run, though taking back the copy empties it",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();
        await mkdir(skillsPath(env.projectDir), { recursive: true });

        const refused = await initFromUnwritable(env, reactAndHonoPlugin("project"));

        expect(
          compactCliOutput(refused.run.output),
          "precondition: the run copied React into the skills folder the project held",
        ).toContain(copiedOneSkillTo(skillsPath(env.projectDir)));
        await expectARefusedSave(env, refused);
      },
    );

    it(
      "keeps each of Claude's files that held nothing before the run when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        await holdClaudeFilesLeftEmpty(env.fakeHome, env.projectDir, CLAUDE_FILES_LEFT_EMPTY);

        const refused = await initFromUnwritable(env, twoCopiesAndAProjectHonoPlugin());

        expect(
          await claude.changes(),
          "precondition: the take-back uninstalled the plugin this run installed and removed the marketplace it registered",
        ).toStrictEqual([
          marketplaceAdded(),
          installed(HONO, "project"),
          uninstalled(HONO, "project"),
          marketplaceTakenBack(),
        ]);
        expect(
          await claudeFilesPresent(env.fakeHome, env.projectDir),
          "a file that was there before the run is never deleted, though it holds nothing",
        ).toStrictEqual({ projectSettings: true, userSettings: true, knownMarketplaces: true });
        await expectARefusedSave(env, refused);
      },
    );

    it(
      "deletes each of Claude's files it created and its take-back left holding nothing, when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        expect(
          await claudeFilesPresent(env.fakeHome, env.projectDir),
          "precondition: none of the three files is there before the run",
        ).toStrictEqual(noneOfThem);
        await claude.leaveBehind(claudeFilesLeftEmptyByClaude(env.fakeHome, env.projectDir));

        const refused = await initFromUnwritable(env, twoCopiesAndAProjectHonoPlugin());

        expect(
          await claude.changes(),
          "precondition: the take-back uninstalled the plugin this run installed and removed the marketplace it registered",
        ).toStrictEqual([
          marketplaceAdded(),
          installed(HONO, "project"),
          uninstalled(HONO, "project"),
          marketplaceTakenBack(),
        ]);
        expect(
          await claudeFilesPresent(env.fakeHome, env.projectDir),
          "a file this run created, and its take-back left holding nothing, is deleted",
        ).toStrictEqual(noneOfThem);
        expect(
          (await homeAndProjectTrees(env)).project,
          "a refused run leaves the project as it found it",
        ).toStrictEqual(refused.before.project);
      },
    );

    it(
      "deletes the plugin registry holding no plugin and the empty marketplaces folder it created, and keeps Claude's state, its backup and its cache, when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        await claude.leaveBehind(
          claudeHomeLeftByClaude(env.fakeHome, {
            skillId: HONO,
            marketplace: fixture.marketplaceName,
          }),
        );

        const { run, before } = await initFromUnwritable(env, twoCopiesAndAProjectHonoPlugin());

        expect(run.exitCode, run.output).toBe(EXIT_CODES.ERROR);
        expect(
          await claude.changes(),
          "precondition: the take-back uninstalled the plugin this run installed and removed the marketplace it registered",
        ).toStrictEqual([
          marketplaceAdded(),
          installed(HONO, "project"),
          uninstalled(HONO, "project"),
          marketplaceTakenBack(),
        ]);
        expect(
          await claudeHomeEntriesPresent(env.fakeHome),
          "a registry holding no plugin and an empty marketplaces folder this run created go; Claude's state, its backup and its cache are never touched",
        ).toStrictEqual(onlyClaudesOwnState);
        expect(
          (await homeAndProjectTrees(env)).project,
          "a refused run leaves the project as it found it",
        ).toStrictEqual(before.project);
      },
    );

    it.each(CLAUDE_HOME_LEFT_EMPTY)(
      "keeps the $named Claude's home held before the run when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async ({ held }) => {
        env = await createTestEnvironment({ permissions: false });
        await holdClaudeHomeLeftEmpty(env.fakeHome, [held]);
        await claude.leaveBehind(
          claudeHomeLeftByClaude(env.fakeHome, {
            skillId: HONO,
            marketplace: fixture.marketplaceName,
          }),
        );

        const { run } = await initFromUnwritable(env, twoCopiesAndAProjectHonoPlugin());

        expect(run.exitCode, run.output).toBe(EXIT_CODES.ERROR);
        const present = await claudeHomeEntriesPresent(env.fakeHome);
        expect(
          present[held],
          "one that was there before the run stays, though it holds nothing",
        ).toBe(true);
        expect(present, "one the run created and left empty goes").toStrictEqual(keepingAlso(held));
      },
    );

    it(
      "keeps the project plugin, the copy and the global config it made when the configuration is saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();

        const run = await initFrom(env, reactAndHonoPlugin("project"));

        expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
        expect(
          await claude.changes(),
          "a saved configuration names the plugin, so nothing is uninstalled",
        ).toStrictEqual([marketplaceAdded(), installed(HONO, "project")]);
        expect((await loadConfigOrFail(env.projectDir)).skills).toStrictEqual([
          buildSkillConfig(REACT, {
            scope: "project",
            origin: "eject",
            displayName: E2E_SKILL.react.display,
          }),
          buildSkillConfig(HONO, {
            scope: "project",
            origin: fixture.marketplaceName,
            displayName: E2E_SKILL.hono.display,
          }),
        ]);
        expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([REACT]);
        expect(
          (await loadConfigOrFail(env.fakeHome)).projects,
          "a saved configuration keeps the global config made for it, which registers the project",
        ).toStrictEqual([await realpath(env.projectDir)]);
      },
    );

    it(
      "uninstalls the plugin it installed for the user when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();
        const claudeHomeBefore = await claudeHomeOf(env);

        const refused = await initFromUnwritable(env, reactAndHonoPlugin("global"));

        await expectARefusedSave(env, refused);
        expect(
          await claude.changes(),
          "the plugin this run installed for the user is uninstalled for the user, then the marketplace this run registered is removed",
        ).toStrictEqual([
          marketplaceAdded(),
          installed(HONO, "user"),
          uninstalled(HONO, "user"),
          marketplaceTakenBack(),
        ]);
        expect(await claudeHomeOf(env), "Claude's home is as it was").toStrictEqual(
          claudeHomeBefore,
        );
      },
    );

    it(
      "leaves installed a plugin Claude already held for the user when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();
        await holdTheMarketplaceForTheUser(env);
        await holdPluginsForTheUser(env.fakeHome, {
          pluginsDir: fixture.pluginsDir,
          marketplace: fixture.marketplaceName,
          skillIds: [HONO],
        });
        const claudeHomeBefore = await claudeHomeOf(env);

        const refused = await initFromUnwritable(env, reactAndHonoPlugin("global"));

        await expectARefusedSave(env, refused);
        expect(
          await claude.changes(),
          "a plugin Claude held for the user before the run is not one this run newly installed, so it stays, and so does the marketplace it came from",
        ).toStrictEqual([marketplaceRefreshed(), installed(HONO, "user")]);
        expect(
          await claudeHomeOf(env),
          "Claude's home, and its registry, are as they were",
        ).toStrictEqual(claudeHomeBefore);
      },
    );

    it(
      "neither installs nor uninstalls a plugin the global installation holds, and uninstalls the one it added, when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment();
        const globalInstall = await initHonoGloballyFrom(env);
        expect(globalInstall.exitCode, globalInstall.output).toBe(EXIT_CODES.SUCCESS);
        // What `claude plugin marketplace add` and `plugin install --scope user` left behind, which
        // the stub does not write.
        await holdTheMarketplaceForTheUser(env);
        await holdPluginsForTheUser(env.fakeHome, {
          pluginsDir: fixture.pluginsDir,
          marketplace: fixture.marketplaceName,
          skillIds: [HONO],
        });
        const changesBefore = await claude.changes();
        expect(
          changesBefore,
          "precondition: the global installation installed Hono for the user",
        ).toStrictEqual([marketplaceAdded(), installed(HONO, "user")]);
        const homeBefore = await homeSurfaces(env);

        const refused = await initFromUnwritable(
          env,
          buildSeedPayload({
            skills: {
              [REACT]: ejected("project", WEB_DEV),
              [HONO]: plugin("global", API_DEV),
              [VITEST]: plugin("global", API_DEV),
            },
            agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: "global" } },
          }),
        );

        await expectARefusedSave(env, refused);
        expect(
          (await claude.changes()).slice(changesBefore.length),
          "only Vitest, which this run added, is installed and then uninstalled; Hono is not asked for, and the marketplace the global installation registered stays",
        ).toStrictEqual([
          marketplaceRefreshed(),
          installed(VITEST, "user"),
          uninstalled(VITEST, "user"),
        ]);
        expect(await homeSurfaces(env), "the global installation is as it was").toStrictEqual(
          homeBefore,
        );
      },
    );

    it(
      "takes back the config folder it made in the project when the global configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment();
        const globalInstall = await initHonoGloballyFrom(env);
        expect(globalInstall.exitCode, globalInstall.output).toBe(EXIT_CODES.SUCCESS);

        const refused = await initFromWithTheGlobalConfigUnwritable(
          env,
          reactAndHonoPlugin("project"),
        );

        expect(
          compactCliOutput(refused.run.output),
          "precondition: the run copied React into the project before the save",
        ).toContain(copiedOneSkillTo(skillsPath(env.projectDir)));
        await expectARefusedSave(env, refused, configTsPath(env.fakeHome));
      },
    );
  },
);

// Claude's own CLI writes the two files that hold a marketplace, which the stub above does not.
// Skipped where `claude` is absent, as in CI.
describe.skipIf(process.getuid?.() === 0 || !claudeAvailable)(
  "init --from <id> with Claude's own CLI: a refused save and the marketplace it registered",
  () => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let env: TestEnvironment | undefined;

    beforeAll(async () => {
      fixture = await createE2EPluginSource();
      store = await startSeedConfigStore();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await store.close();
      await cleanupFixture(fixture);
    });

    afterEach(async () => {
      store.reset();
      if (env) await cleanupTempDir(env.tempDir);
      env = undefined;
    });

    /** `projectBefore` is read once the read-only folder is made, so that folder is not counted as the run's. */
    async function initFromUnwritable(
      environment: TestEnvironment,
    ): Promise<{ run: CLIResult; projectBefore: InstallTree }> {
      store.publish(SEED_ID, reactAndHonoPlugin("project"));
      const refused = await withTheConfigFolderReadOnly(environment.projectDir, async () => {
        const projectBefore = await readInstallTree(environment.projectDir);
        const run = await runInitFrom(
          store,
          SEED_ID,
          { dir: environment.projectDir, globalHome: environment.fakeHome },
          fixture.sourceDir,
        );
        return { run, projectBefore };
      });
      const { run } = refused;
      expect(run.exitCode, run.output).toBe(EXIT_CODES.ERROR);
      expect(compactCliOutput(run.output), "precondition: the save is what was refused").toContain(
        compactCliOutput(
          `${STEP_TEXT.CONFIG_WRITE_REFUSED} '${configTsPath(environment.projectDir)}'`,
        ),
      );
      return refused;
    }

    const registeredTheMarketplace = () =>
      compactCliOutput(
        `${STEP_TEXT.MARKETPLACE_REGISTERING_PREFIX} "${fixture.marketplaceName}"...`,
      );

    it(
      "takes the marketplace it registered out of both of Claude's files when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment();

        const { run } = await initFromUnwritable(env);

        expect(
          compactCliOutput(run.stdout),
          "precondition: this run registered the marketplace with Claude",
        ).toContain(registeredTheMarketplace());
        expect(
          await readMarketplaceRegistrations(env.fakeHome),
          "neither known_marketplaces.json nor settings.json's extraKnownMarketplaces names it",
        ).toStrictEqual({ known: [], declared: [] });
      },
    );

    it(
      "leaves in both of Claude's files a marketplace registered before the run when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment();
        const added = await execCommand(
          "claude",
          ["plugin", "marketplace", "add", fixture.sourceDir],
          { env: { HOME: env.fakeHome, CLAUDE_CONFIG_DIR: claudeConfigDir(env.fakeHome) } },
        );
        expect(added.exitCode, added.stderr).toBe(0);
        const heldByClaude = {
          known: [fixture.marketplaceName],
          declared: [fixture.marketplaceName],
        };
        expect(
          await readMarketplaceRegistrations(env.fakeHome),
          "precondition: Claude holds the marketplace before the run",
        ).toStrictEqual(heldByClaude);

        await initFromUnwritable(env);

        expect(
          await readMarketplaceRegistrations(env.fakeHome),
          "a marketplace registered before the run stays in both of Claude's files",
        ).toStrictEqual(heldByClaude);
      },
    );

    it(
      "keeps installed a plugin it cannot tell Claude held before the run, and the marketplace it registered for it, when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment();
        await holdAPluginRegistryTheCliCannotRead(env.fakeHome);
        const honoPlugin = pluginKeyFor(HONO, fixture.marketplaceName);

        const { run } = await initFromUnwritable(env);

        expect(
          compactCliOutput(run.stdout),
          "precondition: this run registered the marketplace with Claude",
        ).toContain(registeredTheMarketplace());
        const ending = compactCliOutput(pluginKept(honoPlugin));
        expect(compactCliOutput(run.stdout).slice(-ending.length), run.stdout).toBe(ending);
        expect(
          (await readPluginRegistrations(env.fakeHome, honoPlugin)).map(({ scope }) => scope),
          "the plugin the run says it kept is still installed for the project",
        ).toStrictEqual(["project"]);
        expect(
          await readMarketplaceRegistrations(env.fakeHome),
          "the marketplace the kept plugin comes from stays in both of Claude's files",
        ).toStrictEqual({ known: [fixture.marketplaceName], declared: [fixture.marketplaceName] });
      },
    );

    it(
      "deletes each of Claude's files it created and left holding nothing, leaving the project as it found it, when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        expect(
          await claudeFilesPresent(env.fakeHome, env.projectDir),
          "precondition: none of the three files is there before the run",
        ).toStrictEqual(noneOfThem);

        const { run, projectBefore } = await initFromUnwritable(env);

        expect(
          compactCliOutput(run.stdout),
          "precondition: this run registered the marketplace with Claude",
        ).toContain(registeredTheMarketplace());
        expect(
          await claudeFilesPresent(env.fakeHome, env.projectDir),
          "a file this run created, and its take-back left holding nothing, is deleted",
        ).toStrictEqual(noneOfThem);
        expect(
          await readInstallTree(env.projectDir),
          "a refused run leaves the project as it found it",
        ).toStrictEqual(projectBefore);
      },
    );

    it.each<{ held: ClaudeFileLeftEmpty; named: string; after: ClaudeFilesPresent }>([
      {
        held: "projectSettings",
        named: "the project's settings.json",
        after: { projectSettings: true, userSettings: false, knownMarketplaces: false },
      },
      {
        held: "userSettings",
        named: "the home's settings.json",
        after: { projectSettings: false, userSettings: true, knownMarketplaces: false },
      },
      {
        held: "knownMarketplaces",
        named: "known_marketplaces.json",
        after: { projectSettings: false, userSettings: false, knownMarketplaces: true },
      },
    ])(
      "keeps $named, which held nothing before the run, and deletes the files it created, when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async ({ held, after }) => {
        env = await createTestEnvironment({ permissions: false });
        await holdClaudeFilesLeftEmpty(env.fakeHome, env.projectDir, [held]);

        const { run } = await initFromUnwritable(env);

        expect(
          compactCliOutput(run.stdout),
          "precondition: this run registered the marketplace with Claude",
        ).toContain(registeredTheMarketplace());
        expect(
          await claudeFilesPresent(env.fakeHome, env.projectDir),
          "a file that was there before the run stays, though emptied; one the run created and left holding nothing goes",
        ).toStrictEqual(after);
      },
    );

    it(
      "deletes the plugin registry holding no plugin and the empty marketplaces folder it created, and keeps Claude's state, its backup and its cache, when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        expect(
          await claudeHomeEntriesPresent(env.fakeHome),
          "precondition: Claude's home holds none of them before the run",
        ).toStrictEqual({
          pluginRegistry: false,
          marketplacesFolder: false,
          stateFile: false,
          stateBackups: false,
          pluginCache: false,
        });

        const { run } = await initFromUnwritable(env);

        expect(
          compactCliOutput(run.stdout),
          "precondition: this run registered the marketplace with Claude",
        ).toContain(registeredTheMarketplace());
        expect(
          await claudeHomeEntriesPresent(env.fakeHome),
          "a registry holding no plugin and an empty marketplaces folder this run created go; Claude's state, its backup and its cache are never touched",
        ).toStrictEqual(onlyClaudesOwnState);
      },
    );

    it.each(CLAUDE_HOME_LEFT_EMPTY)(
      "keeps the $named Claude's home held before the run when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async ({ held }) => {
        env = await createTestEnvironment({ permissions: false });
        await holdClaudeHomeLeftEmpty(env.fakeHome, [held]);

        const { run } = await initFromUnwritable(env);

        expect(
          compactCliOutput(run.stdout),
          "precondition: this run registered the marketplace with Claude",
        ).toContain(registeredTheMarketplace());
        const present = await claudeHomeEntriesPresent(env.fakeHome);
        expect(
          present[held],
          "one that was there before the run stays, though it holds nothing",
        ).toBe(true);
        expect(present, "one the run created and left empty goes").toStrictEqual(keepingAlso(held));
      },
    );
  },
);
