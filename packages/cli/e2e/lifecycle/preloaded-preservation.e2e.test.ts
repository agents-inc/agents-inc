import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createTempDir,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import type { AgentName, Category } from "../../src/cli/types/index.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * Preloaded flag preservation across init and edit lifecycle.
 *
 * Gaps 10, 11, 12: Verifies that `preloaded: true` flags from the stack YAML
 * survive init, edit passthrough, and edit with skill additions.
 *
 * The E2E source stack assigns preloaded: true to web-framework-react (via
 * createMockSkillAssignment("web-framework-react", true)) and to
 * api-framework-hono (via createMockSkillAssignment("api-framework-hono", true)).
 *
 * Config.ts uses compact stack assignments: an assignment carrying a flag is
 * stored as { "id": "...", "preloaded": true }, while a flag-less one is stored
 * as a bare string. The generator only ever emits `preloaded` where it is true —
 * an assignment it did not preload has no key at all — so the bare form covers
 * both "never preloaded" and an explicit `preloaded: false` read off disk. This
 * test asserts on the presence of the full object form.
 */

/**
 * Asserts that a given skill ID appears as a preloaded assignment within a
 * specific agent's category in the structurally-loaded config.ts stack.
 *
 * The rendered compact format stores preloaded skills as
 * { "id": "...", "preloaded": true } and flag-less ones as bare string IDs;
 * the loader normalizes both to { id, preloaded }, so the find below matches
 * exactly the preloaded entries.
 *
 * The stack for an agent is written to that agent's SCOPE config: a default
 * init scopes every agent global, so the stack lands in the GLOBAL config at
 * HOME/.claude-src — pass the shared global home here, not projectDir.
 */
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

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
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

        // Default init/edit content is GLOBAL-scoped (compiled agents land in
        // HOME). Thread ONE shared HOME through both phases so the edit sees the
        // init's global content; config.ts stays under projectDir. The afterEach
        // owns cleanup (reuse-param launches do not).
        sharedHome = await createTempDir();

        // ================================================================
        // Phase A: Stack-picked init
        // ================================================================

        const initWizard = await InitWizard.launchInProject({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir,
          globalHome: sharedHome,
        });
        const initResult = await initWizard.completeWithDefaults();
        await initResult.destroy();

        expect(await initResult.exitCode).toBe(EXIT_CODES.SUCCESS);
        await expect({ dir: projectDir }).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          origin: fixture.marketplaceName,
        });
        await expect({ dir: sharedHome }).toHaveCompiledAgent("web-developer");

        // Verify preloaded flags in config after init
        await assertPreloadedInStack(
          sharedHome,
          "web-developer",
          "web-framework",
          E2E_SKILL.react.id,
        );
        await assertPreloadedInStack(sharedHome, "api-developer", "api-api", E2E_SKILL.hono.id);

        // ================================================================
        // Phase B: Edit passthrough (no changes)
        // ================================================================

        const editWizard = await EditWizard.launchInProject({
          projectDir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          globalHome: sharedHome,
        });
        const editResult = await editWizard.passThrough();
        await editResult.destroy();

        expect(await editResult.exitCode).toBe(EXIT_CODES.SUCCESS);

        // Verify preloaded flags survive edit passthrough
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
