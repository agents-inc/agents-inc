import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentName } from "../../src/cli/types/index.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_SKILL, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";

import { agentsPath, cleanupTempDir, configTsPath, skillsPath } from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

const GLOBAL_STACK_SKILLS = [
  E2E_SKILL.react,
  E2E_SKILL.vitest,
  E2E_SKILL.zustand,
  E2E_SKILL.hono,
  E2E_SKILL["research-methodology"],
  E2E_SKILL.reviewing,
  E2E_SKILL["cli-reviewing"],
];

const GLOBAL_STACK_SKILL_IDS: string[] = GLOBAL_STACK_SKILLS.map((skill) => skill.id);

/** Titles that name no directory: the subject guard for the listing's negative half. */
const TITLES_THAT_NAME_NO_DIRECTORY = [
  "E2E React",
  "E2E Vitest",
  "E2E Zustand",
  "E2E Hono",
  "Research Methodology",
  "Reviewing",
  "CLI Reviewing",
];

/** Read off the stack, so a roster change reports the name that moved. */
const COMPILED_AGENT_NAMES: AgentName[] = E2E_STACK_AGENTS;

describe("default init from a project dir — global scope reporting", () => {
  let store: SeedConfigStore;
  let tempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let initOutput: string;
  let initExitCode: number;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    const env = await createTestEnvironment();
    tempDir = env.tempDir;
    fakeHome = env.fakeHome;
    projectDir = env.projectDir;

    ({ exitCode: initExitCode, output: initOutput } = await installFromSeed(
      store,
      "AllGlobal1",
      e2eStackPayload(),
      { dir: projectDir, home: fakeHome },
    ));
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("installs every default-scope skill and agent under HOME, not under the project", async () => {
    expect(initExitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: fakeHome }).toHaveLocalSkills(GLOBAL_STACK_SKILL_IDS);
    await expect({ dir: projectDir }).toHaveNoLocalSkills();
    for (const agentName of COMPILED_AGENT_NAMES) {
      await expect({ dir: fakeHome }).toHaveCompiledAgent(agentName);
    }
    // A negation is correct here: it fails on a missing dir or one with no `.md`.
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

  /** Both halves: the ids could print beside the titles, or the block might never paint. */
  it("lists the directory each skill was copied into, not its title", () => {
    expect(initOutput).toContain(STEP_TEXT.SKILLS_COPIED_TO);

    expect(
      GLOBAL_STACK_SKILLS.map((skill) => skill.display),
      "a title that is already its skill's directory name makes the negative below unfailable",
    ).toStrictEqual(TITLES_THAT_NAME_NO_DIRECTORY);

    for (const skillId of GLOBAL_STACK_SKILL_IDS) {
      expect(
        initOutput,
        "every entry under the skills header is a directory a reader must be able to cd into",
      ).toContain(`    ${skillId}/`);
    }
    for (const title of TITLES_THAT_NAME_NO_DIRECTORY) {
      expect(
        initOutput,
        "a display title under the skills header names a directory that does not exist",
      ).not.toContain(`    ${title}/`);
    }
  });

  it("reports the agents directory the agents were actually compiled to", () => {
    expect(initOutput).toContain(STEP_TEXT.AGENTS_COMPILED_TO);
    expect(initOutput).toContain(agentsPath(fakeHome));
    expect(initOutput).not.toContain(agentsPath(projectDir));
  });

  /** Every config the run wrote is named: the global one holding the assignments, and the project's. */
  it("names the global config holding the assignments, and the project config it also wrote", () => {
    expect(initOutput).toContain(
      `${STEP_TEXT.CONFIGURATION_LABEL}\n  ${configTsPath(fakeHome)}\n  ${configTsPath(projectDir)}\n\n`,
    );
  });

  /** `compile` in this cwd runs the project pass only, recompiling no global agent. */
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
