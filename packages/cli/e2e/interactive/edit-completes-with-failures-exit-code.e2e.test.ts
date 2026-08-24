import path from "path";
import { chmod, mkdir, rm, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  configTsPath,
  configTypesTsPath,
  directoryExists,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * `edit`'s third ending: the work landed, part of it failed, and the exit code says so.
 *
 * The recompile is the LAST thing `edit` does, so a failure there cannot be answered by
 * aborting — the config write, the plugin registrations and the copied skills are already on
 * disk, and there is nothing left to continue to. What was missing is the other half: a
 * `this.warn` leaves the process at exit 0, so a scripted `edit` reported success over compiled
 * agents that had gone stale.
 *
 * Two failures are driven, both by sabotaging the compile target on disk before the session
 * starts — a compiled agent's `.md` replaced by a directory (that one sub-agent refuses to be
 * written, the rest of the pass succeeds), and the agents directory itself replaced by a file
 * (the whole pass throws before it reports on anything). They exercise the two distinct arms of
 * `writeConfigAndCompile`.
 *
 * The clean pass is the control and is not optional: every assertion below would read the same
 * against a command that had started exiting non-zero for its own reasons, and only a run of the
 * same flow over an unsabotaged tree separates "this failure is reported" from "this command
 * fails". It is first so a fixture that never compiled anything reddens there rather than
 * masquerading as coverage in the two beneath it.
 */

/**
 * A skill the config claims and the source does not carry. The wizard cannot represent it, so
 * it drops out — which is the roster CHANGE each run below completes, and therefore the state
 * change proving the work landed before the compile failed.
 */
const DROPPED_SKILL_ID = "web-styling-tailwind";

/** The sub-agent whose compiled file each sabotage aims at, and the one that must survive it. */
const SABOTAGED_AGENT = E2E_AGENT["web-developer"].name;
const SURVIVING_AGENT = E2E_AGENT["api-developer"].name;

