import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupTempDir,
  loadConfigOrFail,
  readTestFile,
  matchedAsWritten,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { E2E_AGENT, E2E_BUILTIN_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";

/**
 * `edit --from` from a project only adds to the global install: api-developer gains Vitest beside
 * its Zustand row, web-tester is named with no new skill and left exactly as installed. The confirm
 * and summary must say which is which.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const WEB_TESTER = E2E_BUILTIN_AGENT["web-tester"].name;
const INSTALLED_ID = "AddsToGlb1";
const EDITED_ID = "AddsToGlb2";

/** Regex-safe: the leading `+` is a quantifier otherwise. */
function addedToLine(agentName: string, skillId: string): string {
  return `sub-agent ${agentName}: + ${skillId}`;
}

describe("edit --from <id> from a project, where a new skill joins a held global sub-agent", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment;
  let webTesterBefore: string;
  let planned: string;
  let output: string;
  let exitCode: number;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
    env = await createTestEnvironment();

    // web-developer in the project; api-developer and web-tester global, both loading Zustand.
    store.publish(
      INSTALLED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.zustand.id]: ejectedGlobalSkill({
            assignments: { [API_DEV]: "lazy", [WEB_TESTER]: "lazy" },
          }),
        },
        agents: {
          [WEB_DEV]: { scope: "project" },
          [API_DEV]: { scope: "global" },
          [WEB_TESTER]: { scope: "global" },
        },
      }),
    );
    // Zustand left out, Vitest added to api-developer alone.
    store.publish(
      EDITED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.vitest.id]: ejectedGlobalSkill({ assignments: { [API_DEV]: "lazy" } }),
        },
        agents: {
          [WEB_DEV]: { scope: "project" },
          [API_DEV]: { scope: "global" },
          [WEB_TESTER]: { scope: "global", on: true },
        },
      }),
    );

    const installed = await runInitFrom(
      store,
      INSTALLED_ID,
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    webTesterBefore = await readTestFile(path.join(agentsPath(env.fakeHome), `${WEB_TESTER}.md`));

    const prompt = new InteractivePrompt(["edit", "--from", EDITED_ID], env.projectDir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
    });
    try {
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      planned = prompt.getOutput();
      await prompt.confirm();
      exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      output = prompt.getOutput();
    } finally {
      await prompt.destroy();
    }
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
    await cleanupTempDir(env.tempDir);
  });

  it("names the held sub-agent the new skill joins, with the skill it gains", () => {
    expect(planned).toMatch(
      new RegExp(
        `${matchedAsWritten(STEP_TEXT.SHARED_CONFIG_ADDED_TO_GLOBAL)}[\\s\\S]*${matchedAsWritten(addedToLine(API_DEV, E2E_SKILL.vitest.id))}`,
      ),
    );
  });

  it("names as kept as installed only what it leaves exactly as installed", () => {
    expect(planned).toMatch(
      new RegExp(
        `${matchedAsWritten(STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED)}[\\s\\S]*${matchedAsWritten(`skill ${E2E_SKILL.zustand.id}`)}`,
      ),
    );
    expect(planned).toMatch(
      new RegExp(
        `${matchedAsWritten(STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED)}[\\s\\S]*${matchedAsWritten(`sub-agent ${WEB_TESTER}`)}`,
      ),
    );
    expect(planned, "a sub-agent the run adds a skill to is not kept as installed").not.toMatch(
      new RegExp(
        `${matchedAsWritten(STEP_TEXT.SHARED_CONFIG_KEPT_AS_INSTALLED)}[\\s\\S]*${matchedAsWritten(`sub-agent ${API_DEV}`)}`,
      ),
    );
  });

  it("lists the global sub-agent it changed among its changes, and not the one it kept", () => {
    expect(exitCode, `apply failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(`~ ${API_DEV} ${STEP_TEXT.EDIT_GLOBAL_SUB_AGENT_SKILLS_ADDED}`);
    expect(output).not.toContain(`~ ${WEB_TESTER}`);
  });

  it("joins the new skill's row to the held sub-agent and leaves the other as installed", async () => {
    const globalConfig = await loadConfigOrFail(env.fakeHome);

    expect(globalConfig.stack).toStrictEqual({
      [API_DEV]: {
        "web-client-state": [sa(E2E_SKILL.zustand.id)],
        "web-testing": [sa(E2E_SKILL.vitest.id)],
      },
      [WEB_TESTER]: { "web-client-state": [sa(E2E_SKILL.zustand.id)] },
    });
    await expect({ dir: env.fakeHome }).toHaveAgentDynamicSkills(API_DEV, {
      skillIds: [E2E_SKILL.zustand.id, E2E_SKILL.vitest.id],
    });
    expect(
      await readTestFile(path.join(agentsPath(env.fakeHome), `${WEB_TESTER}.md`)),
      "the sub-agent named as kept as installed must compile exactly as it did",
    ).toBe(webTesterBefore);
  });
});
