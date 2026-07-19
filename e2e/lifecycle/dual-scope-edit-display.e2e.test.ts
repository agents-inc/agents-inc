import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { createTestEnvironment, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

/**
 * Dual-scope edit lifecycle E2E test -- display and locking.
 *
 * Tests the full lifecycle: init global -> init project -> edit from project.
 * Verifies that the CLI correctly handles dual-scope state with mixed sources
 * throughout the real user flow.
 *
 * Architecture per test:
 *   tempDir/
 *     fake-home/                          <- HOME env var
 *       .claude-src/config.ts             <- global config
 *       .claude/agents/web-developer.md   <- global agent
 *       .claude/skills/web-framework-react/ <- global local skill
 *       .claude/settings.json             <- permissions
 *       project/                          <- project dir (CWD for Phase B/C)
 *         .claude-src/config.ts           <- project config
 *         .claude/agents/api-developer.md <- project agent
 *         .claude/skills/api-framework-hono/ <- project local skill
 *         .claude/settings.json           <- permissions
 *
 */

describe("dual-scope edit lifecycle -- display and locking", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  it(
    "Edit shows global items as locked, project items as editable",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);

      // Phase C: Edit from project dir -- navigate through without changes
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      const result = await wizard.passThrough();

      // Phase D: Assertions

      // D-1: Exit code 0
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // D-2: Scope indicators visible in output
      const rawOutput = result.rawOutput;
      expect(rawOutput).toContain("G ");
      expect(rawOutput).toContain("P ");

      // D-3: Agent scope badges
      expect(rawOutput).toContain("[G]");
      expect(rawOutput).toContain("[P]");

      // D-4: Config files unchanged with full expected content + agent files preserved
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
          agents: ["web-developer"],
        },
        project: { skillIds: ["api-framework-hono"], agents: ["api-developer"] },
      });

      await result.destroy();
    },
  );
});
