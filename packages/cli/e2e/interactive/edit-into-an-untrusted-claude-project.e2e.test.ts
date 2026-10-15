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
 * Journey 79 through `edit --from`: an apply that lands a writing sub-agent in a Claude project
 * Claude Code has not been told to trust says the folder must be trusted, as `init` and `compile`
 * already say about the same tree.
 *
 * Compile gives every sub-agent holding `Write` or `Edit` a completion gate, a `Stop` hook, and
 * Claude Code drops a PROJECT sub-agent's hooks until its state file records the folder as
 * trusted, saying so nowhere a user reads. The apply is driven into an untrusted folder, and its
 * line is the assertion that carries the red against a binary whose `edit` never asks.
 *
 * Two controls sit beside it and pass either way, because each pins a state that must stay
 * silent: a trusted folder with the gate compiled, and an untrusted folder whose last gated
 * sub-agent the edit removed. The first catches a line printed regardless of trust; the second
 * catches one asked about the tree before the removed sub-agent's file is deleted.
 *
 * Reverting `src/` cannot show a silence assertion failing, so both were checked against a binary
 * that does speak: the trust control by dropping its trust record from the fixture, and the
 * removal control by asking before the stale file is deleted. Each went red on its own
 * `not.toContain` and on nothing else.
 */

/** The writing sub-agent a shared configuration adds: compile gives it the gate. */
const WRITER = E2E_AGENT["web-developer"].name;

/** A sub-agent holding neither tool, so compile gives it no gate and a project of it owes nothing. */
const READER = E2E_BUILTIN_AGENT.reviewer.name;

const SKILL = E2E_SKILL.react;

const INSTALLED_ID = "TrustEd01";
const APPLIED_ID = "TrustEd02";

/** A project whose one sub-agent writes nothing, holding one ejected skill. */
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

/** The same project with the writing sub-agent beside it, holding the same skill. */
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
    "names the folder when an applied configuration adds the project's first writing sub-agent",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await createTestEnvironment();
      tempDirs.push(env.tempDir);
      const project: ProjectHandle = { dir: env.projectDir, globalHome: env.fakeHome };

      store.publish(INSTALLED_ID, READER_ONLY);
      const installed = await runInitFrom(store, INSTALLED_ID, project, source.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      // Nothing was owed yet: the one sub-agent writes nothing and carries no gate, so the edit
      // below is the first run that has anything to say.
      await expect(project).toHaveAgentFrontmatter(READER, { completionGate: false });
      expect(installed.output).not.toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);

      store.publish(APPLIED_ID, READER_AND_WRITER);
      prompt = new InteractivePrompt(["edit", "--from", APPLIED_ID], project.dir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      // Raw, because the line is longer than the terminal is wide and the screen buffer wraps it.
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

      // The gate is compiled and the run got to its end, so the trust record is the one input
      // that can have silenced the line.
      await expect(project).toHaveAgentFrontmatter(WRITER, { completionGate: true });
      expect(output).toContain(STEP_TEXT.EDIT_SUCCESS);
      expect(output).not.toContain(STEP_TEXT.CLAUDE_FOLDER_UNTRUSTED);
    },
  );

  it(
    "says nothing once an edit removes the project's last writing sub-agent",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const env = await createTestEnvironment();
      tempDirs.push(env.tempDir);
      const project: ProjectHandle = { dir: env.projectDir, globalHome: env.fakeHome };

      store.publish(INSTALLED_ID, READER_AND_WRITER);
      const installed = await runInitFrom(store, INSTALLED_ID, project, source.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      // The folder is untrusted and the install said so, so only the edit below can change that.
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

      // The departure, on both surfaces: the writing sub-agent left the config and its compiled
      // file was deleted, so the tree as it now stands holds no gate.
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
