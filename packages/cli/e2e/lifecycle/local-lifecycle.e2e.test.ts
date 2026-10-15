import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";

import "../matchers/setup.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import { installE2EStackGlobally } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { createTempDir, cleanupTempDir } from "../helpers/test-utils.js";

/**
 * Full lifecycle E2E test for eject mode: Init -> Compile -> Uninstall.
 *
 * Phase 1: init --from creates config, compiles agents, copies skills
 * Phase 2: Compile recompiles agents from existing installation
 * Phase 3: Uninstall --yes removes skills and agents
 * Phase 4: Verify clean state (config preserved, artifacts removed)
 */

describe("eject mode lifecycle: init -> compile -> uninstall", () => {
  let store: SeedConfigStore;
  let tempDir: string;
  let projectDir: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    tempDir = await createTempDir();
    projectDir = tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it(
    "should complete full lifecycle: init -> compile -> uninstall",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Init -- verify config + agents + skills
      // ================================================================

      // Eject mode installs to the default (global) scope. Model it as the
      // GLOBAL install (HOME === cwd === projectDir) so every artifact — config,
      // compiled agents, ejected skills — collapses onto projectDir and the
      // follow-up compile/uninstall commands (which resolve targets from cwd)
      // find the same content.
      const initResult = await installE2EStackGlobally(store, projectDir);

      // --- Phase 1 Verification ---

      await expectPhaseSuccess(
        { project: { dir: projectDir }, exitCode: initResult.exitCode },
        {
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
          origin: "eject",
          copiedSkills: [E2E_SKILL.react.id],
        },
      );

      // P1-C/D: Agents compiled with correct content
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", E2E_SKILL.react.id],
      });
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["name: api-developer"],
      });

      // P1-G: the install announced completion. The generic absences that stood
      // here ("Failed to archive", "ENOENT") could not tell a clean install from
      // one that failed with different wording, and the exit code beside them
      // already carries "did not crash".
      expect(initResult.output).toContain(STEP_TEXT.INIT_SUCCESS);

      // ================================================================
      // Phase 2: Compile -- recompile agents from existing installation
      // ================================================================

      const compileResult = await CLI.run(
        ["compile"],
        { dir: projectDir },
        {
          env: { CC_MARKETPLACE: undefined },
        },
      );

      // The install compiled these agents moments ago, so recompiling them is a
      // no-op — and the summary has to say that rather than count the roster again.
      expect(compileResult.output).toMatch(/0 global agents rewritten, [1-9]\d* unchanged/);

      // P2-A/B/C: Config preserved, agent still compiled with correct content
      await expectPhaseSuccess(
        { project: { dir: projectDir }, exitCode: compileResult.exitCode },
        {
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
          origin: "eject",
        },
      );
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", E2E_SKILL.react.id],
      });
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["name: api-developer"],
      });

      // ================================================================
      // Phase 3: Uninstall --yes -- remove skills and agents
      // ================================================================

      const uninstallResult = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        {
          env: { CC_MARKETPLACE: undefined },
        },
      );

      expect(uninstallResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(uninstallResult.stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      // ================================================================
      // Phase 4: Verify clean state
      // ================================================================

      // Skills, agents, and the config manifest should all be removed by default
      await expectCleanUninstall(projectDir, { removeConfig: true });
    },
  );
});
