import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { cleanupTempDir, ensureBinaryExists, readAgentEntriesFor } from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_BUILTIN_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";

/**
 * `init --from <id>`: the model and reasoning effort a shared configuration carries per sub-agent.
 *
 * Both live on the sub-agent, never on a skill, and both are OVERRIDES: an absent key means "keep
 * whatever the sub-agent's own metadata says", which for effort means emitting no line at all.
 * Every value of both enums is exercised, because a mapper that forwards a whitelist is
 * indistinguishable from one that forwards everything until the whole enum is tried.
 *
 * Covers Phase 5 scenarios 3, 4, 5, 12 and 13 of the tracker's `--from` matrix.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const WEB_TESTER = E2E_BUILTIN_AGENT["web-tester"].name;
const WEB_REVIEWER = E2E_BUILTIN_AGENT["web-reviewer"].name;
const CLI_DEV = E2E_BUILTIN_AGENT["cli-developer"].name;
const API_TESTER = E2E_BUILTIN_AGENT["api-tester"].name;

/** One skill, assigned lazily to every sub-agent the payload wants tuned. */
function skillFor(...agents: string[]) {
  return buildSeedSkill({
    assignments: Object.fromEntries(agents.map((agent) => [agent, "lazy" as const])),
  });
}

describe("init --from <id>: sub-agent model and effort", () => {
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

  it("carries every model the contract allows onto its own sub-agent", async () => {
    env = await createTestEnvironment({ permissions: false });
    // api-tester is the one sub-agent whose bundled default is not opus, so it takes the opus row:
    // asserting opus on an opus-by-default sub-agent would pass without the override arriving.
    store.publish(
      "Models01",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: skillFor(API_TESTER, WEB_TESTER, WEB_REVIEWER, CLI_DEV),
        },
        agents: {
          [API_TESTER]: { model: "opus" },
          [WEB_TESTER]: { model: "fable" },
          [WEB_REVIEWER]: { model: "sonnet" },
          [CLI_DEV]: { model: "haiku" },
        },
      }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "Models01",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(API_TESTER, { model: "opus" });
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_TESTER, { model: "fable" });
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_REVIEWER, {
      model: "sonnet",
    });
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(CLI_DEV, { model: "haiku" });

    // config.ts is what a later edit or recompile reads back, so it has to agree.
    expect(await readAgentEntriesFor(env.projectDir, API_TESTER)).toStrictEqual(
      buildAgentConfigs([API_TESTER], { model: "opus" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, WEB_TESTER)).toStrictEqual(
      buildAgentConfigs([WEB_TESTER], { model: "fable" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, WEB_REVIEWER)).toStrictEqual(
      buildAgentConfigs([WEB_REVIEWER], { model: "sonnet" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, CLI_DEV)).toStrictEqual(
      buildAgentConfigs([CLI_DEV], { model: "haiku" }),
    );
  });

  it("carries every effort the contract allows onto its own sub-agent", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "Efforts1",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: skillFor(WEB_DEV, API_DEV, WEB_TESTER, WEB_REVIEWER, CLI_DEV),
        },
        agents: {
          [WEB_DEV]: { effort: "low" },
          [API_DEV]: { effort: "medium" },
          [WEB_TESTER]: { effort: "high" },
          [WEB_REVIEWER]: { effort: "xhigh" },
          [CLI_DEV]: { effort: "max" },
        },
      }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "Efforts1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, { effort: "low" });
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(API_DEV, { effort: "medium" });
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_TESTER, { effort: "high" });
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_REVIEWER, {
      effort: "xhigh",
    });
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(CLI_DEV, { effort: "max" });

    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], { effort: "low" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, CLI_DEV)).toStrictEqual(
      buildAgentConfigs([CLI_DEV], { effort: "max" }),
    );
  });

  it("leaves the field a sub-agent's entry does not name alone", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "Partial1",
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: skillFor(WEB_DEV, API_TESTER) },
        agents: { [WEB_DEV]: { model: "haiku" }, [API_TESTER]: { effort: "xhigh" } },
      }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "Partial1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Model only: effort has no default, so no line at all rather than an invented one.
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, {
      model: "haiku",
      noEffort: true,
    });
    // Effort only: the model stays whatever api-tester's own metadata declares.
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(API_TESTER, {
      model: E2E_BUILTIN_AGENT["api-tester"].defaultModel,
      effort: "xhigh",
    });

    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], { model: "haiku" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, API_TESTER)).toStrictEqual(
      buildAgentConfigs([API_TESTER], { effort: "xhigh" }),
    );
  });

  it("keeps a sub-agent's metadata default when no entry names it", async () => {
    env = await createTestEnvironment({ permissions: false });
    // api-tester arrives via an assignment alone — the `agents` map says nothing about it.
    store.publish(
      "NoEntry1",
      buildSeedPayload({ skills: { [E2E_SKILL.react.id]: skillFor(API_TESTER) } }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "NoEntry1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(API_TESTER, {
      model: E2E_BUILTIN_AGENT["api-tester"].defaultModel,
      noEffort: true,
    });
    // Nothing to override, so the config entry carries neither key.
    expect(await readAgentEntriesFor(env.projectDir, API_TESTER)).toStrictEqual(
      buildAgentConfigs([API_TESTER]),
    );
  });

  it("replaces a sub-agent's tuning when a second id is installed over the first", async () => {
    env = await createTestEnvironment({ permissions: false });
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    store.publish(
      "Retune01",
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: skillFor(WEB_DEV) },
        agents: { [WEB_DEV]: { model: "sonnet", effort: "low" } },
      }),
    );
    store.publish(
      "Retune02",
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: skillFor(WEB_DEV) },
        agents: { [WEB_DEV]: { model: "haiku", effort: "max" } },
      }),
    );

    const first = await runInitFrom(store, "Retune01", project, sourceDir);
    expect(first.exitCode).toBe(EXIT_CODES.SUCCESS);
    // Proof the second run had something to change: without this the final assertions could hold
    // on an install that never carried the first id's tuning at all.
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, {
      model: "sonnet",
      effort: "low",
    });

    const second = await runInitFrom(store, "Retune02", project, sourceDir);
    expect(second.exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, {
      model: "haiku",
      effort: "max",
    });
    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], { model: "haiku", effort: "max" }),
    );
  });
});
