import path from "path";
import { chmod, mkdir, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { runCodex } from "../fixtures/codex.js";
import { configIn, runInitFromOnCodex } from "../fixtures/codex-install.js";
import { holdACodexMarketplaceWhoseFolderIsGone } from "../fixtures/codex-marketplace-gone.js";
import { codexConfigFile } from "../fixtures/codex-plugin-switch.js";
import {
  createTestEnvironment,
  homeAndProjectTrees,
  type HomeAndProjectTrees,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import type { CLIResult } from "../fixtures/cli.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  codexHome,
  compactCliOutput,
  directoryExists,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  DIRS,
  E2E_MARKETPLACE_PREFIX,
  EXIT_CODES,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const REACT = E2E_SKILL.react.id;
const VITEST = E2E_SKILL.vitest.id;
const HONO = E2E_SKILL.hono.id;

const READ_ONLY_DIR = 0o555;
const WRITABLE_DIR = 0o755;

const SEED_ID = "RefusedCx";

const COPIED = 2;

const ejected = (agent: string) =>
  buildSeedSkill({ install: "eject", scope: "project", assignments: { [agent]: "lazy" } });

// Codex installs a plugin for the user only.
const twoCopiesAndAGlobalHonoPlugin = (): SeedPayload =>
  buildSeedPayload({
    skills: {
      [REACT]: ejected(WEB_DEV),
      [VITEST]: ejected(WEB_DEV),
      [HONO]: buildSeedSkill({
        install: "plugin",
        scope: "global",
        assignments: { [API_DEV]: "lazy" },
      }),
    },
    agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: "global" } },
  });

type RefusedRun = { run: CLIResult; before: HomeAndProjectTrees };

const copiesRemoved = (count: number) =>
  `${STEP_TEXT.COPIES_REMOVED_PREFIX} ${count} ${STEP_TEXT.COPIES_REMOVED_SUFFIX}`;
const marketplaceRemoved = (marketplace: string) =>
  `${STEP_TEXT.MARKETPLACE_REMOVED_PREFIX} "${marketplace}" ${STEP_TEXT.MARKETPLACE_REMOVED_SUFFIX}`;
const pluginKept = (pluginRef: string) =>
  `${STEP_TEXT.PLUGIN_KEPT_PREFIX} "${pluginRef}" ${STEP_TEXT.PLUGIN_KEPT_SUFFIX}`;

/** Codex's own answers, without the stderr that carries its warnings. */
async function codexListings(home: string) {
  const marketplaces = await runCodex(home, ["plugin", "marketplace", "list"], home);
  const plugins = await runCodex(home, ["plugin", "list"], home);
  return {
    marketplaces: { exitCode: marketplaces.exitCode, json: marketplaces.json },
    plugins: { exitCode: plugins.exitCode, json: plugins.json },
  };
}

