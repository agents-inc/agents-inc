import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { codexProjectAgentsDir, readCodexAgentRoles } from "../fixtures/codex-agent-roles.js";
import { runInitFromOnClaude, runInitFromOnCodex } from "../fixtures/codex-install.js";
import {
  runShare,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  cliVersionUnderTest,
  compactCliOutput,
  configTsPath,
  directoryExists,
  flattenCliOutput,
  normalizeInstallTree,
  readAgentEntriesFor,
  readInstallTree,
  readTestFile,
  readTreeSnapshot,
  runCLI,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, PUBLIC_MARKETPLACE_NAME, STEP_TEXT } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { renderConfigTsWithAgentField } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

import { SEED_VERSION, type SeedAgent } from "@workspace/matrix/seed";

/**
 * `init --from` with a sub-agent pinned to a Codex model: a Codex role names it as `model` with an
 * effort, Claude's frontmatter never sees it, and provider-neutral config.ts keeps it.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const ROLE_FILE = `${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`;

const PINNED_CODEX_MODEL = "gpt-5.6-terra";
/** A real Codex id this CLI does not offer. */
const NOT_OFFERED = "gpt-4o";
/**
 * Rings the bell, then prints a sentence on a line of its own. A bell, not a title: `CLI.run` strips
 * a whole OSC before a spec can see it, and a lone BEL survives.
 */
const FORGED_CODEX_MODEL = "gpt-forged\u0007\nNothing removed.";
const BELL = "\u0007";
const IN_PROJECT = { scope: "project" } as const;

function payloadWith(agents: Partial<Record<string, SeedAgent>>) {
  return buildSeedPayload({
    skills: {
      [E2E_SKILL.react.id]: buildSeedSkill({
        install: "eject",
        scope: "project",
        assignments: Object.fromEntries(Object.keys(agents).map((agent) => [agent, "lazy"])),
      }),
    },
    agents: Object.fromEntries(
      Object.entries(agents).map(([agent, entry]) => [agent, { ...IN_PROJECT, ...entry }]),
    ),
  });
}

