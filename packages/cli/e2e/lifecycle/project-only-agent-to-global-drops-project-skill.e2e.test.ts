import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  directoryExists,
  fileExists,
  loadConfigOrFail,
  readAgentEntriesFor,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { applyFromSeed, e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";

const API_DEVELOPER = E2E_AGENT["api-developer"].name;
const API_DEVELOPER_FILE = `${API_DEVELOPER}.md`;

/**
 * `api-developer`'s whole stack once global: no `api-api` key at all. `preloaded: false` is
 * spelled out because `loadConfigOrFail` normalizes every assignment.
 */
const GLOBAL_API_DEVELOPER_STACK = {
  "meta-methodology": [{ id: E2E_SKILL["research-methodology"].id, preloaded: false }],
  "meta-reviewing": [{ id: E2E_SKILL.reviewing.id, preloaded: false }],
};

/** The departure control: the `api-api` key existed before the move. */
const PROJECT_API_DEVELOPER_STACK = {
  ...GLOBAL_API_DEVELOPER_STACK,
  "api-api": [{ id: E2E_SKILL.hono.id, preloaded: true }],
};

/**
 * Project skills never reach global agents, so the move drops the skill by design, with a warning.
 * Not a dual-scope fixture, so the move is a genuine P->G departure.
 */
describe("a project-only sub-agent moved to global scope", () => {
  let store: SeedConfigStore;
  let testTempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (testTempDir) await cleanupTempDir(testTempDir);
    testTempDir = undefined;
  });

  it(
    "drops its project-scoped skill from the compiled agent, keeps its global ones, and says the skill now reaches nothing",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;

      const project = { dir: projectDir, home: fakeHome };

      // A scratch project install, every skill ejected, with no global install underneath.
      await installFromSeed(
        store,
        "ProjectOnly1",
        e2eStackPayload({ projectSkills: [E2E_SKILL.hono.id], projectAgents: [API_DEVELOPER] }),
        project,
      );

      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the fixture must hold a project-only skill — a dual-scope pair would make the move a collapse",
      ).toStrictEqual([
        {
          id: E2E_SKILL.hono.id,
          scope: "project",
          origin: "eject",
          displayName: E2E_SKILL.hono.display,
        },
      ]);
      expect(
        await readAgentEntriesFor(projectDir, API_DEVELOPER),
        "the fixture must hold a project-only sub-agent",
      ).toStrictEqual([{ name: API_DEVELOPER, scope: "project" }]);

      await expect({ dir: projectDir }).toHaveCompiledAgentContent(API_DEVELOPER, {
        contains: [E2E_SKILL.hono.id, E2E_SKILL["research-methodology"].id, E2E_SKILL.reviewing.id],
      });
      expect(
        await fileExists(path.join(agentsPath(fakeHome), API_DEVELOPER_FILE)),
        "the sub-agent must not already exist at global scope, or its arrival there proves nothing",
      ).toBe(false);
      expect(
        (await loadConfigOrFail(projectDir)).stack?.[API_DEVELOPER],
        "the project partition must record the whole stack while the sub-agent is project-scoped",
      ).toStrictEqual(PROJECT_API_DEVELOPER_STACK);

      const { output: editOutput } = await applyFromSeed(
        store,
        "AgentToGlobal1",
        e2eStackPayload({ projectSkills: [E2E_SKILL.hono.id], unassigned: [E2E_SKILL.hono.id] }),
        project,
      );

      // The kept global-scoped skills guard that the frame is the right, non-empty file.
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent(API_DEVELOPER, {
        contains: [E2E_SKILL["research-methodology"].id, E2E_SKILL.reviewing.id],
        notContains: [E2E_SKILL.hono.id],
      });

      // P->G is a move for a sub-agent.
      expect(
        await fileExists(path.join(agentsPath(projectDir), API_DEVELOPER_FILE)),
        `${API_DEVELOPER_FILE} must not exist at project scope after the P->G move`,
      ).toBe(false);

      expect(
        await readAgentEntriesFor(fakeHome, API_DEVELOPER),
        "the global config must own the sub-agent after the move",
      ).toStrictEqual([{ name: API_DEVELOPER, scope: "global" }]);

      // Absent, not merely emptied.
      expect(
        (await loadConfigOrFail(fakeHome)).stack?.[API_DEVELOPER],
        "a global sub-agent's stack must carry the global skills and none of the project ones",
      ).toStrictEqual(GLOBAL_API_DEVELOPER_STACK);

      // The project config's own `stack` is not asserted: the writer drops now-global sub-agents
      // from it whatever the scope filter did.

      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.hono.id)),
        "the skill must stay installed at project scope — losing its assignment is not an uninstall",
      ).toBe(true);
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the skill must stay recorded at project scope",
      ).toStrictEqual([
        {
          id: E2E_SKILL.hono.id,
          scope: "project",
          origin: "eject",
          displayName: E2E_SKILL.hono.display,
        },
      ]);

      // The sub-agent is quoted: its bare name also matches the change summary row.
      expect(editOutput).toContain(STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT);
      expect(editOutput).toContain(E2E_SKILL.hono.id);
      expect(editOutput).toContain(STEP_TEXT.STACK_PAIR_DROPPED_BY_SCOPE);
      expect(editOutput).toContain(`'${API_DEVELOPER}'`);
    },
  );
});
