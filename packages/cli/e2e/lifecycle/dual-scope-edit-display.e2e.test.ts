import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { createTestEnvironment, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

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
  }, TIMEOUTS.SETUP_DUAL);

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
        ...TERMINAL_SIZE.TALL,
      });

      // D-2: the scope badge on the ONE skill whose scope this fixture pins, read
      // off the live build grid. The assertions that stood here were
      // `rawOutput.toContain("G ")` / `("P ")` / `("[G]")` / `("[P]")` — two-
      // character substrings that occur throughout any wizard frame (every word
      // beginning with G or P satisfies the first two), so they said nothing about
      // which skill carried which scope. That is what this file is named for.
      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "react is installed at global scope by setupDualScopeWithEject",
      ).toStrictEqual(["G"]);

      const result = await wizard.passThrough();

      // Phase D: Assertions

      // D-1: Exit code 0
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // D-4: Config files unchanged with full expected content + agent files preserved
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          agents: ["web-developer"],
        },
        project: { skillIds: [E2E_SKILL.hono.id], agents: ["api-developer"] },
      });

      await result.destroy();
    },
  );
});
