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
 * `init --from <id>`: the model and reasoning effort a shared configuration carries per sub-agent.
 *
 * Both live on the sub-agent, never on a skill, and both are OVERRIDES: an absent key means "keep
 * whatever the sub-agent's own metadata says", which for effort means emitting no line at all.
 * Every value of both enums is exercised, because a mapper that forwards a whitelist is
 * indistinguishable from one that forwards everything until the whole enum is tried.
 *
 * Tuning is orthogonal to where a sub-agent is written, so no payload here names an agent scope:
 * every sub-agent takes the shared selection default and its compiled `.md` lands in the user's own
 * ~/.claude rather than in the project. That is why the front-matter assertions read `fakeHome`
 * while the config entries are read back from the project's own `config.ts`, which inlines the
 * global rows, and why the skills travel global too — see `skillFor`. The one exception is the
 * last spec, which pins its sub-agent into the project and says why on the spot.
 *
 * Covers Phase 5 scenarios 3, 4, 5, 12 and 13 of the tracker's `--from` matrix.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const WEB_TESTER = E2E_BUILTIN_AGENT["web-tester"].name;
const REVIEWER = E2E_BUILTIN_AGENT["reviewer"].name;
const CLI_DEV = E2E_BUILTIN_AGENT["cli-developer"].name;
const API_TESTER = E2E_BUILTIN_AGENT["api-tester"].name;

/**
 * One skill, assigned lazily to every sub-agent the payload wants tuned.
 *
 * Global-scoped, because the sub-agents here rest at the shared selection default: a
 * project-scoped skill assigned to a sub-agent resting there is a pair the config model cannot
 * express, and the decode refuses it rather than dropping the rows. A global skill reaches every
 * sub-agent whatever scope it rests at, which keeps tuning the only subject of these specs.
 */
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
    // Which sub-agent takes which row is arbitrary — the bundled roster is uniformly `opus`, so no
    // choice of agent makes the OPUS row's frontmatter assertion discriminating: a mapper that
    // dropped `opus` from what it forwards would still compile `model: opus` off the metadata.
    // The config assertion below is what carries that row: an override that never arrived writes
    // no `model` key, and `toStrictEqual` against one that names it fails. The other three rows
    // name values no metadata declares, so their frontmatter assertions stand on their own.
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

    // config.ts is what a later edit or recompile reads back, so it has to agree.
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

    // Model only: effort has no default, so no line at all rather than an invented one.
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(WEB_DEV, {
      model: "haiku",
      noEffort: true,
    });
    // Effort only: the model stays whatever api-tester's own metadata declares. Dropping it
    // instead renders `model: inherit` (`agent.liquid`'s fallback), and the sibling above pins
    // `haiku` in the same payload, so an entry's model bleeding across sub-agents fails here too.
    // What this cannot see, with the bundled roster uniformly `opus`: a resolver answering a
    // hardcoded `opus` in place of reading the metadata. No E2E fixture can, because the roster it
    // installs from is the shipped one. That failure mode belongs to the unit layer, where the
    // definitions are the spec's own to pin off `opus`.
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

    // A default that never reached the template renders `model: inherit`, which is what this
    // catches; effort has no default at all, so its correct outcome is no key. The same uniform-
    // roster limit as the spec above applies to the model half, and here there is not even a
    // tuned sibling to rule out a bleed — the payload names one sub-agent, deliberately.
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(API_TESTER, {
      model: E2E_BUILTIN_AGENT["api-tester"].defaultModel,
      noEffort: true,
    });
    // Nothing to override, so the config entry carries neither tuning key — and the scope it does
    // carry is the shared selection default, which is what put the compiled file in HOME above.
    expect(await readAgentEntriesFor(env.projectDir, API_TESTER)).toStrictEqual(
      buildAgentConfigs([API_TESTER], { scope: "global" }),
    );
  });

  it("refuses a second id over an installed first, leaving the first id's tuning in place", async () => {
    env = await createTestEnvironment({ permissions: false });
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    // Both payloads pin the sub-agent into the project, unlike every other spec in this file, so
    // the tuning under test is written where these assertions read it.
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
    // Proof the second run had something to change: without this the assertions below could hold
    // on an install that never carried the first id's tuning at all.
    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, {
      model: "sonnet",
      effort: "low",
    });

    const configBefore = await readTestFile(configTsPath(env.projectDir));
    const agentsBefore = await listFiles(agentsPath(env.projectDir));

    // `--from` is greenfield-only: a second id does not re-tune an installation, it refuses it.
    // Re-tuning a shared configuration means uninstalling and installing the new one.
    const second = await runInitFrom(store, "Retune02", project, sourceDir);

    expect(second.exitCode).toBe(EXIT_CODES.ERROR);
    const said = flattenCliOutput(second.output);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_EXISTING_INSTALL);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_UNINSTALL_HINT);

    // The first install is byte-for-byte what it was, and still says what it said.
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
