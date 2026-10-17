import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL, E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { applyEditFrom, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
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

/**
 * `edit` started in a directory with no installation edits the global one it found: the global
 * install gains what the run added, and the directory's whole tree is byte-identical afterwards.
 */

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