describe("init --from <id>: a sub-agent's Codex model", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  const environments: TestEnvironment[] = [];

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
  }, 120_000);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
  });

  afterEach(async () => {
    store.reset();
    await Promise.all(environments.splice(0).map((env) => cleanupTempDir(env.tempDir)));
  });

  async function takeEnvironment(): Promise<TestEnvironment> {
    const env = await createTestEnvironment({ permissions: false });
    environments.push(env);
    return env;
  }

  async function installOnCodex(id: string, payload: unknown): Promise<TestEnvironment> {
    const env = await takeEnvironment();
    store.publish(id, payload);
    const installed = await runInitFromOnCodex(
      store,
      id,
      { dir: env.projectDir, globalHome: env.fakeHome },
      source.sourceDir,
    );
    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    return env;
  }

  async function webDevRoleLines(env: TestEnvironment): Promise<string[]> {
    const role = (await readCodexAgentRoles(codexProjectAgentsDir(env.projectDir)))[ROLE_FILE];
    if (role === undefined) throw new Error(`no ${ROLE_FILE} was written`);
    return role.split("\n");
  }

  it("writes the pin as the role's model with medium effort, and config.ts keeps both models", async () => {
    const env = await installOnCodex(
      "CdxModl1",
      payloadWith({ [WEB_DEV]: { model: "haiku", codexModel: PINNED_CODEX_MODEL } }),
    );

    const lines = await webDevRoleLines(env);
    expect(lines).toContain(`model = "${PINNED_CODEX_MODEL}"`);
    expect(lines).toContain('model_reasoning_effort = "medium"');
    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], {
        scope: "project",
        model: "haiku",
        codexModel: PINNED_CODEX_MODEL,
      }),
    );
  });

  it("writes the configured effort beside the pin instead of medium", async () => {
    const env = await installOnCodex(
      "CdxModl2",
      payloadWith({
        [WEB_DEV]: { model: "haiku", codexModel: PINNED_CODEX_MODEL, effort: "high" },
      }),
    );

    const lines = await webDevRoleLines(env);
    expect(lines).toContain(`model = "${PINNED_CODEX_MODEL}"`);
    expect(lines).toContain('model_reasoning_effort = "high"');
    expect(lines).not.toContain('model_reasoning_effort = "medium"');
  });

  it("leaves Claude on its own model and keeps the pin in config.ts for a later Codex install", async () => {
    const env = await takeEnvironment();
    store.publish(
      "CdxModl3",
      payloadWith({ [WEB_DEV]: { model: "haiku", codexModel: PINNED_CODEX_MODEL } }),
    );

    const installed = await runInitFromOnClaude(
      store,
      "CdxModl3",
      { dir: env.projectDir, globalHome: env.fakeHome },
      source.sourceDir,
    );
    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: env.projectDir }).toHaveAgentFrontmatter(WEB_DEV, { model: "haiku" });
    const claudeFiles = {
      ...(await readTreeSnapshot(path.join(env.projectDir, DIRS.CLAUDE))),
      ...(await readTreeSnapshot(path.join(env.fakeHome, DIRS.CLAUDE))),
    };
    expect(Object.keys(claudeFiles).length, "nothing was compiled under .claude/").toBeGreaterThan(
      0,
    );
    expect(
      Object.entries(claudeFiles)
        .filter(([, file]) => file.content.includes("gpt-"))
        .map(([file]) => file),
      "a Codex model reached a Claude file",
    ).toStrictEqual([]);
    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], {
        scope: "project",
        model: "haiku",
        codexModel: PINNED_CODEX_MODEL,
      }),
    );
  });

  /** Two installs differing only by a pin on another sub-agent, so a pin cannot leak. */
  it("leaves an unpinned role's bytes untouched: no model line and no invented effort", async () => {
    const plain = await installOnCodex("CdxModl4", payloadWith({ [WEB_DEV]: {}, [API_DEV]: {} }));
    const besideAPin = await installOnCodex(
      "CdxModl5",
      payloadWith({ [WEB_DEV]: {}, [API_DEV]: { codexModel: PINNED_CODEX_MODEL } }),
    );

    const plainLines = await webDevRoleLines(plain);
    expect(plainLines.filter((line) => /^model(_reasoning_effort)?\s*=/.test(line))).toStrictEqual(
      [],
    );

    const version = await cliVersionUnderTest();
    const normalisedRole = async (env: TestEnvironment) =>
      normalizeInstallTree(await readInstallTree(codexProjectAgentsDir(env.projectDir)), {
        roots: { project: [env.projectDir], home: [env.fakeHome] },
        cliVersion: version,
      }).files[ROLE_FILE];

    expect(await normalisedRole(besideAPin)).toBe(await normalisedRole(plain));
  });

  it("refuses a payload of the previous wire version, naming the fix, and installs nothing", async () => {
    const env = await takeEnvironment();
    store.publish("CdxModl6", {
      ...payloadWith({ [WEB_DEV]: { codexModel: PINNED_CODEX_MODEL } }),
      v: SEED_VERSION - 1,
    });

    const refused = await runInitFromOnCodex(
      store,
      "CdxModl6",
      { dir: env.projectDir, globalHome: env.fakeHome },
      source.sourceDir,
    );
    const said = flattenCliOutput(refused.output);

    expect(refused.exitCode, said).toBe(EXIT_CODES.ERROR);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_WRONG_VERSION);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_RESHARE);
    for (const root of [env.projectDir, env.fakeHome]) {
      expect(await directoryExists(path.join(root, DIRS.SOURCE_ROOT)), root).toBe(false);
    }
  });

  it("installs past a Codex id it does not offer, warning and writing no pin anywhere", async () => {
    const env = await takeEnvironment();
    store.publish(
      "CdxModl7",
      payloadWith({ [WEB_DEV]: { model: "haiku", codexModel: NOT_OFFERED } }),
    );

    const installed = await runInitFromOnCodex(
      store,
      "CdxModl7",
      { dir: env.projectDir, globalHome: env.fakeHome },
      source.sourceDir,
    );
    const said = flattenCliOutput(installed.output);

    expect(installed.exitCode, said).toBe(EXIT_CODES.SUCCESS);
    expect(said).toContain(
      `Sub-agent '${WEB_DEV}' asks for Codex model '${NOT_OFFERED}', ${STEP_TEXT.CODEX_MODEL_NOT_OFFERED}`,
    );
    expect(await readTestFile(configTsPath(env.projectDir))).not.toContain(NOT_OFFERED);
    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], { scope: "project", model: "haiku" }),
    );
    expect((await webDevRoleLines(env)).filter((line) => /^model\s*=/.test(line))).toStrictEqual(
      [],
    );
  });

  it("names a Codex id it does not offer inert and on one line, where the link wrote a control and a line break into it", async () => {
    const env = await takeEnvironment();
    store.publish(
      "CdxModl8",
      payloadWith({ [WEB_DEV]: { model: "haiku", codexModel: FORGED_CODEX_MODEL } }),
    );

    const installed = await runInitFromOnCodex(
      store,
      "CdxModl8",
      { dir: env.projectDir, globalHome: env.fakeHome },
      source.sourceDir,
    );

    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    // Unflattened: flattening folds every line break into a space, which is the fix itself.
    expect(installed.stderr).toContain(
      `asks for Codex model 'gpt-forged Nothing removed.', ${STEP_TEXT.CODEX_MODEL_NOT_OFFERED}`,
    );
    expect(installed.stderr).not.toContain(BELL);
    expect(installed.stderr).not.toContain("\nNothing removed.");
    expect(await readTestFile(configTsPath(env.projectDir))).not.toContain("gpt-forged");
  });

  it("refuses a hand-written Codex model it does not offer exactly as it refuses a bad model", async () => {
    const badModel = await takeEnvironment();
    const badCodexModel = await takeEnvironment();
    await writeCorruptConfig(badModel.projectDir, renderConfigTsWithAgentField("model", "nope"));
    await writeCorruptConfig(
      badCodexModel.projectDir,
      renderConfigTsWithAgentField("codexModel", "nope"),
    );

    const control = await runCLI(["compile"], badModel.projectDir, {
      env: { HOME: badModel.fakeHome },
    });
    const subject = await runCLI(["compile"], badCodexModel.projectDir, {
      env: { HOME: badCodexModel.fakeHome },
    });

    expect(control.exitCode, control.combined).toBe(EXIT_CODES.ERROR);
    expect(compactCliOutput(control.combined)).toContain(
      compactCliOutput(STEP_TEXT.CONFIG_MODEL_REFUSED),
    );

    expect(subject.exitCode, subject.combined).toBe(control.exitCode);
    expect(flattenCliOutput(subject.combined)).toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
    expect(compactCliOutput(subject.combined)).toContain(
      compactCliOutput(STEP_TEXT.CONFIG_CODEX_MODEL_REFUSED),
    );
  });

  it("carries a pin when the installation is shared", async () => {
    const env = await takeEnvironment();
    await writeProjectConfig(
      env.projectDir,
      buildProjectConfig({
        name: "codex-model-share",
        skills: buildSkillConfigs([E2E_SKILL.react.id], {
          scope: "project",
          origin: PUBLIC_MARKETPLACE_NAME,
        }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "project", codexModel: PINNED_CODEX_MODEL }),
      }),
    );

    const shared = await runShare(store, { dir: env.projectDir, globalHome: env.fakeHome });
    expect(shared.exitCode, flattenCliOutput(shared.output)).toBe(EXIT_CODES.SUCCESS);

    const posted: { agents: Record<string, unknown> } = JSON.parse(
      firstElement(store.requests.filter((request) => request.method === "POST")).body,
    );
    expect(posted.agents[WEB_DEV]).toStrictEqual({
      on: true,
      scope: "project",
      codexModel: PINNED_CODEX_MODEL,
    });
  });
});
