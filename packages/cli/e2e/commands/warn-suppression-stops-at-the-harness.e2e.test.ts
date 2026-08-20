import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { CLI } from "../fixtures/cli.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  readTestFile,
  renderMetadataYaml,
  runCLI,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * `warn({ suppressInTest: true })` exists to keep the UNIT suite quiet. It must not
 * follow the binary into an E2E run: a spawned `bin/run.js` is a user's binary and has
 * to print what a user would be shown, or a spec asserting one of these lines passes by
 * not looking.
 *
 * Each door builds the child's environment itself and is therefore proved separately —
 * `CLI.run` and `runCLI` through execa, and every PTY page object through
 * `TerminalSession`, reached here via `InteractivePrompt`, the sanctioned non-wizard
 * entry point. `runCLI` was the door nothing proved: it cleared none of the roster, so
 * every command it spawned ran with the harness's `VITEST` and answered a spec about a
 * warning it had been told not to print.
 *
 * The subject is the stack advisory `resolveAgentConfigToSkills`
 * (`src/cli/lib/stacks/stacks-loader.ts`) prints for a stack id no loaded catalogue
 * declares. `compile` reaches it through `getStackSkillIds`, so a hand-written
 * `config.ts` is the whole fixture — and the skill IS installed on disk, which keeps
 * `SKILL_NOT_FOUND_WARNING` (the unsuppressed sibling, for an id with no files) out of
 * the output and leaves the suppressed line as the only thing the assertion can match.
 */
describe("a warning the unit suite suppresses still reaches the user through the binary", () => {
  const AGENT_NAME = E2E_AGENT["web-developer"].name;
  let tempDir: string | undefined;

  beforeAll(ensureBinaryExists, TIMEOUTS.SETUP);

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  /**
   * The fixture skill id is namespaced to the E2E marketplace, so no loaded catalogue
   * declares it — which is exactly the state the advisory reports. Returns the config's
   * bytes alongside the directory: `compile` refreshes `config-types.ts` and rewrites
   * agents but must leave `config.ts` untouched, and every case below asserts that.
   */
  async function projectWithStackSkillAbsentFromMatrix(): Promise<{
    projectDir: string;
    configBefore: string;
  }> {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
      description: "Installed on disk and unknown to the matrix",
      metadata: renderMetadataYaml({ contentHash: "hash-vitest" }),
    });
    await writeProjectConfig(projectDir, {
      name: "e2e-warn-suppression",
      skills: buildSkillConfigs([E2E_SKILL.vitest.id], { scope: "project", origin: "eject" }),
      agents: buildAgentConfigs([AGENT_NAME], { scope: "project" }),
      stack: { [AGENT_NAME]: { "web-testing": [{ id: E2E_SKILL.vitest.id }] } },
    });

    return { projectDir, configBefore: await readTestFile(configTsPath(projectDir)) };
  }

  /**
   * Config and filesystem after a compile, identical for every case here: the
   * hand-written config is byte-identical and the agent this run recompiled is on disk.
   * The agent assertion doubles as the proof-of-execution guard — the advisory is
   * printed on the way to writing that file, so an empty agents directory would mean
   * the pass short-circuited rather than that the warning was suppressed.
   */
  async function expectCompileTouchedOnlyWhatItOwns(
    projectDir: string,
    configBefore: string,
  ): Promise<void> {
    expect(await readTestFile(configTsPath(projectDir))).toBe(configBefore);
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(AGENT_NAME, {
      contains: [`name: ${AGENT_NAME}`],
    });
  }

  it("prints it when the command is spawned through CLI.run", async () => {
    const { projectDir, configBefore } = await projectWithStackSkillAbsentFromMatrix();

    const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // Positive subject guard: the pass ran and reported on this very id.
    expect(output).toContain(E2E_SKILL.vitest.id);
    expect(output).toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX);
    // The unsuppressed sibling has no subject here — the skill IS on disk — so its
    // absence proves the line above came from the suppressed site, not from it.
    expect(output).not.toContain(STEP_TEXT.SKILL_NOT_FOUND_WARNING);
    await expectCompileTouchedOnlyWhatItOwns(projectDir, configBefore);
  });

  it("prints it when the command is spawned through a PTY session", async () => {
    const { projectDir, configBefore } = await projectWithStackSkillAbsentFromMatrix();
    const prompt = new InteractivePrompt(["compile"], projectDir);

    try {
      const exitCode = await prompt.waitForExit(TIMEOUTS.INSTALL);
      const output = prompt.getRawOutput();

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(E2E_SKILL.vitest.id);
      expect(output).toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX);
      expect(output).not.toContain(STEP_TEXT.SKILL_NOT_FOUND_WARNING);
      await expectCompileTouchedOnlyWhatItOwns(projectDir, configBefore);
    } finally {
      await prompt.destroy();
    }
  });

  it("prints it when the command is spawned through runCLI", async () => {
    const { projectDir, configBefore } = await projectWithStackSkillAbsentFromMatrix();

    const { exitCode, combined } = await runCLI(["compile"], projectDir);

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(combined).toContain(E2E_SKILL.vitest.id);
    expect(combined).toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX);
    expect(combined).not.toContain(STEP_TEXT.SKILL_NOT_FOUND_WARNING);
    await expectCompileTouchedOnlyWhatItOwns(projectDir, configBefore);
  });

  /**
   * The control for the three cases above. Re-injecting `VITEST` for one child proves the gate
   * in `warn()` is still live and still reads that variable — so a green run above is the
   * runners having stopped forwarding it, not the suppression having been deleted from
   * the product.
   */
  it("suppresses it again when VITEST is handed to the child explicitly", async () => {
    const { projectDir, configBefore } = await projectWithStackSkillAbsentFromMatrix();

    const { exitCode, output } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { VITEST: "true" } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(E2E_SKILL.vitest.id);
    expect(output).not.toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX);
    await expectCompileTouchedOnlyWhatItOwns(projectDir, configBefore);
  });
});
