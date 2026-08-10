import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentName, SkillId } from "../../src/cli/types/index.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  completeWithLocalSources,
  configTsPath,
  ensureBinaryExists,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import "../matchers/setup.js";

/**
 * Reporting fidelity for a default (all-global-scope) install driven from a
 * PROJECT directory whose HOME is a separate fake home.
 *
 * Every other init E2E runs with HOME === projectDir (the TerminalSession
 * default), which collapses the global and project install roots onto the same
 * path and makes scope-blind reporting indistinguishable from correct
 * reporting. Here the two roots are distinct, so the report and the `list`
 * counts can be checked against where the files actually landed.
 */

/** Stack skills selected by the E2E Test Stack, all at the default global scope. */
const GLOBAL_STACK_SKILL_IDS: SkillId[] = [
  E2E_SKILL.react.id,
  E2E_SKILL.vitest.id,
  E2E_SKILL.zustand.id,
  E2E_SKILL.hono.id,
  E2E_SKILL["research-methodology"].id,
  E2E_SKILL.reviewing.id,
  E2E_SKILL["cli-reviewing"].id,
];

/**
 * Every agent a default E2E-stack install compiles: the sub-agents the stack
 * declares, and only those. A stack's `agents` keys are the roster its selection
 * installs — the domain-derived preselection is the from-scratch path and has no
 * say over a stack's list. All of them are global-scoped, so all of them land
 * under HOME.
 *
 * Read off the stack rather than written out, so a roster change reports the
 * name that moved instead of agreeing with whatever the code produced.
 */
const COMPILED_AGENT_NAMES: AgentName[] = E2E_STACK_AGENTS;

describe("default init from a project dir — global scope reporting", () => {
  let sourceTempDir: string;
  let tempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let initOutput: string;
  let initExitCode: number;

  beforeAll(async () => {
    await ensureBinaryExists();

    const source = await createE2ESource();
    sourceTempDir = source.tempDir;

    const env = await createTestEnvironment();
    tempDir = env.tempDir;
    fakeHome = env.fakeHome;
    projectDir = env.projectDir;

    const wizard = await InitWizard.launch({
      source: { sourceDir: source.sourceDir, tempDir: source.tempDir },
      projectDir,
      env: { HOME: fakeHome },
      ...TERMINAL_SIZE.TALL,
    });

    try {
      const result = await completeWithLocalSources(wizard);
      initExitCode = await result.exitCode;
      initOutput = result.output;
      await result.destroy();
    } finally {
      await wizard.destroy();
    }
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  it("installs every default-scope skill and agent under HOME, not under the project", async () => {
    expect(initExitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: fakeHome }).toHaveLocalSkills(GLOBAL_STACK_SKILL_IDS);
    await expect({ dir: projectDir }).toHaveNoLocalSkills();
    for (const agentName of COMPILED_AGENT_NAMES) {
      await expect({ dir: fakeHome }).toHaveCompiledAgent(agentName);
    }
    await expect({ dir: projectDir }).not.toHaveCompiledAgents();

    await expect({ dir: fakeHome }).toHaveConfig({
      skillIds: GLOBAL_STACK_SKILL_IDS,
      agents: COMPILED_AGENT_NAMES,
    });
  });

  it("reports the skills directory the skills were actually copied to", () => {
    expect(initOutput).toContain(STEP_TEXT.SKILLS_COPIED_TO);
    expect(initOutput).toContain(skillsPath(fakeHome));
    expect(initOutput).not.toContain(skillsPath(projectDir));
  });

  it("reports the agents directory the agents were actually compiled to", () => {
    expect(initOutput).toContain(STEP_TEXT.AGENTS_COMPILED_TO);
    expect(initOutput).toContain(agentsPath(fakeHome));
    expect(initOutput).not.toContain(agentsPath(projectDir));
  });

  /**
   * The closing block has to name the config that actually holds the assignments.
   * For a wholly global install driven from a project directory that is the GLOBAL
   * config: the writer filters the project config's `stack` down to project-scoped
   * agents, of which this install has none, so the project file carries no
   * assignment at all — and `list` already names the global config for this same
   * install, so two commands disagree today.
   */
  it("names the global config as the one holding the assignments", () => {
    expect(initOutput).toContain(STEP_TEXT.CONFIGURATION_LABEL);
    expect(initOutput).toContain(configTsPath(fakeHome));
    expect(
      initOutput,
      "the project config carries no stack for a wholly global install, so naming it sends the user to a file with nothing in it",
    ).not.toContain(configTsPath(projectDir));
  });

  /**
   * And the second half of the same block: `compile` run in this cwd performs the
   * PROJECT pass only, which recompiles no global agent. The wording already exists
   * — `globalScopedAgentsHint`, which `compile` itself prints when it lands in the
   * mirror-image of this state.
   */
  it("says where to compile from, given every agent is global-scoped", () => {
    expect(initOutput).toContain(STEP_TEXT.COMPILE_GLOBAL_SCOPE_HINT);
  });

  it("counts globally installed skills and agents when list is piped", async () => {
    const { exitCode, stdout } = await CLI.run(
      ["list"],
      { dir: projectDir },
      { env: { HOME: fakeHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(`Skills:  ${GLOBAL_STACK_SKILL_IDS.length}`);
    expect(stdout).toContain(`Agents:  ${COMPILED_AGENT_NAMES.length}`);
    expect(stdout).not.toContain("Skills:  0");
    expect(stdout).not.toContain("Agents:  0");

    await expect({ dir: fakeHome }).toHaveLocalSkills(GLOBAL_STACK_SKILL_IDS);
    for (const agentName of COMPILED_AGENT_NAMES) {
      await expect({ dir: fakeHome }).toHaveCompiledAgent(agentName);
    }
  });
});
