import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  applyEditFrom,
  createGlobalOnlyEnvFromSeed,
  e2eStackPayload,
} from "../fixtures/e2e-stack-seed.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  loadConfigOrFail,
  readCompiledAgents,
  readTestFile,
  readTreeSnapshot,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { buildSeedSkill } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { SkillConfig } from "../../src/cli/types/index.js";

/** Assigned to no agent by the E2E stack, so the edit has something genuinely new to add. */
const SPARE_SKILL = E2E_SKILL["visual-regression"];

const STACK_PAYLOAD = e2eStackPayload({ scope: "global" });
const STACK_ID = "Outside1";

const STACK_AND_SPARE_ID = "Outside2";
const STACK_AND_SPARE_PAYLOAD = {
  ...STACK_PAYLOAD,
  skills: {
    ...STACK_PAYLOAD.skills,
    [SPARE_SKILL.id]: buildSeedSkill({
      install: "eject",
      scope: "global",
      assignments: { [E2E_AGENT["web-developer"].name]: "lazy" },
    }),
  },
};

/**
 * The control adds at project scope: a global addition reaches a registered project's config pair
 * by propagation whichever installation the run edited, while a project one is refused at home.
 */
const STACK_AND_PROJECT_SPARE_ID = "Outside3";
const STACK_AND_PROJECT_SPARE_PAYLOAD = e2eStackPayload({
  plus: { [SPARE_SKILL.id]: [] },
  projectSkills: [SPARE_SKILL.id],
});

describe("edit from a directory that holds no installation", () => {
  let store: SeedConfigStore;
  let tempDir: string;
  let fakeHome: string;
  let bareDir: string;

  let bareEditExitCode: number;
  let bareEditOutput: string;
  let bareTreeBefore: Record<string, TreeSnapshotEntry>;
  let bareTreeAfter: Record<string, TreeSnapshotEntry>;
  let globalSkillsAfter: SkillConfig[];
  let globalAgentFilesAfter: string[];
  let globalConfigTypesAfter: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(STACK_ID, STACK_PAYLOAD);
    store.publish(STACK_AND_SPARE_ID, STACK_AND_SPARE_PAYLOAD);

    const env = await createTestEnvironment();
    tempDir = env.tempDir;
    fakeHome = env.fakeHome;
    // Only `.claude/settings.json`; nothing is ever installed into it.
    bareDir = env.projectDir;

    const phaseA = await runInitFrom(store, STACK_ID, { dir: fakeHome }, E2E_SOURCE.sourceDir);
    expect(phaseA.exitCode, `global install failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

    bareTreeBefore = await readTreeSnapshot(bareDir);

    // Adds a skill, so an untouched directory means no authority to write, not nothing to write.
    ({ exitCode: bareEditExitCode, output: bareEditOutput } = await applyEditFrom(
      store,
      STACK_AND_SPARE_ID,
      { dir: bareDir, globalHome: fakeHome },
    ));

    bareTreeAfter = await readTreeSnapshot(bareDir);
    globalSkillsAfter = (await loadConfigOrFail(fakeHome)).skills;
    globalAgentFilesAfter = Object.keys(await readCompiledAgents(fakeHome)).sort();
    globalConfigTypesAfter = await readTestFile(configTypesTsPath(fakeHome));
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("completes the edit", () => {
    expect(bareEditExitCode, `edit from a bare directory failed: ${bareEditOutput}`).toBe(
      EXIT_CODES.SUCCESS,
    );
  });

  it("records the added skill at global scope in the global config", () => {
    expect(
      globalSkillsAfter.filter((skill) => skill.id === SPARE_SKILL.id),
      "the skill added from a bare directory belongs to the installation that was edited",
    ).toStrictEqual([{ id: SPARE_SKILL.id, scope: "global", origin: "eject" }]);
  });

  it("compiles the global installation's own sub-agents, and only those", () => {
    expect(
      globalAgentFilesAfter,
      "the compiled roster belongs to the installation the run edited",
    ).toStrictEqual(E2E_STACK_AGENTS.map((agent) => `${agent}.md`).sort());
  });

  it("narrows the global config-types.ts to the roster the edit left", () => {
    expect(
      globalConfigTypesAfter,
      "the added skill must reach the type surface its config.ts is checked against",
    ).toContain(SPARE_SKILL.id);
  });

  it("leaves the directory it was started in byte-identical", () => {
    expect(
      bareTreeAfter,
      "a directory holding no installation must come out of an edit untouched",
    ).toStrictEqual(bareTreeBefore);
  });
});

describe("edit from a directory that holds an installation", () => {
  let store: SeedConfigStore;
  let env: DualScopeEnv | undefined;
  let installedDir: string;
  let globalHome: string;

  let editExitCode: number;
  let editOutput: string;
  let projectSkillsAfter: SkillConfig[];
  let projectConfigTypesAfter: string;
  let globalSkillsAfter: SkillConfig[];

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(STACK_AND_PROJECT_SPARE_ID, STACK_AND_PROJECT_SPARE_PAYLOAD);

    // The same global install, with a project installation of it in the directory the edit starts in.
    env = await createGlobalOnlyEnvFromSeed(store);
    installedDir = env.projectDir;
    globalHome = env.fakeHome;

    ({ exitCode: editExitCode, output: editOutput } = await applyEditFrom(
      store,
      STACK_AND_PROJECT_SPARE_ID,
      { dir: installedDir, globalHome },
    ));

    projectSkillsAfter = (await loadConfigOrFail(installedDir)).skills;
    projectConfigTypesAfter = await readTestFile(configTypesTsPath(installedDir));
    globalSkillsAfter = (await loadConfigOrFail(globalHome)).skills;
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await env?.destroy();
    await store.close();
  });

  it("completes the edit", () => {
    expect(editExitCode, `edit from an installed directory failed: ${editOutput}`).toBe(
      EXIT_CODES.SUCCESS,
    );
  });

  it("records the added skill at project scope in that installation's own config", () => {
    expect(
      projectSkillsAfter.filter((skill) => skill.id === SPARE_SKILL.id),
      "the skill added from an installed directory belongs to the installation it was started in",
    ).toStrictEqual([{ id: SPARE_SKILL.id, scope: "project", origin: "eject" }]);
  });

  it("narrows that installation's own config-types.ts to the skill the edit added", () => {
    expect(
      projectConfigTypesAfter,
      "the added skill must reach the type surface the project's config.ts is checked against",
    ).toContain(SPARE_SKILL.id);
  });

  it("copies the added skill into that installation rather than the global one", async () => {
    await expect({ dir: installedDir }).toHaveSkillCopied(SPARE_SKILL.id);
    await expect({ dir: globalHome }).not.toHaveSkillCopied(SPARE_SKILL.id);
  });

  it("leaves the global config without the skill the project added", () => {
    expect(
      globalSkillsAfter.filter((skill) => skill.id === SPARE_SKILL.id),
      "a project-scope addition is the project's alone",
    ).toStrictEqual([]);
  });
});
