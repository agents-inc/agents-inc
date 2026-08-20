import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { TIMEOUTS, TERMINAL_SIZE, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  fileExists,
  normalizeGlobalConfig,
  readAgentEntriesFor,
  readCompiledAgents,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  createGlobalOnlyEnv,
  createTestEnvironment,
  setupProjectOnlyMixedScope,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";
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
 *
 * CLI-391 pins the LOUDNESS and the no-op together: the refusal has to reach the
 * screen, and the session that saw it has to be saveable without moving a byte at
 * either scope. Both halves are asserted below — the toast on the append-only raw
 * surface, and config.ts plus the compiled agents snapshotted before the attempt and
 * compared after the save.
 *
 * The second `it` is the PERMITTED case, in this file because a refusal on its own
 * cannot tell a correctly-scoped guard from one that has swallowed the agents step
 * whole: both leave every byte in place and exit 0. The same spacebar, at the same
 * scope, on a sub-agent the PROJECT owns — which the guard must let through.
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
      // The global scope is where the refused agent actually lives, so it is the scope
      // a leaked deselect would damage — snapshot its config and compiled agents too.
      const globalConfigBefore = await readTestFile(configTsPath(env.fakeHome));
      const globalAgentsBefore = await readCompiledAgents(env.fakeHome);
      const projectAgentsBefore = await readCompiledAgents(env.projectDir);
      expect(
        Object.keys(globalAgentsBefore),
        "the setup must compile the agent globally, or the after-comparison is vacuous",
      ).toContain(`${E2E_AGENT["web-developer"].name}.md`);

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

      // Attempt to toggle a globally installed agent. The refusal is observable ONLY as
      // a toast, so the press goes through the cursor-anchored raw wait: Ink rewrites the
      // absolutely-positioned toast row in place, and the processed buffer can have lost
      // the text by the time a synchronous read lands. The wait IS the loudness assertion.
      await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["web-developer"]);
      await agents.toggleFocusedAgentAwaiting(STEP_TEXT.GLOBAL_AGENTS_BLOCKED);

      // Complete the wizard without changes
      const confirm = await agents.advance("edit");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Guard blocked the toggle: the project config is byte-identical to the
      // pre-edit snapshot, so no agent entry was added, removed or re-scoped.
      expect(
        await readTestFile(configTsPath(env.projectDir)),
        "a blocked agent toggle must leave the project config byte-identical",
      ).toBe(projectConfigBefore);
      // And the global config, where the refused agent is actually installed, is
      // byte-identical too — a project edit may not uninstall or re-scope it.
      expect(
        await readTestFile(configTsPath(env.fakeHome)),
        "a blocked agent toggle must leave the global config byte-identical",
      ).toBe(globalConfigBefore);

      // Filesystem: the compiled agents at BOTH scopes come out byte-identical. The
      // roster alone would pass on a rewrite that swapped the agent's skills or model,
      // so the comparison is on contents.
      expect(
        await readCompiledAgents(env.fakeHome),
        "a blocked agent toggle must leave the global compiled agents byte-identical",
      ).toStrictEqual(globalAgentsBefore);
      expect(
        await readCompiledAgents(env.projectDir),
        "a blocked agent toggle must not materialise a project-scope compiled agent",
      ).toStrictEqual(projectAgentsBefore);
      await expect({ dir: env.projectDir }).not.toHaveCompiledAgents();

      expect(result.output).toContain(STEP_TEXT.EDIT_UNCHANGED);

      await result.destroy();
    },
  );

  it(
    "allows the same key on a sub-agent the project owns",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // `setupProjectOnlyMixedScope` leaves api-developer owned by the project with no
      // global entry underneath it, so the guard has nothing to protect and the key that
      // was inert above must act.
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      env = { fakeHome, projectDir, destroy: () => cleanupTempDir(tempDir) };
      await setupProjectOnlyMixedScope(sourceDir, sourceTempDir, fakeHome, projectDir);

      const agentName = E2E_AGENT["api-developer"].name;
      expect(
        await readAgentEntriesFor(projectDir, agentName),
        "setup must leave the agent project-owned — a global entry would make this a refusal too",
      ).toStrictEqual([{ name: agentName, scope: "project" }]);

      const globalConfigBefore = await readTestFile(configTsPath(fakeHome));
      const globalAgentsBefore = await readCompiledAgents(fakeHome);

      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const sources = await wizard.build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      await agents.toggleAgent(E2E_AGENT["api-developer"].display);
      const confirm = await agents.advance("edit");
      const result = await confirm.confirm();

      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);

      // Config: the toggle took — the project's own entry is gone rather than tombstoned.
      expect(
        await readAgentEntriesFor(projectDir, agentName),
        "a permitted toggle must drop the project's own agent entry",
      ).toStrictEqual([]);
      // Filesystem: and the compiled file went with it.
      expect(
        await fileExists(path.join(agentsPath(projectDir), `${agentName}.md`)),
        "a dropped sub-agent's compiled file must be deleted",
      ).toBe(false);
      // The global scope stayed out of it, exactly as under the refusal above — which is
      // what makes this a control on the guard's SCOPE rather than a second removal test.
      expect(
        normalizeGlobalConfig(await readTestFile(configTsPath(fakeHome))),
        "a project-scope agent drop must not reach the global config",
      ).toStrictEqual(normalizeGlobalConfig(globalConfigBefore));
      expect(
        await readCompiledAgents(fakeHome),
        "a project-scope agent drop must not rewrite the global compiled agents",
      ).toStrictEqual(globalAgentsBefore);

      await result.destroy();
    },
  );
});
