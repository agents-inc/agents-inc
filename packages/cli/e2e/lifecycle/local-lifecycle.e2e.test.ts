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
      // Modelled as the global install (HOME === cwd) so the follow-up commands, which resolve
      // targets from cwd, find the same content.
      const initResult = await installE2EStackGlobally(store, projectDir);

      await expectPhaseSuccess(
        { project: { dir: projectDir }, exitCode: initResult.exitCode },
        {
          skillIds: [E2E_SKILL.react.id],
          agents: E2E_AGENTS.WEB_AND_API,
          origin: "eject",
          copiedSkills: [E2E_SKILL.react.id],
        },
      );

      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", E2E_SKILL.react.id],
      });
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["name: api-developer"],
      });

      expect(initResult.output).toContain(STEP_TEXT.INIT_SUCCESS);

      const compileResult = await CLI.run(
        ["compile"],
        { dir: projectDir },
        {
          env: { CC_MARKETPLACE: undefined },
        },
      );

      // Just compiled, so the recompile is a no-op and the summary must say so.
      expect(compileResult.output).toMatch(/0 global agents rewritten, [1-9]\d* unchanged/);

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

      const uninstallResult = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        {
          env: { CC_MARKETPLACE: undefined },
        },
      );

      expect(uninstallResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(uninstallResult.stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      await expectCleanUninstall(projectDir, { removeConfig: true });
    },
  );
});
