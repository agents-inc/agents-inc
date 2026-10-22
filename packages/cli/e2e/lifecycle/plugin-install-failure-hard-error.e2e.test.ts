import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { applyFromSeed, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  createTempDir,
  fileExists,
  flattenCliOutput,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";
import { EXIT_CODES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import "../matchers/setup.js";

const WEB_DEV = E2E_AGENT["web-developer"].name;

/**
 * `init` must hard-error before writing config.ts when `installPluginSkills` returns `failed`
 * entries, rather than recording plugins that never installed.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "init with plugin install failure: hard-error before orphan config write",
  () => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let tempDir: string | undefined;

    beforeAll(async () => {
      // A marketplace that registers cleanly, its plugin list overwritten so per-skill installs
      // fail. `owned`, because corrupting the frozen shared fixture would break every other spec.
      fixture = await createE2EPluginSource({ owned: true });
      await overwriteMarketplacePluginsWithPlaceholder(fixture);
      store = await startSeedConfigStore();
      store.publish("Plugins1", e2eStackPayload({ install: "plugin" }));
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await store.close();
      await cleanupFixture(fixture);
    });

    afterEach(async () => {
      if (tempDir) await cleanupTempDir(tempDir);
      tempDir = undefined;
    });

    it(
      "should exit with ERROR and leave no config.ts on disk",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        tempDir = await createTempDir();
        const projectDir = path.join(tempDir, "project");
        await mkdir(projectDir, { recursive: true });

        const result = await runInitFrom(
          store,
          "Plugins1",
          { dir: projectDir, globalHome: tempDir },
          fixture.sourceDir,
        );

        expect(result.exitCode).toBe(EXIT_CODES.ERROR);

        const output = flattenCliOutput(result.output);
        expect(output).toContain("Plugin install intent could not be honored");
        expect(output).toContain(E2E_SKILL.react.id);

        expect(await fileExists(configTsPath(projectDir))).toBe(false);
        expect(await fileExists(configTsPath(tempDir))).toBe(false);
      },
    );
  },
);

describe.skipIf(!claudeAvailable)(
  "edit with plugin install failure: hard-error before orphan config write",
  () => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let tempDir: string | undefined;

    beforeAll(async () => {
      fixture = await createE2EPluginSource({ owned: true });
      await overwriteMarketplacePluginsWithPlaceholder(fixture);
      store = await startSeedConfigStore();
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await store.close();
      await cleanupFixture(fixture);
    });

    afterEach(async () => {
      if (tempDir) await cleanupTempDir(tempDir);
      tempDir = undefined;
    });

    it(
      "should exit with ERROR and leave config.ts byte-for-byte unchanged",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          marketplace: fixture.sourceDir,
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        const configPath = configTsPath(project.dir);
        const configBefore = await readTestFile(configPath);

        // Rejected: the placeholder marketplace does not list the shipped plugins.
        const { output } = await applyFromSeed(
          store,
          "AddPinia1",
          buildSeedPayload({
            skills: {
              [E2E_SKILL.react.id]: buildSeedSkill({
                install: "plugin",
                scope: "project",
                assignments: { [WEB_DEV]: "preloaded" },
              }),
              [E2E_SKILL.pinia.id]: buildSeedSkill({
                install: "plugin",
                scope: "project",
                assignments: { [WEB_DEV]: "lazy" },
              }),
            },
            agents: { [WEB_DEV]: { scope: "project" } },
          }),
          { dir: project.dir, home: tempDir },
          EXIT_CODES.ERROR,
        );

        expect(output).toContain("Failed to install");
        expect(output).toContain("plugin skill(s)");
        expect(output).toContain("Plugin install intent could not be honored");

        const configAfter = await readTestFile(configPath);
        expect(configAfter).toStrictEqual(configBefore);
      },
    );
  },
);

/**
 * Leaves the marketplace valid and registrable but without the ref init emits, so
 * `claude plugin install` rejects per-skill. The schema requires `min(1)`, hence one placeholder.
 */
async function overwriteMarketplacePluginsWithPlaceholder(fixture: E2EPluginSource): Promise<void> {
  const marketplacePath = path.join(
    fixture.sourceDir,
    SOURCE_PATHS.PLUGIN_MANIFEST_DIR,
    "marketplace.json",
  );
  const marketplace = {
    name: fixture.marketplaceName,
    version: "1.0.0",
    owner: { name: "e2e-test" },
    plugins: [
      {
        name: "e2e-placeholder-never-selected",
        source: "./dist/plugins/e2e-placeholder-never-selected",
        description: "Placeholder to satisfy marketplace schema min-1 constraint.",
        version: "1.0.0",
      },
    ],
  };
  await writeFile(marketplacePath, JSON.stringify(marketplace, null, 2));
}
