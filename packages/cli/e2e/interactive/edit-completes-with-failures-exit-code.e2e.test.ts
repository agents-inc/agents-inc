import path from "path";
import { chmod, mkdir, rm, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  directoryExists,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import "../matchers/setup.js";

/**
 * `edit` whose work landed but whose recompile failed reports it and exits non-zero. Two sabotages
 * hit the two arms of `writeConfigAndCompile`: one agent's `.md` path occupied by a directory, and
 * the agents directory replaced by a file. The clean apply is the control and runs first.
 */

/** Dropped by each apply: the roster change proving the work landed. */
const DROPPED_SKILL_ID = E2E_SKILL.vitest.id;

const SABOTAGED_AGENT = E2E_AGENT["web-developer"].name;
const SURVIVING_AGENT = E2E_AGENT["api-developer"].name;

const INSTALLED_ID = "Failure01";
const DROPS_SKILL_ID = "Failure02";
const DROPS_AGENT_ID = "Failure03";

const on = (agent: typeof SABOTAGED_AGENT | typeof SURVIVING_AGENT) =>
  buildSeedSkill({ scope: "project", assignments: { [agent]: "lazy" } });

const PINNED_TO_PROJECT = { on: true, scope: "project" } as const;

describe("edit completes its work and exits non-zero when part of it failed", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: on(SABOTAGED_AGENT),
          [DROPPED_SKILL_ID]: on(SABOTAGED_AGENT),
          [E2E_SKILL.hono.id]: on(SURVIVING_AGENT),
        },
        agents: { [SABOTAGED_AGENT]: PINNED_TO_PROJECT, [SURVIVING_AGENT]: PINNED_TO_PROJECT },
      }),
    );
    store.publish(
      DROPS_SKILL_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: on(SABOTAGED_AGENT),
          [E2E_SKILL.hono.id]: on(SURVIVING_AGENT),
        },
        agents: { [SABOTAGED_AGENT]: PINNED_TO_PROJECT, [SURVIVING_AGENT]: PINNED_TO_PROJECT },
      }),
    );
    store.publish(
      DROPS_AGENT_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: on(SURVIVING_AGENT),
          [E2E_SKILL.hono.id]: on(SURVIVING_AGENT),
        },
        agents: { [SURVIVING_AGENT]: PINNED_TO_PROJECT },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function installProject(): Promise<ProjectHandle> {
    env = await createTestEnvironment();
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    const installed = await runInitFrom(store, INSTALLED_ID, project, source.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    return project;
  }

  /**
   * The types are written with config.ts before the recompile, so the remedy's `compile` reads this
   * roster. Both directions: absence alone passes an empty file, presence alone a `string`
   * collapse.
   */
  async function expectGeneratedTypesTrackTheRoster(projectDir: string): Promise<void> {
    expect(
      await fileExists(configTypesTsPath(projectDir)),
      "the generated pair is written with config.ts, ahead of the compile that failed",
    ).toBe(true);
    const generated = await readTestFile(configTypesTsPath(projectDir));

    expect(generated, "the surviving skill must still be a legal SkillId").toContain(
      E2E_SKILL.react.id,
    );
    expect(
      generated,
      "and the dropped one must not, or the retry checks the old roster",
    ).not.toContain(DROPPED_SKILL_ID);
  }

  async function applyWithoutExpectingSuccess(
    project: ProjectHandle,
    id: string,
  ): Promise<{ exitCode: number; rawOutput: string }> {
    prompt = new InteractivePrompt(["edit", "--from", id], project.dir, {
      ...TERMINAL_SIZE.TALL,
      env: { AGENTS_INC_API_URL: store.url, HOME: project.globalHome },
    });
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    await prompt.confirm();
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    return { exitCode, rawOutput: prompt.getRawOutput() };
  }

  it(
    "exits zero and says Done when the whole pass succeeds",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await installProject();

      const result = await applyWithoutExpectingSuccess(project, DROPS_SKILL_ID);

      expect(result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      expect(result.rawOutput).toContain(STEP_TEXT.EDIT_SUCCESS);
      expect(result.rawOutput).not.toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);

      // Subject guard: this apply really writes a config and compiles both sub-agents.
      await expect(project).toHaveConfig({ skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id] });
      expect(await readTestFile(configTsPath(project.dir))).not.toContain(DROPPED_SKILL_ID);
      await expectGeneratedTypesTrackTheRoster(project.dir);
      await expect(project).toHaveCompiledAgent(SABOTAGED_AGENT);
      await expect(project).toHaveCompiledAgent(SURVIVING_AGENT);
    },
  );

  it(
    "names the sub-agent that would not compile, keeps the rest, and exits non-zero",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await installProject();

      // Occupies the compiled `.md` path so only that write fails; non-empty so nothing disposes of
      // it.
      const occupiedAgentPath = path.join(
        project.dir,
        DIRS.CLAUDE,
        DIRS.AGENTS,
        `${SABOTAGED_AGENT}.md`,
      );
      await rm(occupiedAgentPath, { force: true });
      await mkdir(occupiedAgentPath, { recursive: true });
      await writeFile(path.join(occupiedAgentPath, "occupied"), "not an agent\n");

      const result = await applyWithoutExpectingSuccess(project, DROPS_SKILL_ID);

      expect(result.exitCode, result.rawOutput).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);

      const output = result.rawOutput;
      expect(output).toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);
      expect(output).toContain(`${STEP_TEXT.AGENTS_NOT_COMPILED}: ${SABOTAGED_AGENT}`);
      expect(output).toContain(STEP_TEXT.RECOMPILE_STALE_REMEDY);
      // A scope with no sub-agent must contribute no warning.
      expect(
        output,
        "a scope with nothing to compile is not a warning beside the one sub-agent that failed",
      ).not.toContain("No agents found to recompile");

      await expect(project).toHaveConfig({ skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id] });
      expect(await readTestFile(configTsPath(project.dir))).not.toContain(DROPPED_SKILL_ID);
      await expectGeneratedTypesTrackTheRoster(project.dir);
      await expect(project).toHaveCompiledAgent(SURVIVING_AGENT);
      expect(await directoryExists(occupiedAgentPath)).toBe(true);
    },
  );

  // The removal arm: `cleanupStaleAgentFiles` runs after compile, so the agents directory is made
  // read-only to fail its unlink; the run reports both arms.
  it(
    "names a stale sub-agent file it could not delete, with the recovery, and exits non-zero",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await installProject();
      const agentsDir = path.join(project.dir, DIRS.CLAUDE, DIRS.AGENTS);
      // Control: the file to remove really exists.
      expect(await fileExists(path.join(agentsDir, `${SABOTAGED_AGENT}.md`))).toBe(true);

      await chmod(agentsDir, 0o555);
      try {
        const result = await applyWithoutExpectingSuccess(project, DROPS_AGENT_ID);

        expect(result.exitCode, result.rawOutput).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
        const output = result.rawOutput;
        expect(output).toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);
        expect(output).toContain(`${SABOTAGED_AGENT}.md`);
        expect(output).toContain(STEP_TEXT.DELETE_AGENT_FILE_REMEDY);
      } finally {
        await chmod(agentsDir, 0o755);
      }
    },
  );

  it(
    "reports the recompile that threw, with the command that finishes it, and exits non-zero",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await installProject();

      // A file where the agents directory belongs: the pass throws before any per-agent outcome.
      const agentsDir = path.join(project.dir, DIRS.CLAUDE, DIRS.AGENTS);
      await rm(agentsDir, { recursive: true, force: true });
      await writeFile(agentsDir, "not a directory\n");

      const result = await applyWithoutExpectingSuccess(project, DROPS_SKILL_ID);

      expect(result.exitCode, result.rawOutput).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);

      const output = result.rawOutput;
      expect(output).toContain(STEP_TEXT.RECOMPILATION_FAILED);
      expect(output).toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);
      expect(output).toContain(STEP_TEXT.RECOMPILE_STALE_REMEDY);

      // The config write precedes the recompile, which is why this is not a hard error.
      await expect(project).toHaveConfig({ skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id] });
      expect(await readTestFile(configTsPath(project.dir))).not.toContain(DROPPED_SKILL_ID);
      await expectGeneratedTypesTrackTheRoster(project.dir);
    },
  );
});
