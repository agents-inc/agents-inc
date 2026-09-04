import path from "path";
import { describe, it, expect, afterAll, afterEach, beforeAll } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createPluginInstalledProject } from "../fixtures/plugin-install-state.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  readTestFile,
  runCLI,
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
 * (`src/cli/lib/stacks/stacks-loader.ts`) prints for a stack id `hasSkill()` cannot find
 * in the seeded matrix. `compile` seats that matrix itself before rendering
 * (`seatMatrixForPass`), and the seat merges every well-formed LOCAL skill on disk into
 * it — so a local skill can no longer model "installed but absent from the matrix"; it is
 * exactly what the seat now always finds. See
 * `.ai-docs/agent-findings/2026-09-03-a-fixture-modeling-a-skill-absent-from-the-matrix-stops-being-absent-once-compile-seats-locals.md`
 * for the fixture this file used to carry and why it stopped working.
 *
 * A genuinely installed PLUGIN skill still models the state: `loadSkillsMatrixFromSource`
 * merges local skill directories into the matrix, but never a plugin's install path, so an
 * enabled plugin skill stays outside the seeded matrix for as long as its own marketplace is
 * not the one `compile` resolves. `createPluginInstalledProject` writes the plugin's
 * per-skill `origin` and a cosmetic `marketplaceName`, but never `config.marketplace` — the
 * field `resolveSource` actually reads — so this project's compile resolves the default
 * public source, whose matrix does not declare an id namespaced to the E2E plugin
 * marketplace. `discoverInstalledSkills` still finds the skill directly from the plugin
 * registry and its install path, which is what keeps `SKILL_NOT_FOUND_WARNING` (the
 * unsuppressed sibling, for an id with no files at all) out of the output and leaves the
 * suppressed line as the only thing the assertion can match.
 */
describe("a warning the unit suite suppresses still reaches the user through the binary", () => {
  const AGENT_NAME = E2E_AGENT["web-developer"].name;
  let tempDir: string | undefined;
  let pluginSource: E2EPluginSource;

  beforeAll(async () => {
    pluginSource = await createE2EPluginSource();
  });

  afterAll(async () => {
    await cleanupFixture(pluginSource);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  /**
   * The fixture skill id is namespaced to the E2E plugin marketplace, and this project
   * never records a `config.marketplace` pointing at it — so no catalogue `compile` loads
   * declares it, which is exactly the state the advisory reports. Returns the config's
   * bytes and the fake HOME the plugin was installed under alongside the directory:
   * `compile` refreshes `config-types.ts` and rewrites agents but must leave `config.ts`
   * untouched, and every case below asserts that.
   */
  async function projectWithPluginSkillAbsentFromMatrix(): Promise<{
    projectDir: string;
    home: string;
    configBefore: string;
  }> {
    const installed = await createPluginInstalledProject({
      pluginsDir: pluginSource.pluginsDir,
      marketplace: pluginSource.marketplaceName,
      skillIds: [E2E_SKILL.vitest.id],
      agents: [AGENT_NAME],
      stack: { [AGENT_NAME]: { "web-testing": [{ id: E2E_SKILL.vitest.id }] } },
    });
    tempDir = path.dirname(installed.home);

    return {
      projectDir: installed.project.dir,
      home: installed.home,
      configBefore: await readTestFile(configTsPath(installed.project.dir)),
    };
  }

  /**
   * Config and filesystem after a compile, identical for every case here: the
   * hand-written config is byte-identical and the agent this run recompiled is on disk.
   *
   * The compiled agent's own body carries the proof-of-execution guard, not the process
   * output: `agent.liquid` renders every dynamic skill assignment as `### {{ skill.id }}`
   * under `<skill_activation_protocol>`, so the id landing there proves this exact run
   * resolved the fixture's stack entry — which is the one thing every case here shares,
   * suppressed advisory or not. Reaching for stdout instead would have tied this guard to
   * the very line the "suppresses" case proves does NOT print.
   */
  async function expectCompileTouchedOnlyWhatItOwns(
    projectDir: string,
    configBefore: string,
  ): Promise<void> {
    expect(await readTestFile(configTsPath(projectDir))).toBe(configBefore);
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(AGENT_NAME, {
      contains: [`name: ${AGENT_NAME}`, E2E_SKILL.vitest.id],
    });
  }

  it("prints it when the command is spawned through CLI.run", async () => {
    const { projectDir, home, configBefore } = await projectWithPluginSkillAbsentFromMatrix();

    const { exitCode, output } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: home } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // Positive subject guard: the pass ran and reported on this very id.
    expect(output).toContain(E2E_SKILL.vitest.id);
    expect(output).toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX);
    // The unsuppressed sibling has no subject here — the skill IS discoverable, from its
    // plugin install — so its absence proves the line above came from the suppressed
    // site, not from it.
    expect(output).not.toContain(STEP_TEXT.SKILL_NOT_FOUND_WARNING);
    await expectCompileTouchedOnlyWhatItOwns(projectDir, configBefore);
  });

  it("prints it when the command is spawned through a PTY session", async () => {
    const { projectDir, home, configBefore } = await projectWithPluginSkillAbsentFromMatrix();
    const prompt = new InteractivePrompt(["compile"], projectDir, { env: { HOME: home } });

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
    const { projectDir, home, configBefore } = await projectWithPluginSkillAbsentFromMatrix();

    const { exitCode, combined } = await runCLI(["compile"], projectDir, { env: { HOME: home } });

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
    const { projectDir, home, configBefore } = await projectWithPluginSkillAbsentFromMatrix();

    const { exitCode, output } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: home, VITEST: "true" } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // Suppressed, so the id has no other line in this output to appear in — proof the pass
    // still resolved it lives in the compiled agent body, asserted below.
    expect(output).not.toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX);
    await expectCompileTouchedOnlyWhatItOwns(projectDir, configBefore);
  });
});
