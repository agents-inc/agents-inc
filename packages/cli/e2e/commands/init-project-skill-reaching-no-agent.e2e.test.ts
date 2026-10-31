import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  flattenCliOutput,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import "../matchers/setup.js";

/**
 * A project-scoped skill never reaches a global sub-agent, so with every sub-agent global it is
 * installed and assigned to nothing; see STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const INSTALLED_ID = "NoAgent02";

describe("a project-scoped skill installed alongside only global sub-agents", () => {
  let source: E2ESource | undefined;
  let store: SeedConfigStore;
  let tempDir: string | undefined;
  let fakeHome: string;
  let projectDir: string;
  let initOutput: string;
  let initExitCode: number;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        skills: {
          // Ejected, so the unassigned copy is observable on disk.
          [E2E_SKILL.react.id]: buildSeedSkill({ scope: "project" }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        // Every sub-agent global: the whole point.
        agents: {
          [WEB_DEV]: { on: true, scope: "global" },
          [API_DEV]: { on: true, scope: "global" },
        },
      }),
    );

    const env = await createTestEnvironment();
    tempDir = env.tempDir;
    fakeHome = env.fakeHome;
    projectDir = env.projectDir;

    const result = await runInitFrom(
      store,
      INSTALLED_ID,
      { dir: projectDir, globalHome: fakeHome },
      source.sourceDir,
    );
    initExitCode = result.exitCode;
    initOutput = result.output;
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
    await cleanupFixture(source);
  });

  it("installs the skill and records it at project scope", async () => {
    expect(initExitCode, initOutput).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
    await expect({ dir: projectDir }).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
  });

  it("assigns it to no sub-agent, at either scope", async () => {
    const projectStack = (await loadConfigOrFail(projectDir)).stack;
    const globalStack = (await loadConfigOrFail(fakeHome)).stack;

    // No project stack at all, not one that merely omits the id.
    expect(projectStack).toBeUndefined();

    // The global stack is populated, so its negative discriminates.
    expect(globalStack).toBeDefined();
    expect(JSON.stringify(globalStack)).not.toContain(E2E_SKILL.react.id);
  });

  it("says so, naming the skill as its install recorded it", () => {
    const said = flattenCliOutput(initOutput);

    expect(said).toContain(
      `Skill '${E2E_SKILL.react.display}' ${STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT}`,
    );
    expect(said).toContain(`${STEP_TEXT.STACK_PAIR_DROPPED_BY_SCOPE} '${E2E_SKILL.react.display}'`);
  });
});
