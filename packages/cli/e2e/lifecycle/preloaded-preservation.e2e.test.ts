import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS } from "../pages/constants.js";
import {
  applyUnchangedFromSeed,
  e2eStackPayload,
  installFromSeed,
} from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createTempDir,
  isClaudeCLIAvailable,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import type { AgentName, Category } from "../../src/cli/types/index.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/** A default init scopes every agent global, so pass the global home, not projectDir. */
async function assertPreloadedInStack(
  configDir: string,
  agentName: AgentName,
  category: Category,
  skillId: string,
): Promise<void> {
  const { stack } = await loadConfigOrFail(configDir);
  expect(stack, "Expected config.ts to contain a stack").toBeDefined();

  const agentConfig = stack?.[agentName];
  expect(agentConfig, `Expected stack to contain agent "${agentName}"`).toBeDefined();

  const assignments = agentConfig?.[category];
  expect(
    assignments,
    `Expected stack to contain category "${category}" under agent "${agentName}"`,
  ).toBeDefined();

  const preloadedEntry = (assignments ?? []).find((a) => a.id === skillId && a.preloaded === true);

  expect(
    preloadedEntry,
    `Expected skill "${skillId}" to have preloaded: true in stack under ${agentName}/${category}.\nAssignments: ${JSON.stringify(assignments)}`,
  ).toBeDefined();
}

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("preloaded preservation across init and edit", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(fixture);
  });

  describe("init and edit passthrough", () => {
    let tempDir: string | undefined;
    let sharedHome: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
      if (sharedHome) {
        await cleanupTempDir(sharedHome);
        sharedHome = undefined;
      }
    });

    it(
      "should preserve preloaded: true flags from stack through init and edit passthrough",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = tempDir;

        // Default-scope content is global, so one shared HOME runs through both phases.
        sharedHome = await createTempDir();
        const site = { dir: projectDir, home: sharedHome };
        const stack = e2eStackPayload({ install: "plugin" });

        await installFromSeed(store, "Stacked1", stack, site, fixture.sourceDir);

        await expect({ dir: projectDir }).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          origin: fixture.marketplaceName,
        });
        await expect({ dir: sharedHome }).toHaveCompiledAgent("web-developer");

        await assertPreloadedInStack(
          sharedHome,
          "web-developer",
          "web-framework",
          E2E_SKILL.react.id,
        );
        await assertPreloadedInStack(sharedHome, "api-developer", "api-api", E2E_SKILL.hono.id);

        await applyUnchangedFromSeed(store, "Stacked2", stack, site);

        await assertPreloadedInStack(
          sharedHome,
          "web-developer",
          "web-framework",
          E2E_SKILL.react.id,
        );
        await assertPreloadedInStack(sharedHome, "api-developer", "api-api", E2E_SKILL.hono.id);
      },
    );
  });
});
