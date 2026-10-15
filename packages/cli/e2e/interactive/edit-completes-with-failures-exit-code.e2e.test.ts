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
 * `edit`'s third ending: the work landed, part of it failed, and the exit code says so.
 *
 * The recompile is the LAST thing `edit --from` does, so a failure there cannot be answered by
 * aborting — the config write, the plugin registrations and the copied skills are already on
 * disk, and there is nothing left to continue to. What was missing is the other half: a
 * `this.warn` leaves the process at exit 0, so a scripted `edit` reported success over compiled
 * agents that had gone stale.
 *
 * Two failures are driven, both by sabotaging the compile target on disk before the apply
 * starts — a compiled agent's `.md` replaced by a directory (that one sub-agent refuses to be
 * written, the rest of the pass succeeds), and the agents directory itself replaced by a file
 * (the whole pass throws before it reports on anything). They exercise the two distinct arms of
 * `writeConfigAndCompile`.
 *
 * The clean apply is the control and is not optional: every assertion below would read the same
 * against a command that had started exiting non-zero for its own reasons, and only the same
 * apply over an unsabotaged tree separates "this failure is reported" from "this command fails".
 * It is first so a fixture that never compiled anything reddens there rather than masquerading as
 * coverage in the cases beneath it.
 */

/** The skill each apply below leaves out — the roster change proving the work landed. */
const DROPPED_SKILL_ID = E2E_SKILL.vitest.id;

/** The sub-agent whose compiled file each sabotage aims at, and the one that must survive it. */
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
    // Two project sub-agents, and the skill each apply below drops.
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

  /** The installation every case here applies over: two sub-agents, both compiled. */
  async function installProject(): Promise<ProjectHandle> {
    env = await createTestEnvironment();
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    const installed = await runInitFrom(store, INSTALLED_ID, project, source.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    return project;
  }

  /**
   * Surface 4, and the half that makes the remedy this ending prints a real one.
   *
   * `writeProjectConfig` emits `config.ts` and `config-types.ts` together, ahead of the
   * recompile, so a run that fails at the compile still leaves a generated pair describing the
   * roster it just wrote — which is exactly what the `compile` the failure account names goes on
   * to read. A pair still naming the dropped skill would type-check a config that no longer
   * carries it, and the retry would be run against a type surface for the previous roster.
   *
   * Both directions, because either alone is satisfied by a file that says nothing: the absence
   * proves the departure landed and the presence proves the file is a real union rather than an
   * empty one or a `string` collapse.
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

  /** Applies `id` over `project` at a real terminal, answering yes, without expecting success. */
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

      // Both halves of the state change, and the subject guard for the cases below: this
      // apply really does write a config and compile both sub-agents, so a sabotage that stops
      // one of them is stopping something that otherwise happens.
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

      // A directory where the compiled `.md` belongs: writing that one sub-agent fails, every
      // other agent in the same pass is written normally. Non-empty so nothing can quietly
      // dispose of it on the way past.
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
      // The failure report prints the pass's warnings, and a scope with no sub-agent to compile
      // used to contribute one, right under a count that says the other sub-agent compiled.
      expect(
        output,
        "a scope with nothing to compile is not a warning beside the one sub-agent that failed",
      ).not.toContain("No agents found to recompile");

      // The command finished its work: the roster change is in config.ts and the sub-agent the
      // sabotage did not touch was compiled.
      await expect(project).toHaveConfig({ skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id] });
      expect(await readTestFile(configTsPath(project.dir))).not.toContain(DROPPED_SKILL_ID);
      await expectGeneratedTypesTrackTheRoster(project.dir);
      await expect(project).toHaveCompiledAgent(SURVIVING_AGENT);
      expect(await directoryExists(occupiedAgentPath)).toBe(true);
    },
  );

  // The REMOVAL arm. `cleanupStaleAgentFiles` runs after `writeConfigAndCompile`, so the case
  // above walks straight past it: it sabotages the compile target, and a pass that fails to
  // compile has nothing stale left to delete.
  //
  // The install compiled the file this apply drops, then the agents directory is made read-only
  // so its unlink fails. The read-only directory stops writes too, so the run reports both arms —
  // this asserts the removal one is among them, which is the half nothing else covers.
  it(
    "names a stale sub-agent file it could not delete, with the recovery, and exits non-zero",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await installProject();
      const agentsDir = path.join(project.dir, DIRS.CLAUDE, DIRS.AGENTS);
      // The control: the file the apply must remove really exists. Without it a removal that was
      // never attempted would satisfy everything below for free.
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

      // A file where the agents directory belongs: the pass cannot even open its target, so it
      // throws before producing a per-agent outcome — the other arm of the same reporting.
      const agentsDir = path.join(project.dir, DIRS.CLAUDE, DIRS.AGENTS);
      await rm(agentsDir, { recursive: true, force: true });
      await writeFile(agentsDir, "not a directory\n");

      const result = await applyWithoutExpectingSuccess(project, DROPS_SKILL_ID);

      expect(result.exitCode, result.rawOutput).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);

      const output = result.rawOutput;
      expect(output).toContain(STEP_TEXT.RECOMPILATION_FAILED);
      expect(output).toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);
      expect(output).toContain(STEP_TEXT.RECOMPILE_STALE_REMEDY);

      // The config write happens before the recompile and is what a `compile` would read, so it
      // must have landed — that is the whole reason this is not a hard error.
      await expect(project).toHaveConfig({ skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id] });
      expect(await readTestFile(configTsPath(project.dir))).not.toContain(DROPPED_SKILL_ID);
      await expectGeneratedTypesTrackTheRoster(project.dir);
    },
  );
});
