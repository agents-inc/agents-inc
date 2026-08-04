import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { CLI } from "../fixtures/cli.js";
import {
  createTempDir,
  cleanupTempDir,
  completeWithLocalSources,
  ensureBinaryExists,
} from "../helpers/test-utils.js";

/**
 * Full lifecycle E2E test for eject mode: Init -> Compile -> Uninstall.
 *
 * Phase 1: Init wizard creates config, compiles agents, copies skills
 * Phase 2: Compile recompiles agents from existing installation
 * Phase 3: Uninstall --yes removes skills and agents
 * Phase 4: Verify clean state (config preserved, artifacts removed)
 */

describe("eject mode lifecycle: init -> compile -> uninstall", () => {
  let tempDir: string;
  let sourceDir: string;
  let sourceTempDir: string;
  let projectDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;

    tempDir = await createTempDir();
    projectDir = tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  it(
    "should complete full lifecycle: init -> compile -> uninstall",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Init -- run wizard, verify config + agents + skills
      // ================================================================

      // Eject mode installs to the default (global) scope. Model it as the
      // GLOBAL install (HOME === cwd === projectDir) so every artifact — config,
      // compiled agents, ejected skills — collapses onto projectDir and the
      // follow-up compile/uninstall commands (which resolve targets from cwd)
      // find the same content.
      const wizard = await InitWizard.launchInGlobal({
        source: { sourceDir, tempDir: sourceTempDir },
        projectDir,
      });

      // Eject mode: every skill source is switched to local, otherwise the
      // wizard defaults to plugin mode (source: "agents-inc").
      const initResult = await completeWithLocalSources(wizard);

      // --- Phase 1 Verification ---

      await expectPhaseSuccess(
        { project: { dir: projectDir }, exitCode: initResult.exitCode },
        {
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
          source: "eject",
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

      // P1-G: No archive warnings or errors
      const initOutput = initResult.output;
      expect(initOutput).not.toContain("Failed to archive");
      expect(initOutput).not.toContain("ENOENT");

      // Clean up session before non-interactive commands
      await initResult.destroy();

      // ================================================================
      // Phase 2: Compile -- recompile agents from existing installation
      // ================================================================

      const compileResult = await CLI.run(
        ["compile"],
        { dir: projectDir },
        {
          env: { AGENTSINC_SOURCE: undefined },
        },
      );

      expect(compileResult.output).toMatch(/Recompiled [1-9]\d* global agents/);

      // P2-A/B/C: Config preserved, agent still compiled with correct content
      await expectPhaseSuccess(
        { project: { dir: projectDir }, exitCode: compileResult.exitCode },
        {
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
          source: "eject",
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
          env: { AGENTSINC_SOURCE: undefined },
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
