import { readFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
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
 * `init --from <id>`: what each sub-agent ends up holding.
 *
 * A payload's `assignments` map is per `(skill, sub-agent)` and carries a load state — this is the
 * promise the web app makes its users: a sub-agent gets exactly the skills assigned to it, at the
 * load state they were assigned. So `assignments` decides three things at once, and each has to be
 * asserted separately: WHICH sub-agents are selected, WHICH skills land in each one's stack entry,
 * and WHETHER each of those preloads.
 *
 * Covers Phase 5 scenarios 1, 2, 6, 7 and 9 of the tracker's `--from` matrix.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

describe("init --from <id>: per-sub-agent curation", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
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
    // The web app always sends the expansion: `stackId` is metadata, `assignments` is the data.
    // This payload IS the E2E source's stack, written out skill by skill.
    store.publish(
      "Stacked1",
      buildSeedPayload({
        stackId: E2E_STACK_ID,
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "preloaded" } }),
          [E2E_SKILL.vitest.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
          [E2E_SKILL.zustand.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
          [E2E_SKILL.reviewing.id]: buildSeedSkill({
            assignments: { [WEB_DEV]: "lazy", [API_DEV]: "lazy" },
          }),
          [E2E_SKILL["cli-reviewing"].id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
          [E2E_SKILL["research-methodology"].id]: buildSeedSkill({
            assignments: { [WEB_DEV]: "lazy", [API_DEV]: "lazy" },
          }),
          [E2E_SKILL.hono.id]: buildSeedSkill({ assignments: { [API_DEV]: "preloaded" } }),
        },
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
    // The config has no `stackId` field: the stack's description is the whole of what a stack id
    // leaves behind in config.ts. Recording it proves the id resolved rather than being ignored.
    expect(config.description).toBe(E2E_STACK_DESCRIPTION);

    // The curation assertion is the one that carries the red here. A stack id makes the CLI
    // overlay the stack's own preloaded flags, which happen to agree with these assignments — so
    // the frontmatter assertions below pass even while every sub-agent holds every skill. Do not
    // simplify this spec down to the frontmatter half.
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
          // Shared, but at different load states — the case a per-skill flag cannot express.
          [E2E_SKILL.react.id]: buildSeedSkill({
            assignments: { [WEB_DEV]: "preloaded", [API_DEV]: "lazy" },
          }),
          [E2E_SKILL.zustand.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
          [E2E_SKILL.hono.id]: buildSeedSkill({ assignments: { [API_DEV]: "preloaded" } }),
        },
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

    // Frontmatter is the preload list Claude Code reads. Exact, not "contains": a fix that
    // preloads everything an agent holds would satisfy a subset check.
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, {
      exactSkills: [E2E_SKILL.react.id],
    });
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(API_DEV, {
      exactSkills: [E2E_SKILL.hono.id],
    });

    // The body carries the lazy half. `hasActivationProtocol` is the subject guard: it proves the
    // section that would name a wrongly-assigned skill is actually painted in this file, so the
    // negative below cannot pass by the section being absent.
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(WEB_DEV, {
      skillIds: [E2E_SKILL.zustand.id],
      noSkillIds: [E2E_SKILL.hono.id],
      hasActivationProtocol: true,
    });
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(API_DEV, {
      skillIds: [E2E_SKILL.react.id],
      noSkillIds: [E2E_SKILL.zustand.id],
      hasActivationProtocol: true,
    });
  });

  it("leaves a sub-agent switched on with no assignments holding nothing", async () => {
    env = await createTestEnvironment({ permissions: false });
    // `on: true` with no assignment anywhere is the ONLY way a skill-less sub-agent travels. It
    // must arrive bare — inheriting the other sub-agent's skills is not what was shared.
    store.publish(
      "Bare0002",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
        },
        agents: { [API_DEV]: { on: true } },
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
    expect(config.agents).toStrictEqual(buildAgentConfigs([...E2E_AGENTS.WEB_AND_API]));
    expect(config.stack).toStrictEqual({
      [WEB_DEV]: { "web-framework": [sa(E2E_SKILL.react.id)] },
    });

    await expect({ dir: env.projectDir }).toHaveCompiledAgent(API_DEV);
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(API_DEV, { noSkills: true });
    // The bare sub-agent's file must not carry the other one's skill either. The positive half on
    // web-developer proves this fixture DOES inject skill ids into a compiled body, so the
    // negative is a real absence rather than a section that never renders.
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(WEB_DEV, {
      skillIds: [E2E_SKILL.react.id],
      hasActivationProtocol: true,
    });
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(API_DEV, {
      noSkillIds: [E2E_SKILL.react.id],
    });
  });

  it("installs a payload that carries a sub-agent and no skills at all", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("AgentOnly", buildSeedPayload({ agents: { [WEB_DEV]: { on: true } } }));

    const { exitCode } = await runInitFrom(
      store,
      "AgentOnly",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );

    // A sub-agent has front-matter, a prompt and a compiled file without owning a single skill,
    // so an agent-only configuration is a real install, not the "nothing to install" error.
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const config = await loadConfigOrFail(env.projectDir);
    expect(config.skills).toStrictEqual([]);
    expect(config.agents).toStrictEqual(buildAgentConfigs([WEB_DEV]));
    expect(config.stack).toBeUndefined();

    await expect({ dir: env.projectDir }).toHaveCompiledAgent(WEB_DEV);
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, { noSkills: true });
    // No dynamic half either: with nothing assigned, the activation protocol has nothing to list.
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
          [E2E_SKILL.react.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
          [E2E_SKILL.reviewing.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
          [E2E_SKILL["cli-reviewing"].id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }),
        },
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
    expect(configSource).toContain(`"web-framework": "${E2E_SKILL.react.id}"`);
    expect(configSource).toContain(
      `"meta-reviewing": [\n      "${E2E_SKILL.reviewing.id}",\n      "${E2E_SKILL["cli-reviewing"].id}"\n    ]`,
    );

    // The compact text and the array text load back to the same normalized shape.
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
