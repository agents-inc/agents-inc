import path from "path";
import { chmod, mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import "../matchers/setup.js";
import {
  cleanupFixture,
  cleanupTempDir,
  compactCliOutput,
  configTsPath,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { holdPluginsForTheUser, pluginKeyFor } from "../fixtures/plugin-install-state.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import type { CLIResult } from "../fixtures/cli.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfig } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { useClaudeStub } from "../../src/cli/lib/__tests__/helpers/claude-stub.js";

/**
 * `init --from` whose configuration cannot be saved after it installed: it uninstalls each plugin
 * this run newly installed, at the scope it installed it, and leaves alone a plugin Claude held
 * before the run or the global installation holds. The save is refused by a read-only source
 * folder, as a user without write permission meets it. Claude's CLI is a stub on PATH that logs
 * each call; Claude's own registry is written by hand where a plugin was held before the run.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const REACT = E2E_SKILL.react.id;
const HONO = E2E_SKILL.hono.id;
const VITEST = E2E_SKILL.vitest.id;

const READ_ONLY_DIR = 0o555;
const WRITABLE_DIR = 0o755;

const SEED_ID = "Refused01";
const GLOBAL_SEED_ID = "Refused02";

const ejected = (scope: "project" | "global", agent: string) =>
  buildSeedSkill({ install: "eject", scope, assignments: { [agent]: "lazy" } });
const plugin = (scope: "project" | "global", agent: string) =>
  buildSeedSkill({ install: "plugin", scope, assignments: { [agent]: "lazy" } });

/** React copied into the project, and Hono a plugin at `honoScope`. */
const reactAndHonoPlugin = (honoScope: "project" | "global"): SeedPayload =>
  buildSeedPayload({
    skills: { [REACT]: ejected("project", WEB_DEV), [HONO]: plugin(honoScope, API_DEV) },
    agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: honoScope } },
  });

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

    const sourceFolderOf = (dir: string) => path.join(dir, DIRS.SOURCE_CLAUDE);
    const ref = (skillId: string) => pluginKeyFor(skillId, fixture.marketplaceName);
    const marketplaceAdded = () => `plugin marketplace add ${fixture.sourceDir}`;
    const installed = (skillId: string, scope: "project" | "user") =>
      `plugin install ${ref(skillId)} --scope ${scope}`;
    const uninstalled = (skillId: string, scope: "project" | "user") =>
      `plugin uninstall ${ref(skillId)} --scope ${scope}`;

    // KNOWN GAP: a home with no global config keeps the blank one written before the refused save,
    // so a fresh home is compared on Claude's side only.
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

    async function initFromUnwritable(
      environment: TestEnvironment,
      payload: SeedPayload,
    ): Promise<CLIResult> {
      const sourceFolder = sourceFolderOf(environment.projectDir);
      await mkdir(sourceFolder, { recursive: true });
      await chmod(sourceFolder, READ_ONLY_DIR);
      try {
        return await initFrom(environment, payload);
      } finally {
        await chmod(sourceFolder, WRITABLE_DIR);
      }
    }

    /** The run failed on the project's config, naming it, and left the project as it found it. */
    async function expectARefusedSave(environment: TestEnvironment, run: CLIResult): Promise<void> {
      expect(run.exitCode, run.output).toBe(EXIT_CODES.ERROR);
      expect(compactCliOutput(run.output)).toContain(
        compactCliOutput(
          `${STEP_TEXT.CONFIG_WRITE_REFUSED} '${configTsPath(environment.projectDir)}'`,
        ),
      );
      expect(
        {
          sourceFolder: await readTreeSnapshot(sourceFolderOf(environment.projectDir)),
          copies: await listFiles(skillsPath(environment.projectDir)),
        },
        "a refused save leaves no config and no copy in the project",
      ).toStrictEqual({ sourceFolder: {}, copies: [] });
    }

    it(
      "uninstalls the project plugin it installed when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();
        const claudeHomeBefore = await claudeHomeOf(env);

        const run = await initFromUnwritable(env, reactAndHonoPlugin("project"));

        await expectARefusedSave(env, run);
        expect(
          await claude.changes(),
          "the plugin this run installed for the project is uninstalled from the project",
        ).toStrictEqual([
          marketplaceAdded(),
          installed(HONO, "project"),
          uninstalled(HONO, "project"),
        ]);
        expect(await claudeHomeOf(env), "Claude's home is as it was").toStrictEqual(
          claudeHomeBefore,
        );
      },
    );

    it(
      "keeps the project plugin it installed when the configuration is saved",
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
      },
    );

    it(
      "uninstalls the plugin it installed for the user when the configuration cannot be saved",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment();
        const claudeHomeBefore = await claudeHomeOf(env);

        const run = await initFromUnwritable(env, reactAndHonoPlugin("global"));

        await expectARefusedSave(env, run);
        expect(
          await claude.changes(),
          "the plugin this run installed for the user is uninstalled for the user",
        ).toStrictEqual([marketplaceAdded(), installed(HONO, "user"), uninstalled(HONO, "user")]);
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
        await holdPluginsForTheUser(env.fakeHome, {
          pluginsDir: fixture.pluginsDir,
          marketplace: fixture.marketplaceName,
          skillIds: [HONO],
        });
        const claudeHomeBefore = await claudeHomeOf(env);

        const run = await initFromUnwritable(env, reactAndHonoPlugin("global"));

        await expectARefusedSave(env, run);
        expect(
          await claude.changes(),
          "a plugin Claude held for the user before the run is not one this run newly installed, so it stays",
        ).toStrictEqual([marketplaceAdded(), installed(HONO, "user")]);
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
        store.publish(
          GLOBAL_SEED_ID,
          buildSeedPayload({
            skills: { [HONO]: plugin("global", API_DEV) },
            agents: { [API_DEV]: { scope: "global" } },
          }),
        );
        const globalInstall = await runInitFrom(
          store,
          GLOBAL_SEED_ID,
          { dir: env.fakeHome, globalHome: env.fakeHome },
          fixture.sourceDir,
        );
        expect(globalInstall.exitCode, globalInstall.output).toBe(EXIT_CODES.SUCCESS);
        // What `claude plugin install --scope user` left behind, which the stub does not write.
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

        const run = await initFromUnwritable(
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

        await expectARefusedSave(env, run);
        expect(
          (await claude.changes()).slice(changesBefore.length),
          "only Vitest, which this run added, is installed and then uninstalled; Hono is not asked for",
        ).toStrictEqual([
          marketplaceAdded(),
          installed(VITEST, "user"),
          uninstalled(VITEST, "user"),
        ]);
        expect(await homeSurfaces(env), "the global installation is as it was").toStrictEqual(
          homeBefore,
        );
      },
    );
  },
);
