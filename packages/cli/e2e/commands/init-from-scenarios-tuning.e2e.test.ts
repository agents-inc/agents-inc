import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  listFiles,
  readAgentEntriesFor,
  readTestFile,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_BUILTIN_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";

/**
 * `init --from`: per-sub-agent model and effort overrides; an absent key keeps the metadata's
 * value, and effort then emits no line. Every enum value is exercised. Sub-agents rest at the
 * global default, so frontmatter is read from `fakeHome`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const WEB_TESTER = E2E_BUILTIN_AGENT["web-tester"].name;
const REVIEWER = E2E_BUILTIN_AGENT["reviewer"].name;
const CLI_DEV = E2E_BUILTIN_AGENT["cli-developer"].name;
const API_TESTER = E2E_BUILTIN_AGENT["api-tester"].name;

/** Global, because a project skill on a global-default sub-agent is refused by the decode. */
function skillFor(...agents: string[]) {
  return buildSeedSkill({
    scope: "global",
    assignments: Object.fromEntries(agents.map((agent) => [agent, "lazy" as const])),
  });
}

describe("init --from <id>: sub-agent model and effort", () => {
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

  it("carries every model the contract allows onto its own sub-agent", async () => {
    env = await createTestEnvironment({ permissions: false });
    // The roster is uniformly `opus`, so the OPUS row's frontmatter cannot discriminate; the config
    // assertion carries it.
    store.publish(
      "Models01",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: skillFor(API_TESTER, WEB_TESTER, REVIEWER, CLI_DEV),
        },
        agents: {
          [API_TESTER]: { model: "opus" },
          [WEB_TESTER]: { model: "fable" },
          [REVIEWER]: { model: "sonnet" },
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

    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(API_TESTER, { model: "opus" });
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(WEB_TESTER, { model: "fable" });
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(REVIEWER, {
      model: "sonnet",
    });
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(CLI_DEV, { model: "haiku" });

    expect(await readAgentEntriesFor(env.projectDir, API_TESTER)).toStrictEqual(
      buildAgentConfigs([API_TESTER], { scope: "global", model: "opus" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, WEB_TESTER)).toStrictEqual(
      buildAgentConfigs([WEB_TESTER], { scope: "global", model: "fable" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, REVIEWER)).toStrictEqual(
      buildAgentConfigs([REVIEWER], { scope: "global", model: "sonnet" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, CLI_DEV)).toStrictEqual(
      buildAgentConfigs([CLI_DEV], { scope: "global", model: "haiku" }),
    );
  });

  it("carries every effort the contract allows onto its own sub-agent", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "Efforts1",
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: skillFor(WEB_DEV, API_DEV, WEB_TESTER, REVIEWER, CLI_DEV),
        },
        agents: {
          [WEB_DEV]: { effort: "low" },
          [API_DEV]: { effort: "medium" },
          [WEB_TESTER]: { effort: "high" },
          [REVIEWER]: { effort: "xhigh" },
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

    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(WEB_DEV, { effort: "low" });
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(API_DEV, { effort: "medium" });
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(WEB_TESTER, { effort: "high" });
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(REVIEWER, {
      effort: "xhigh",
    });
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(CLI_DEV, { effort: "max" });

    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], { scope: "global", effort: "low" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, CLI_DEV)).toStrictEqual(
      buildAgentConfigs([CLI_DEV], { scope: "global", effort: "max" }),
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

    // Effort has no default, so no line rather than an invented one.
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(WEB_DEV, {
      model: "haiku",
      noEffort: true,
    });
    // Dropping the model renders `model: inherit`, and the sibling pins `haiku`, so a bleed fails
    // here too. A hardcoded `opus` is invisible with this roster; that belongs to unit tests.
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(API_TESTER, {
      model: E2E_BUILTIN_AGENT["api-tester"].defaultModel,
      effort: "xhigh",
    });

    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], { scope: "global", model: "haiku" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, API_TESTER)).toStrictEqual(
      buildAgentConfigs([API_TESTER], { scope: "global", effort: "xhigh" }),
    );
  });

  it("keeps a sub-agent's metadata default when no entry names it", async () => {
    env = await createTestEnvironment({ permissions: false });
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

    // A default that never reached the template renders `model: inherit`; effort's correct outcome
    // is no key.
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(API_TESTER, {
      model: E2E_BUILTIN_AGENT["api-tester"].defaultModel,
      noEffort: true,
    });
    expect(await readAgentEntriesFor(env.projectDir, API_TESTER)).toStrictEqual(
      buildAgentConfigs([API_TESTER], { scope: "global" }),
    );
  });

  it("refuses a second id over an installed first, leaving the first id's tuning in place", async () => {
    env = await createTestEnvironment({ permissions: false });
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    // Pinned into the project, unlike the rest of this file, so the tuning lands where these
    // assertions read.
    const inProject = { scope: "project" } as const;
    store.publish(
      "Retune01",
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: skillFor(WEB_DEV) },
        agents: { [WEB_DEV]: { model: "sonnet", effort: "low", ...inProject } },
      }),
    );
    store.publish(
      "Retune02",
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: skillFor(WEB_DEV) },
        agents: { [WEB_DEV]: { model: "haiku", effort: "max", ...inProject } },
      }),
    );

    const first = await runInitFrom(store, "Retune01", project, sourceDir);
    expect(first.exitCode, `first install failed: ${first.output}`).toBe(EXIT_CODES.SUCCESS);
    // Proof the first install carried tuning for a second run to change.
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, {
      model: "sonnet",
      effort: "low",
    });

    const configBefore = await readTestFile(configTsPath(env.projectDir));
    const agentsBefore = await listFiles(agentsPath(env.projectDir));

    // `--from` is greenfield-only: a second id is refused, not re-tuned.
    const second = await runInitFrom(store, "Retune02", project, sourceDir);

    expect(second.exitCode).toBe(EXIT_CODES.ERROR);
    const said = flattenCliOutput(second.output);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_EXISTING_INSTALL);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_UNINSTALL_HINT);

    expect(await readTestFile(configTsPath(env.projectDir))).toBe(configBefore);
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual(agentsBefore);
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, {
      model: "sonnet",
      effort: "low",
    });
    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], { scope: "project", model: "sonnet", effort: "low" }),
    );
  });
});
