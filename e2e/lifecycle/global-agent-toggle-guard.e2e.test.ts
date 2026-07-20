import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { TIMEOUTS, TERMINAL_SIZE, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { createGlobalOnlyEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_AGENT_DISPLAY } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import "../matchers/setup.js";

/**
 * Global agent toggle guard E2E tests (D-196, D-183).
 *
 * D-196: Verifies that globally installed agents cannot be toggled (Space)
 * from project scope in the edit wizard's agents step.
 *
 * D-183: Verifies that globally installed agents cannot be re-scoped (S key)
 * from project scope in the edit wizard's agents step.
 *
 * Both guards show a toast message and leave the agent config unchanged.
 */

describe("global agent toggle guard from project scope", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let env: DualScopeEnv | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    await env?.destroy();
    env = undefined;
  });

  it(
    "should block toggling globally installed agents from project scope",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Setup: global init + project init with all skills/agents staying global
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);

      // `cc init` inside a project materialises that project — it writes the
      // project's config.ts and registers the path in the global projects list —
      // so a project config already exists before the guarded edit runs. The
      // guard's contract is therefore "changes nothing", not "writes nothing":
      // snapshot the project config now and assert it is byte-identical after.
      const projectConfigBefore = await readTestFile(configTsPath(env.projectDir));

      // Launch edit wizard from project scope
      wizard = await EditWizard.launch({
        projectDir: env.projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: env.fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // Navigate to agents step: build (all domains) -> sources -> agents
      const sources = await wizard.build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();

      // Attempt to toggle a globally installed agent
      await agents.toggleAgent(E2E_AGENT_DISPLAY["web-developer"]);

      // Verify the toast message appeared
      const output = agents.getOutput();
      expect(output).toContain(STEP_TEXT.GLOBAL_AGENTS_BLOCKED);

      // Complete the wizard without changes
      const confirm = await agents.advance("edit");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify the global config still contains the agent (unchanged)
      const globalConfigPath = configTsPath(env.fakeHome);
      const globalConfig = await readTestFile(globalConfigPath);
      expect(globalConfig).toContain(E2E_AGENT["web-developer"].name);
      // Guard against a silent scope flip: the agent must remain global-scoped.
      expect(globalConfig).toContain('"scope":"global"');

      // Guard blocked the toggle: the project config is byte-identical to the
      // pre-edit snapshot, so no agent entry was added, removed or re-scoped.
      expect(
        await readTestFile(configTsPath(env.projectDir)),
        "a blocked agent toggle must leave the project config byte-identical",
      ).toBe(projectConfigBefore);

      // Filesystem: the agent stays compiled at global scope only — a blocked
      // toggle must not materialise a project-scope copy of it.
      await expect({ dir: env.projectDir }).not.toHaveCompiledAgents();
      await expect({ dir: env.fakeHome }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);

      expect(result.output).toContain(STEP_TEXT.EDIT_UNCHANGED);

      await result.destroy();
    },
  );
});