// Root writes through the mode bits, so a refused save cannot happen there.
describe.skipIf(process.getuid?.() === 0)(
  "init --from <id> --provider codex: a refused save and the marketplace it registered",
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

    async function registerWithCodex(home: string, sourceDir: string): Promise<void> {
      const added = await runCodex(home, ["plugin", "marketplace", "add", sourceDir], home);
      expect(added.exitCode, added.stderr).toBe(EXIT_CODES.SUCCESS);
    }

    /**
     * The project's Codex config folder made read-only around the run, so the save is refused.
     * `before` is read once that folder is made, so it is not counted as the run's.
     */
    async function initFromUnwritable(environment: TestEnvironment): Promise<RefusedRun> {
      store.publish(SEED_ID, twoCopiesAndAGlobalHonoPlugin());
      const sourceFolder = path.join(environment.projectDir, DIRS.SOURCE_CODEX);
      await mkdir(sourceFolder, { recursive: true });
      await chmod(sourceFolder, READ_ONLY_DIR);
      let refused: RefusedRun;
      try {
        const before = await homeAndProjectTrees(environment);
        const run = await runInitFromOnCodex(
          store,
          SEED_ID,
          { dir: environment.projectDir, globalHome: environment.fakeHome },
          fixture.sourceDir,
        );
        refused = { run, before };
      } finally {
        await chmod(sourceFolder, WRITABLE_DIR);
      }
      const { run } = refused;
      expect(run.exitCode, run.output).toBe(EXIT_CODES.ERROR);
      expect(compactCliOutput(run.output), "precondition: the save is what was refused").toContain(
        compactCliOutput(
          `${STEP_TEXT.CONFIG_WRITE_REFUSED} '${configIn(environment.projectDir, "codex")}'`,
        ),
      );
      return refused;
    }

    const honoPlugin = () => pluginKeyFor(HONO, fixture.marketplaceName);

    const registeredTheMarketplace = () =>
      compactCliOutput(
        `${STEP_TEXT.MARKETPLACE_REGISTERING_PREFIX} "${fixture.marketplaceName}"...`,
      );

    function expectTheOutputToEndWith(run: CLIResult, lines: string[]): void {
      const ending = compactCliOutput(lines.join("\n"));
      expect(compactCliOutput(run.stdout).slice(-ending.length), run.stdout).toBe(ending);
    }

    it(
      "removes from Codex the marketplace it registered, and says so after the skills it copied, when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        const before = await codexListings(env.fakeHome);
        expect(before.marketplaces.exitCode, "precondition: Codex can list its marketplaces").toBe(
          EXIT_CODES.SUCCESS,
        );

        const { run } = await initFromUnwritable(env);

        expect(
          compactCliOutput(run.stdout),
          "precondition: this run registered the marketplace with Codex",
        ).toContain(registeredTheMarketplace());
        expect(
          await codexListings(env.fakeHome),
          "a refused run leaves Codex's marketplaces and plugins as it found them",
        ).toStrictEqual(before);
        expectTheOutputToEndWith(run, [
          STEP_TEXT.GENERATING_CONFIGURATION,
          copiesRemoved(COPIED),
          marketplaceRemoved(fixture.marketplaceName),
        ]);
      },
    );

    it(
      "keeps a marketplace Codex held before the run, and says nothing of it, when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        await registerWithCodex(env.fakeHome, fixture.sourceDir);
        const before = await codexListings(env.fakeHome);
        expect(
          before.marketplaces.json,
          "precondition: Codex holds the marketplace before the run",
        ).toMatchObject([{ marketplaces: [{ name: fixture.marketplaceName }] }]);

        const { run } = await initFromUnwritable(env);

        expect(
          await codexListings(env.fakeHome),
          "a marketplace registered before the run stays",
        ).toStrictEqual(before);
        expectTheOutputToEndWith(run, [STEP_TEXT.GENERATING_CONFIGURATION, copiesRemoved(COPIED)]);
      },
    );

    it(
      "keeps the marketplace, and the plugin it installed, when it cannot tell whether Codex held them before the run, and says so of the plugin, when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        await registerWithCodex(env.fakeHome, fixture.sourceDir);
        await holdACodexMarketplaceWhoseFolderIsGone(env.fakeHome, `${E2E_MARKETPLACE_PREFIX}gone`);
        const plugins = await runCodex(env.fakeHome, ["plugin", "list"], env.fakeHome);
        expect(
          plugins.exitCode,
          "precondition: a marketplace whose folder is gone stops Codex listing any plugin",
        ).not.toBe(EXIT_CODES.SUCCESS);
        const listed = await runCodex(
          env.fakeHome,
          ["plugin", "marketplace", "list"],
          env.fakeHome,
        );
        expect(
          listed.exitCode,
          "precondition: a marketplace whose folder is gone stops Codex listing any",
        ).not.toBe(EXIT_CODES.SUCCESS);

        const { run } = await initFromUnwritable(env);

        const config = await readTestFile(codexConfigFile(env.fakeHome));
        expect(
          config,
          "a marketplace the run cannot tell whether it registered stays in Codex's config",
        ).toContain(`[marketplaces.${fixture.marketplaceName}]`);
        expect(
          config,
          "a plugin the run cannot tell whether Codex held before stays installed",
        ).toContain(`[plugins."${honoPlugin()}"]`);
        expectTheOutputToEndWith(run, [
          STEP_TEXT.GENERATING_CONFIGURATION,
          copiesRemoved(COPIED),
          pluginKept(honoPlugin()),
        ]);
      },
    );

    it(
      "deletes what it created in Codex's home and left empty, leaving the home and the project as it found them, when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        expect(
          await directoryExists(codexHome(env.fakeHome)),
          "precondition: Codex's home is not there before the run",
        ).toBe(false);

        const { run, before } = await initFromUnwritable(env);

        expect(
          compactCliOutput(run.stdout),
          "precondition: this run registered the marketplace with Codex",
        ).toContain(registeredTheMarketplace());
        expect(
          await homeAndProjectTrees(env),
          "a refused run leaves no file or folder it created and left holding nothing: Codex's home and the project are as it found them",
        ).toStrictEqual(before);
      },
    );

    it(
      "keeps the config.toml and the folders Codex's home held before the run, though they hold nothing, when the configuration cannot be saved",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        const configFile = codexConfigFile(env.fakeHome);
        const pluginCache = path.join(codexHome(env.fakeHome), DIRS.PLUGINS, DIRS.PLUGIN_CACHE);
        await mkdir(pluginCache, { recursive: true });
        await writeFile(configFile, "");

        const { run, before } = await initFromUnwritable(env);

        expect(
          compactCliOutput(run.stdout),
          "precondition: this run registered the marketplace with Codex",
        ).toContain(registeredTheMarketplace());
        expect(
          {
            config: await readTestFile(configFile),
            pluginCache: await directoryExists(pluginCache),
          },
          "a file or folder that was there before the run stays, though it holds nothing",
        ).toStrictEqual({ config: "", pluginCache: true });
        expect(
          await homeAndProjectTrees(env),
          "one the run created and left empty goes, so the home and the project are as it found them",
        ).toStrictEqual(before);
      },
    );
  },
);
