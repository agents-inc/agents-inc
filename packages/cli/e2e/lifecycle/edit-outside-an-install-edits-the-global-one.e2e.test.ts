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
 * `cc edit` started in a directory that holds no installation edits the installation it
 * FOUND — the global one — rather than inventing a project out of the directory it was
 * started in.
 *
 * The command names no directory. It detects an installation, and detection falls back to
 * `$HOME` when the working directory has no config of its own, so `cc edit --from` in an
 * unrelated checkout is a request to edit the GLOBAL install. `edit` used to read that
 * directory as a project anyway: the write path split by scope and wrote a source-folder pair
 * into the directory, and the compile ran twice, dropping `.claude/agents/` beside it.
 *
 * The positive half is the global installation gaining what the run added; the negative half
 * is a whole-tree snapshot rather than four separate absences: the directory must come out of
 * the run byte-identical, which covers the config pair, the compiled agents and anything else
 * a stray write would leave.
 */

/** The skill the E2E stack assigns to no agent, so an edit has something genuinely new to add. */
const SPARE_SKILL = E2E_SKILL["visual-regression"];

/** The E2E stack, every skill ejected into the global installation. */
const STACK_PAYLOAD = e2eStackPayload({ scope: "global" });
const STACK_ID = "Outside1";

/** The same configuration with the spare added to the web sub-agent. */
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
    // `createTestEnvironment` leaves this directory bare — a `.claude/settings.json` and
    // nothing else. Only the global install runs, so nothing is ever installed into it.
    bareDir = env.projectDir;

    const phaseA = await runInitFrom(store, STACK_ID, { dir: fakeHome }, E2E_SOURCE.sourceDir);
    expect(phaseA.exitCode, `global install failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

    bareTreeBefore = await readTreeSnapshot(bareDir);

    // The subject: `cc edit --from` from the bare directory, adding a skill so the run has real
    // work to persist. A pass-through would leave the directory untouched for want of
    // anything to write rather than for want of authority to write it.
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