describe("edit completes its work and exits non-zero when part of it failed", () => {
  let source: E2ESource;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  /** The fixture every case here edits: two sub-agents, and one roster change to complete. */
  async function buildProject(): Promise<{ dir: string }> {
    return ProjectBuilder.editable({
      skills: [E2E_SKILL.react.id],
      unresolvableSkills: [DROPPED_SKILL_ID],
      agents: [...E2E_AGENTS.WEB_AND_API],
      domains: ["web", "api"],
    });
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
    // Named before it is read: the fixture ships no `config-types.ts`, so an absent file here is
    // a run that never regenerated the pair rather than a run that regenerated it wrongly, and
    // an unhandled read error would report neither.
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

  /** Drive the wizard straight through to the install without waiting on a success banner. */
  async function saveWithoutExpectingSuccess(projectDir: string) {
    wizard = await EditWizard.launch({ projectDir, source, ...TERMINAL_SIZE.TALL });
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    const agents = await sources.acceptDefaults();
    const confirm = await agents.acceptDefaults("edit");
    return confirm.confirmExpectingExit();
  }

  /** The same drive, but dropping a sub-agent on the way, so a compiled file goes stale. */
  async function dropAgentWithoutExpectingSuccess(projectDir: string, agentName: string) {
    wizard = await EditWizard.launch({ projectDir, source, ...TERMINAL_SIZE.TALL });
    const sources = await wizard.build.passThroughAllDomainsGeneric();
    const agents = await sources.acceptDefaults();
    await agents.toggleAgent(agentName);
    const confirm = await agents.acceptDefaults("edit");
    return confirm.confirmExpectingExit();
  }

  it(
    "exits zero and says Done when the whole pass succeeds",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await buildProject();

      const result = await saveWithoutExpectingSuccess(project.dir);

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(result.rawOutput).toContain(STEP_TEXT.EDIT_SUCCESS);
      expect(result.rawOutput).not.toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);

      // Both halves of the state change, and the subject guard for the two cases below: this
      // flow really does write a config and compile both sub-agents, so a sabotage that stops
      // one of them is stopping something that otherwise happens.
      await expect(result.project).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
      expect(await readTestFile(configTsPath(project.dir))).not.toContain(DROPPED_SKILL_ID);
      await expectGeneratedTypesTrackTheRoster(project.dir);
      await expect(result.project).toHaveCompiledAgent(SABOTAGED_AGENT);
      await expect(result.project).toHaveCompiledAgent(SURVIVING_AGENT);
    },
  );

  it(
    "names the sub-agent that would not compile, keeps the rest, and exits non-zero",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await buildProject();

      // A directory where the compiled `.md` belongs: writing that one sub-agent fails, every
      // other agent in the same pass is written normally. Non-empty so nothing can quietly
      // dispose of it on the way past.
      const occupiedAgentPath = path.join(
        project.dir,
        DIRS.CLAUDE,
        DIRS.AGENTS,
        `${SABOTAGED_AGENT}.md`,
      );
      await mkdir(occupiedAgentPath, { recursive: true });
      await writeFile(path.join(occupiedAgentPath, "occupied"), "not an agent\n");

      const result = await saveWithoutExpectingSuccess(project.dir);

      expect(await result.exitCode).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);

      const output = result.rawOutput;
      expect(output).toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);
      expect(output).toContain(`${STEP_TEXT.AGENTS_NOT_COMPILED}: ${SABOTAGED_AGENT}`);
      expect(output).toContain(STEP_TEXT.RECOMPILE_STALE_REMEDY);

      // The command finished its work: the roster change is in config.ts and the sub-agent the
      // sabotage did not touch was compiled.
      await expect(result.project).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
      expect(await readTestFile(configTsPath(project.dir))).not.toContain(DROPPED_SKILL_ID);
      await expectGeneratedTypesTrackTheRoster(project.dir);
      await expect(result.project).toHaveCompiledAgent(SURVIVING_AGENT);
      expect(await directoryExists(occupiedAgentPath)).toBe(true);
    },
  );

  // The REMOVAL arm, which no spec reached until 2026-08-23. `cleanupStaleAgentFiles` runs after
  // `writeConfigAndCompile`, so the two cases above walk straight past it: they sabotage the
  // compile target, and a pass that fails to compile has nothing stale left to delete. The only
  // thing naming `DELETE_AGENT_FILE` was a ROSTER entry in `failure-reporting-classification`,
  // which pins that some site names the member and not that the site works.
  //
  // Sabotaged the way the hand-run reached it: a clean pass first, so a compiled file exists to go
  // stale, then the agents directory made read-only so the unlink of the sub-agent this second
  // pass drops fails. The read-only directory stops writes too, so the run reports both arms —
  // this asserts the removal one is among them, which is the half nothing covered.
  it(
    "names a stale sub-agent file it could not delete, with the recovery, and exits non-zero",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const project = await buildProject();

      // The control: a first pass that really does compile the file the second must remove.
      // Without it a removal that was never attempted would satisfy everything below for free.
      const clean = await saveWithoutExpectingSuccess(project.dir);
      expect(await clean.exitCode).toBe(EXIT_CODES.SUCCESS);
      const agentsDir = path.join(project.dir, DIRS.CLAUDE, DIRS.AGENTS);
      expect(await fileExists(path.join(agentsDir, `${SABOTAGED_AGENT}.md`))).toBe(true);

      await chmod(agentsDir, 0o555);
      try {
        const result = await dropAgentWithoutExpectingSuccess(
          project.dir,
          E2E_AGENT["web-developer"].display,
        );

        expect(await result.exitCode).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
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
      const project = await buildProject();

      // A file where the agents directory belongs: the pass cannot even open its target, so it
      // throws before producing a per-agent outcome — the other arm of the same reporting.
      const agentsDir = path.join(project.dir, DIRS.CLAUDE, DIRS.AGENTS);
      await rm(agentsDir, { recursive: true, force: true });
      await writeFile(agentsDir, "not a directory\n");

      const result = await saveWithoutExpectingSuccess(project.dir);

      expect(await result.exitCode).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);

      const output = result.rawOutput;
      expect(output).toContain(STEP_TEXT.RECOMPILATION_FAILED);
      expect(output).toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);
      expect(output).toContain(STEP_TEXT.RECOMPILE_STALE_REMEDY);

      // The config write happens before the recompile and is what a `compile` would read, so it
      // must have landed — that is the whole reason this is not a hard error.
      await expect(result.project).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
      expect(await readTestFile(configTsPath(project.dir))).not.toContain(DROPPED_SKILL_ID);
      await expectGeneratedTypesTrackTheRoster(project.dir);
    },
  );
});
