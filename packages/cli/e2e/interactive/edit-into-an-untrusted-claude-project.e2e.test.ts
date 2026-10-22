import { realpathSync } from "node:fs";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment, readAgentEntries } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_BUILTIN_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { declareAStopHook } from "../helpers/declared-stop-hook.js";
import {
  acceptClaudeTrustPrompt,
  cleanupFixture,
  cleanupTempDir,
  readCompiledAgents,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";

/**
 * An `edit --from` that lands a sub-agent with a Stop hook in an untrusted Claude project must say
 * the folder needs trusting, as `init` and `compile` do: Claude Code drops a project sub-agent's
 * hooks until trusted. Controls: a trusted folder, and an untrusted one whose last gated sub-agent
 * the edit removed.
 */

/** Each project declares a Stop hook for it. */
const WRITER = E2E_AGENT["web-developer"].name;

/** Declares no hook, so nothing owed. */
const READER = E2E_BUILTIN_AGENT.reviewer.name;

const SKILL = E2E_SKILL.react;

const INSTALLED_ID = "TrustEd01";
const APPLIED_ID = "TrustEd02";

const READER_ONLY = buildSeedPayload({
  skills: {
    [SKILL.id]: buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [READER]: "lazy" },
    }),
  },
  agents: { [READER]: { on: true, scope: "project" } },
});

const READER_AND_WRITER = buildSeedPayload({
  skills: {
    [SKILL.id]: buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [READER]: "lazy", [WRITER]: "lazy" },
    }),
  },
  agents: {
    [READER]: { on: true, scope: "project" },
    [WRITER]: { on: true, scope: "project" },
  },
});

describe("edit into a Claude project Claude Code has not been told to trust", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  it(
    "names the folder when an applied configuration adds the project's first gated sub-agent",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await createTestEnvironment();
      tempDirs.push(env.tempDir);
      const project: ProjectHandle = { dir: env.projectDir, globalHome: env.fakeHome };
      await declareAStopHook(project.dir, WRITER);

      store.publish(INSTALLED_ID, READER_ONLY);
      const installed = await runInitFrom(store, INSTALLED_ID, project, source.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      // Nothing owed yet, so the edit is the first run with something to say.
      await expect(project).toHaveAgentFrontmatter(READER, { completionGate: false });
      expect(installed.output).not.toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);

      store.publish(APPLIED_ID, READER_AND_WRITER);
      prompt = new InteractivePrompt(["edit", "--from", APPLIED_ID], project.dir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      // Raw: the line is wider than the terminal and wraps.
      const output = prompt.getRawOutput();
      expect(exitCode, `apply failed: ${output}`).toBe(EXIT_CODES.SUCCESS);

      expect(await readAgentEntries(project.dir)).toStrictEqual(
        buildAgentConfigs([READER, WRITER], { scope: "project" }),
      );
      expect(Object.keys(await readCompiledAgents(project.dir))).toStrictEqual([
        `${READER}.md`,
        `${WRITER}.md`,
      ]);
      await expect(project).toHaveAgentFrontmatter(WRITER, { completionGate: true });

      expect(output).toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);
      expect(output).toContain(realpathSync(project.dir));
    },
  );

  it(
    "says nothing once Claude Code's state file records the folder as trusted",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await createTestEnvironment();
      tempDirs.push(env.tempDir);
      const project: ProjectHandle = { dir: env.projectDir, globalHome: env.fakeHome };
      await declareAStopHook(project.dir, WRITER);

      store.publish(INSTALLED_ID, READER_ONLY);
      const installed = await runInitFrom(store, INSTALLED_ID, project, source.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      await acceptClaudeTrustPrompt(env.fakeHome, env.projectDir);

      store.publish(APPLIED_ID, READER_AND_WRITER);
      prompt = new InteractivePrompt(["edit", "--from", APPLIED_ID], project.dir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      const output = prompt.getRawOutput();
      expect(exitCode, `apply failed: ${output}`).toBe(EXIT_CODES.SUCCESS);

      // The gate is compiled and the run finished, so only the trust record can have silenced the
      // line.
      await expect(project).toHaveAgentFrontmatter(WRITER, { completionGate: true });
      expect(output).toContain(STEP_TEXT.EDIT_SUCCESS);
      expect(output).not.toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);
    },
  );

  it(
    "says nothing once an edit removes the project's last gated sub-agent",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await createTestEnvironment();
      tempDirs.push(env.tempDir);
      const project: ProjectHandle = { dir: env.projectDir, globalHome: env.fakeHome };
      await declareAStopHook(project.dir, WRITER);

      store.publish(INSTALLED_ID, READER_AND_WRITER);
      const installed = await runInitFrom(store, INSTALLED_ID, project, source.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      // Untrusted and reported at install, so only the edit can change that.
      expect(installed.output).toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);

      store.publish(APPLIED_ID, READER_ONLY);
      prompt = new InteractivePrompt(["edit", "--from", APPLIED_ID], project.dir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      const output = prompt.getRawOutput();
      expect(exitCode, `apply failed: ${output}`).toBe(EXIT_CODES.SUCCESS);

      // The gated sub-agent left the config and its file was deleted, so no gate remains.
      expect(await readAgentEntries(project.dir)).toStrictEqual(
        buildAgentConfigs([READER], { scope: "project" }),
      );
      expect(Object.keys(await readCompiledAgents(project.dir))).toStrictEqual([`${READER}.md`]);
      await expect(project).toHaveAgentFrontmatter(READER, { completionGate: false });
      expect(output).toContain(STEP_TEXT.EDIT_SUCCESS);
      expect(output).not.toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);
    },
  );
});
