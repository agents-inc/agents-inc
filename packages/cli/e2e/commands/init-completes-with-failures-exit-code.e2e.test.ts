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
import { PINNED_WIRE_VERSION } from "../fixtures/seed-wire-contract.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";

/**
 * `init` whose install landed but a sub-agent would not compile reports the failure and exits
 * non-zero. Driven by `--from` so the output is the command's own. The clean pass is the control
 * and runs first.
 */

const SABOTAGED_AGENT = E2E_AGENT["web-developer"].name;
const SURVIVING_AGENT = E2E_AGENT["api-developer"].name;

function seedPayload() {
  return buildSeedPayload({
    v: PINNED_WIRE_VERSION,
    skills: {
      // Eject: the local E2E source has no marketplace for plugins.
      [E2E_SKILL.react.id]: buildSeedSkill({
        install: "eject",
        scope: "project",
        assignments: { [SABOTAGED_AGENT]: "lazy" },
      }),
      [E2E_SKILL.hono.id]: buildSeedSkill({
        install: "eject",
        scope: "project",
        assignments: { [SURVIVING_AGENT]: "lazy" },
      }),
    },
    // Pinned to the project, the only scope this fixture can sabotage.
    agents: {
      [SABOTAGED_AGENT]: { scope: "project" },
      [SURVIVING_AGENT]: { scope: "project" },
    },
  });
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
   * The install landed on the surfaces the output is not, so this is a partial apply rather than a
   * refusal.
   */
  async function expectTheInstallLanded(projectDir: string): Promise<void> {
    const config = await loadConfigOrFail(projectDir);
    expect(config.skills, "surface 3 — the install wrote its own roster").toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id, E2E_SKILL.hono.id], {
        scope: "project",
        origin: "eject",
      }),
    );

    // `writeProjectConfig` emits the types before compile, so the remedy's `compile` has a surface
    // for this roster. Both directions: presence alone passes a `string` collapse, absence alone an
    // empty file.
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

    // Subject guard: this flow really compiles both sub-agents.
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

    // Occupies the compiled `.md` path so only that write fails; non-empty so nothing disposes of
    // it.
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

    expect(output).toContain(`${STEP_TEXT.AGENTS_NOT_COMPILED}: ${SABOTAGED_AGENT}`);
    // Held to the sabotage: exactly one sub-agent was stopped.
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
    // The global pass has no sub-agent here and must contribute no warning.
    expect(
      output,
      "a scope with nothing to compile is not a warning beside the one sub-agent that failed",
    ).not.toContain("No agents found to recompile");

    await expect({ dir: env.projectDir }).toHaveCompiledAgent(SURVIVING_AGENT);
    expect(await directoryExists(occupiedAgentPath)).toBe(true);
    await expectTheInstallLanded(env.projectDir);
  });
});
