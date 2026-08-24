import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupTempDir,
  configTypesTsPath,
  directoryExists,
  listFiles,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";

/**
 * `init`'s third ending: the install landed, a sub-agent would not compile, and the exit code
 * says so.
 *
 * This is the same ending `edit` took on 2026-08-20, reached from the other side and in a worse
 * form. `init` read `compileResult.compiled` and NEVER `.failed` or `.warnings`, so it printed
 * `Compiled N agents` — counting successes only, which makes the number look right — then
 * `initialized successfully!` and exited 0. A sub-agent missing from a user's FIRST install
 * reached no surface at all: not the count, not a warning, not the exit code.
 *
 * The compile is the last thing `init` does, so a failure there cannot be answered by aborting:
 * the skills are copied, `config.ts` and `config-types.ts` are written, and there is nothing
 * left to continue to. What was missing is the other half of the report.
 *
 * `--from` is the driver rather than the wizard because this run must complete over a pipe: the
 * sabotage is on disk before the process starts and the whole flow is non-interactive, so what
 * is asserted is the command's own output rather than a PTY frame's.
 *
 * **The clean pass is the control and is not optional.** Every assertion below reads the same
 * against a command that had simply started exiting non-zero for its own reasons, and only the
 * same flow over an unsabotaged tree separates "this failure is reported" from "this command
 * fails". It is first so a fixture that never compiled anything reddens there rather than
 * masquerading as coverage in the case beneath it.
 */

/** The sub-agent whose compiled file the sabotage occupies, and the one that must survive it. */
const SABOTAGED_AGENT = E2E_AGENT["web-developer"].name;
const SURVIVING_AGENT = E2E_AGENT["api-developer"].name;

/**
 * A payload as the web app builds it. The version is a literal rather than the vendored
 * `SEED_VERSION`, exactly as in the sibling `--from` specs: this spec drives the wire contract,
 * so it has to fail while the CLI is still on the old one instead of following it.
 */
function seedPayload() {
  return {
    v: 5,
    matrixVersion: "1.0.0",
    stackId: null,
    skills: {
      // Eject, because the E2E source is local and has no marketplace — plugin mode legitimately
      // refuses that, which is its own (correct) error rather than anything this path controls.
      [E2E_SKILL.react.id]: {
        install: "eject",
        scope: "project",
        assignments: { [SABOTAGED_AGENT]: "lazy" },
      },
      [E2E_SKILL.hono.id]: {
        install: "eject",
        scope: "project",
        assignments: { [SURVIVING_AGENT]: "lazy" },
      },
    },
    // Both pinned to the project, which is the only scope this fixture can sabotage: a sub-agent
    // taking the shared default compiles into the user's own ~/.claude instead.
    agents: {
      [SABOTAGED_AGENT]: { scope: "project" },
      [SURVIVING_AGENT]: { scope: "project" },
    },
  };
}

describe("init completes its install and exits non-zero when a sub-agent would not compile", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /**
   * The state change every case here completes, asserted on the three surfaces the output is
   * not. It is what makes this ending a partial APPLY rather than a refusal: the config the
   * failure account tells the user to `compile` from is on disk and describes the roster the
   * run just installed.
   */
  async function expectTheInstallLanded(projectDir: string): Promise<void> {
    const config = await loadConfigOrFail(projectDir);
    expect(config.skills, "surface 3 — the install wrote its own roster").toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id, E2E_SKILL.hono.id]),
    );

    // Surface 4, and the half that makes the remedy real: `writeProjectConfig` emits the pair
    // ahead of the compile, so the `compile` the failure account names has a type surface for
    // THIS roster to check against. Both directions, because the presence alone is satisfied by
    // a `string` collapse and the absence alone by an empty file.
    const generated = await readTestFile(configTypesTsPath(projectDir));
    expect(generated, "the installed skill must be a legal SkillId").toContain(E2E_SKILL.react.id);
    expect(generated, "and the sub-agent roster must be a real union").toContain(SURVIVING_AGENT);
  }

  it("exits zero and says so when the whole pass compiles", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("InitClean1", seedPayload());

    const { exitCode, output } = await runInitFrom(
      store,
      "InitClean1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode, `init output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
    expect(output).not.toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);

    // The subject guard for the case below: this flow really does compile both sub-agents into
    // the project, so a sabotage that stops one of them is stopping something that happens.
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual(
      [`${SABOTAGED_AGENT}.md`, `${SURVIVING_AGENT}.md`].sort(),
    );
    await expect({ dir: env.projectDir }).toHaveCompiledAgent(SABOTAGED_AGENT);
    await expect({ dir: env.projectDir }).toHaveCompiledAgent(SURVIVING_AGENT);
    await expectTheInstallLanded(env.projectDir);
  });

  it("names the sub-agent that would not compile, keeps the rest, and exits non-zero", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("InitFailed1", seedPayload());

    // A directory where the compiled `.md` belongs: writing that one sub-agent fails, every
    // other agent in the same pass is written normally. Non-empty so nothing can quietly dispose
    // of it on the way past.
    const occupiedAgentPath = path.join(
      env.projectDir,
      DIRS.CLAUDE,
      DIRS.AGENTS,
      `${SABOTAGED_AGENT}.md`,
    );
    await mkdir(occupiedAgentPath, { recursive: true });
    await writeFile(path.join(occupiedAgentPath, "occupied"), "not an agent\n");

    const { exitCode, output } = await runInitFrom(
      store,
      "InitFailed1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    expect(exitCode, `init output:\n${output}`).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);

    // Surface 2, and the whole of what this row is about: the failure is named, the remedy is
    // named, and the tick that used to sit over both is withdrawn.
    expect(output).toContain(`${STEP_TEXT.AGENTS_NOT_COMPILED}: ${SABOTAGED_AGENT}`);
    // The `(N failed)` qualifier `init` appends to its compile count. It went unpinned while it
    // had no `STEP_TEXT` member, because adding one moves a count `check-enumeration-drift.ts`
    // registers against two documents; the member landed with both, so the count is now held to
    // the sabotage — exactly one sub-agent was stopped, and a run reporting any other number is
    // wrong in a way a count-free fragment could not see.
    expect(
      output,
      "the compile count must say how many sub-agents did not land, not just that some did",
    ).toContain(STEP_TEXT.COMPILED_WITH_FAILURES);
    expect(output).toContain(STEP_TEXT.COMPLETED_WITH_FAILURES);
    expect(output).toContain(STEP_TEXT.RECOMPILE_STALE_REMEDY);
    expect(
      output,
      "a tick over an install missing a sub-agent is the claim being withdrawn, not a line beside it",
    ).not.toContain(STEP_TEXT.INIT_SUCCESS);

    // The install finished: the sub-agent the sabotage did not touch is compiled, the occupied
    // path is still the directory it was, and the config pair describes what landed.
    await expect({ dir: env.projectDir }).toHaveCompiledAgent(SURVIVING_AGENT);
    expect(await directoryExists(occupiedAgentPath)).toBe(true);
    await expectTheInstallLanded(env.projectDir);
  });
});
