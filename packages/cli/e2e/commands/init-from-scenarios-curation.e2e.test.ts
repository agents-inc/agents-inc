import { readFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { cleanupTempDir, configTsPath, loadConfigOrFail } from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  E2E_AGENT,
  E2E_AGENTS,
  E2E_SKILL,
  E2E_STACK_DESCRIPTION,
  E2E_STACK_ID,
} from "../fixtures/expected-values.js";
import { EXIT_CODES } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";

/**
 * `init --from`: `assignments` decides which sub-agents are selected, which skills each holds, and
 * whether each preloads. Sub-agents are pinned to the project, where curation is observable.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const PINNED_TO_PROJECT = { scope: "project" } as const;

describe("init --from <id>: per-sub-agent curation", () => {
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

  it("installs a stack payload as the stack's own per-sub-agent expansion", async () => {
    env = await createTestEnvironment({ permissions: false });
    // The web app always sends the expansion: `stackId` is metadata, `assignments` the data.
    store.publish(
      "Stacked1",
      buildSeedPayload({
        stackId: E2E_STACK_ID,
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "preloaded" },
          }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.zustand.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.reviewing.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy", [API_DEV]: "lazy" },
          }),
          [E2E_SKILL["cli-reviewing"].id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL["research-methodology"].id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy", [API_DEV]: "lazy" },
          }),
          [E2E_SKILL.hono.id]: buildSeedSkill({
            scope: "project",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT, [API_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "Stacked1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const config = await loadConfigOrFail(env.projectDir);
    // config.ts has no `stackId`; the stack's description is what proves the id resolved.
    expect(config.description).toBe(E2E_STACK_DESCRIPTION);

    // This carries the red: the stack's preload flags agree with these assignments, so the
    // frontmatter checks pass even when every sub-agent holds every skill.
    expect(config.stack).toStrictEqual({
      [WEB_DEV]: {
        "web-framework": [sa(E2E_SKILL.react.id, true)],
        "web-testing": [sa(E2E_SKILL.vitest.id)],
        "web-client-state": [sa(E2E_SKILL.zustand.id)],
        "meta-reviewing": [sa(E2E_SKILL.reviewing.id), sa(E2E_SKILL["cli-reviewing"].id)],
        "meta-methodology": [sa(E2E_SKILL["research-methodology"].id)],
      },
      [API_DEV]: {
        "api-api": [sa(E2E_SKILL.hono.id, true)],
        "meta-reviewing": [sa(E2E_SKILL.reviewing.id)],
        "meta-methodology": [sa(E2E_SKILL["research-methodology"].id)],
      },
    });

    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, {
      exactSkills: [E2E_SKILL.react.id],
    });
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(API_DEV, {
      exactSkills: [E2E_SKILL.hono.id],
    });

    await expect({ dir: env.projectDir }).toHaveLocalSkills([
      E2E_SKILL.react.id,
      E2E_SKILL.vitest.id,
      E2E_SKILL.zustand.id,
      E2E_SKILL.reviewing.id,
      E2E_SKILL["cli-reviewing"].id,
      E2E_SKILL["research-methodology"].id,
      E2E_SKILL.hono.id,
    ]);
  });

  it("gives each sub-agent only its assigned skills, at the load state it was assigned", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "Curated1",
      buildSeedPayload({
        skills: {
          // Shared at different load states, which a per-skill flag cannot express.
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "preloaded", [API_DEV]: "lazy" },
          }),
          [E2E_SKILL.zustand.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.hono.id]: buildSeedSkill({
            scope: "project",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT, [API_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "Curated1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const config = await loadConfigOrFail(env.projectDir);
    expect(config.stack).toStrictEqual({
      [WEB_DEV]: {
        "web-framework": [sa(E2E_SKILL.react.id, true)],
        "web-client-state": [sa(E2E_SKILL.zustand.id)],
      },
      [API_DEV]: {
        "web-framework": [sa(E2E_SKILL.react.id)],
        "api-api": [sa(E2E_SKILL.hono.id, true)],
      },
    });

    // Exact: preloading everything would pass a subset check.
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, {
      exactSkills: [E2E_SKILL.react.id],
    });
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(API_DEV, {
      exactSkills: [E2E_SKILL.hono.id],
    });

    // Each positive guards the negative beside it: a protocol that never rendered fails `skillIds`.
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(WEB_DEV, {
      skillIds: [E2E_SKILL.zustand.id],
      noSkillIds: [E2E_SKILL.hono.id],
    });
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(API_DEV, {
      skillIds: [E2E_SKILL.react.id],
      noSkillIds: [E2E_SKILL.zustand.id],
    });
  });

  it("leaves a sub-agent switched on with no assignments holding nothing", async () => {
    env = await createTestEnvironment({ permissions: false });
    // `on: true` with no assignment is the only way a skill-less sub-agent travels; it must arrive
    // bare.
    store.publish(
      "Bare0002",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT, [API_DEV]: { on: true, ...PINNED_TO_PROJECT } },
      }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "Bare0002",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const config = await loadConfigOrFail(env.projectDir);
    expect(config.agents).toStrictEqual(
      buildAgentConfigs([...E2E_AGENTS.WEB_AND_API], { scope: "project" }),
    );
    expect(config.stack).toStrictEqual({
      [WEB_DEV]: { "web-framework": [sa(E2E_SKILL.react.id)] },
    });

    await expect({ dir: env.projectDir }).toHaveCompiledAgent(API_DEV);
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(API_DEV, { noSkills: true });
    // The positive on web-developer proves this fixture renders skill ids, so the negative is a
    // real absence.
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(WEB_DEV, {
      skillIds: [E2E_SKILL.react.id],
    });
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(API_DEV, {
      noSkillIds: [E2E_SKILL.react.id],
    });
  });

  it("installs a payload that carries a sub-agent and no skills at all", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "AgentOnly",
      buildSeedPayload({ agents: { [WEB_DEV]: { on: true, ...PINNED_TO_PROJECT } } }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "AgentOnly",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    // A skill-less sub-agent is a real install, not the "nothing to install" error.
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const config = await loadConfigOrFail(env.projectDir);
    expect(config.skills).toStrictEqual([]);
    expect(config.agents).toStrictEqual(buildAgentConfigs([WEB_DEV], { scope: "project" }));
    expect(config.stack).toBeUndefined();

    await expect({ dir: env.projectDir }).toHaveCompiledAgent(WEB_DEV);
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, { noSkills: true });
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(WEB_DEV, {
      allPreloaded: true,
      noSkillIds: [E2E_SKILL.react.id],
    });
    await expect({ dir: env.projectDir }).toHaveNoLocalSkills();
  });

  it("emits an exclusive category as one entry and a non-exclusive one as a list", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "Shapes01",
      buildSeedPayload({
        skills: {
          // web-framework is exclusive (one skill), meta-reviewing is not (two).
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL.reviewing.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [E2E_SKILL["cli-reviewing"].id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "Shapes01",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const configSource = await readFile(configTsPath(env.projectDir), "utf8");
    expect(configSource).toContain(`'web-framework': '${E2E_SKILL.react.id}'`);
    expect(configSource).toContain(
      `'meta-reviewing': [\n      '${E2E_SKILL.reviewing.id}',\n      '${E2E_SKILL["cli-reviewing"].id}',\n    ]`,
    );

    // The compact and array forms load back to the same shape.
    const config = await loadConfigOrFail(env.projectDir);
    expect(config.stack).toStrictEqual({
      [WEB_DEV]: {
        "web-framework": [sa(E2E_SKILL.react.id)],
        "meta-reviewing": [sa(E2E_SKILL.reviewing.id), sa(E2E_SKILL["cli-reviewing"].id)],
      },
    });

    await expect({ dir: env.projectDir }).toHaveLocalSkills([
      E2E_SKILL.react.id,
      E2E_SKILL.reviewing.id,
      E2E_SKILL["cli-reviewing"].id,
    ]);
  });
});
