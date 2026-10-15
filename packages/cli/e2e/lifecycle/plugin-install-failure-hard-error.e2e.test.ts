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
 * D-229: `cc init` must hard-error when `installPluginSkills` returns `failed`
 * entries — writing an orphan config.ts claiming the plugin is installed when
 * `claude plugin install` rejected the ref is a silent-substitution bug.
 *
 * Finding: plugin install intent is inviolable (feedback_no_plugin_to_eject_fallback.md).
 *
 * Pre-fix: `installPluginsStep` emitted `this.warn()` per failed skill and
 * continued, so `writeConfigAndCompile` wrote config.ts entries with
 * `source: "<marketplace>"` even though the plugin was never actually
 * installed into `settings.json`.
 *
 * Post-fix: when `pluginResult.failed.length > 0`, `this.error(..., { exit:
 * EXIT_CODES.ERROR })` fires BEFORE `writeConfigAndCompile`, so no orphan
 * entries reach disk.
 *
 * Requires the Claude CLI — this scenario exercises the real `claude plugin
 * install` code path (marketplace resolves successfully, but the skill ref
 * doesn't correspond to a plugin in the marketplace).
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "init with plugin install failure: hard-error before orphan config write",
  () => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let tempDir: string | undefined;

    beforeAll(async () => {
      // Build a real marketplace that registers cleanly with claude CLI, then
      // overwrite its plugin list so individual installs fail per-skill.
      //
      // `owned` because this spec's whole method is CORRUPTING its marketplace, and the shared
      // fixture is frozen precisely so a spec cannot do that to one every other spec is reading.
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
        // Remediation hint must name a concrete follow-up for the user.
        expect(output).toContain("Plugin install intent could not be honored");
        // The failing skill id surfaces in the per-skill warn line that runs
        // before the hard-error, so stderr/stdout combined contains it.
        expect(output).toContain(E2E_SKILL.react.id);

        // The core regression check: pre-fix, config.ts was written with an
        // orphan entry (`source: "<marketplace>"`) claiming web-framework-react
        // was installed. Post-fix, `writeConfigAndCompile` never runs.
        expect(await fileExists(configTsPath(projectDir))).toBe(false);
        expect(await fileExists(configTsPath(tempDir))).toBe(false);
      },
    );
  },
);

/**
 * The twin path: `cc edit` must hard-error with the same guarantees as
 * `cc init` when `installPluginSkills` returns `failed` entries. There is one
 * guard rather than two copies of it — `BaseCommand.reportPluginInstalls`, which
 * `edit.tsx::applyPluginChanges` and `init.tsx::handleInstallation` both reach
 * through `installPluginSkillsReported` — so this test pins the shared contract
 * from the edit side, and the init case above pins it from the other.
 *
 * Scenario:
 *   1. Seed a valid plugin-mode project whose config.ts records a
 *      marketplace-sourced `web-framework-react` (ProjectBuilder.pluginProject).
 *   2. The shared fixture's marketplace.json was already overwritten in
 *      `beforeAll` so only the placeholder plugin remains — ANY attempt to
 *      install a real skill from the shipped source is rejected per-skill by
 *      `claude plugin install`.
 *   3. Run `edit --from` with a configuration adding a plugin skill, and
 *      confirm. The install step hits `pluginResult.failed.length > 0` and
 *      hard-errors BEFORE `writeConfigAndCompile` runs, so config.ts is
 *      byte-for-byte identical to its pre-edit state.
 */
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

        // Snapshot config.ts BEFORE edit. The hard-error contract is that
        // writeConfigAndCompile never runs, so the file must be identical
        // after the failed edit (no orphan entries, no timestamp-only churn).
        const configPath = configTsPath(project.dir);
        const configBefore = await readTestFile(configPath);

        // Add a plugin-sourced skill beside web-framework-react.
        // `claude plugin install <id>@<marketplace>` rejects it because the
        // placeholder marketplace does not list the shipped plugins.
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

        // Remediation hint is `pluginInstallFailureError`, emitted by the one
        // reporter both commands reach, so the two spellings cannot drift apart.
        expect(output).toContain("Failed to install");
        expect(output).toContain("plugin skill(s)");
        expect(output).toContain("Plugin install intent could not be honored");

        // The core regression check: config.ts on disk is byte-for-byte the
        // same as before the failed edit. Pre-fix, `writeConfigAndCompile`
        // would have appended the new plugin skill with `source:
        // "<marketplace>"` even though the install was rejected.
        const configAfter = await readTestFile(configPath);
        expect(configAfter).toStrictEqual(configBefore);
      },
    );
  },
);

/**
 * Overwrites the built `.claude-plugin/marketplace.json` so the marketplace
 * still passes `fetchMarketplace` schema validation and registers with
 * `claude plugin marketplace add`, but the plugin ref emitted by init
 * (`web-framework-react@<marketplaceName>`) is NOT present. `claude plugin
 * install` then rejects per-skill, populating `installPluginSkills`'s
 * `failed` array.
 *
 * The marketplace schema requires `plugins: z.array(...).min(1)`, so we keep
 * exactly one placeholder entry whose name cannot collide with any skill id
 * shipped by `createE2ESource`.
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
