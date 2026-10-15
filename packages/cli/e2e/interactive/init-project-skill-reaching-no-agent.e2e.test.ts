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
 * A project-scoped skill never reaches a global-scoped sub-agent. That rule is
 * correct, documented and enforced at four layers — and every one of them is
 * silent.
 *
 * Install one skill at project scope while every sub-agent rests global, and the
 * skill is copied to `<project>/.claude/skills/`, written into `config.ts`, and
 * assigned to nothing. The run reports `0 agents rewritten` and `doctor` is green,
 * so the one thing the user is never told is the one thing that matters: the skill
 * will never be loaded.
 *
 * This spec asserts the install AND the silence, so the shape survives even if the
 * warning's wording moves — see STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT.
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
          // Ejected, so the copy that lands with no assignment is observable on disk.
          [E2E_SKILL.react.id]: buildSeedSkill({ scope: "project" }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        // Every sub-agent at GLOBAL scope — the whole point.
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

    // The filesystem half: the copy really landed under the project.
    await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
    // The config half: it is a project-scoped entry of this project's own.
    await expect({ dir: projectDir }).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
  });

  it("assigns it to no sub-agent, at either scope", async () => {
    const projectStack = (await loadConfigOrFail(projectDir)).stack;
    const globalStack = (await loadConfigOrFail(fakeHome)).stack;

    // The project side is the stronger claim and the one this journey is about: a skill that
    // reaches no sub-agent leaves NO project stack at all, not one that merely omits the id.
    expect(projectStack).toBeUndefined();

    // The global side really is populated, so its negative discriminates. Asserted as the
    // serialised form because the claim is that the id appears in NO agent's catalogue, which
    // needs no structure to state — with the control above it, since an absent global stack
    // would satisfy this for free too.
    expect(globalStack).toBeDefined();
    expect(JSON.stringify(globalStack)).not.toContain(E2E_SKILL.react.id);
  });

  it("says so, naming the skill", () => {
    expect(flattenCliOutput(initOutput)).toContain(
      `Skill '${E2E_SKILL.react.id}' ${STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT}`,
    );
  });
});
