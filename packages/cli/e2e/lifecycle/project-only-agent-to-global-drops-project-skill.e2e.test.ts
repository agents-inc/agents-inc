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

/** The sub-agent that changes scope, and the file it compiles to. */
const API_DEVELOPER = E2E_AGENT["api-developer"].name;
const API_DEVELOPER_FILE = `${API_DEVELOPER}.md`;

/**
 * The whole of `api-developer`'s stack once it is global: the two GLOBAL-scoped meta
 * skills, and no `api-api` key at all — the category the project-scoped skill lived in.
 *
 * Held as one `toStrictEqual` rather than as a pair of contains/not-contains, so a
 * project-scoped assignment that leaked back in reddens whichever category it lands in.
 *
 * `preloaded: false` is explicit because these are read through `loadConfigOrFail`, and
 * `loadProjectConfigFromDir` runs `normalizeStackRecord` over the stack — every assignment
 * comes back with the flag spelled out. It is also the substantive claim for these two:
 * the only preload `api-developer` ever had was the project-scoped skill that just left.
 */
const GLOBAL_API_DEVELOPER_STACK = {
  "meta-methodology": [{ id: E2E_SKILL["research-methodology"].id, preloaded: false }],
  "meta-reviewing": [{ id: E2E_SKILL.reviewing.id, preloaded: false }],
};

/**
 * The same sub-agent's stack while it is still PROJECT-scoped — `GLOBAL_API_DEVELOPER_STACK`
 * plus the `api-api` preload that the move to global scope is about to cost it.
 *
 * The departure control for the assertion above: without it, an `api-api` key that was never
 * built in the first place reads exactly like one the scope filter removed.
 */
const PROJECT_API_DEVELOPER_STACK = {
  ...GLOBAL_API_DEVELOPER_STACK,
  "api-api": [{ id: E2E_SKILL.hono.id, preloaded: true }],
};

/**
 * A project-only sub-agent moved to GLOBAL scope loses the project-scoped skill it
 * carried, because a global sub-agent may not carry one.
 *
 * The mechanism is `isScopePairCompatible` in `lib/configuration/config-generator.ts` —
 * "project skills never reach global agents" — applied as the first filter in
 * `buildAgentStack`. **This is DESIGNED behaviour, ruled correct by the owner: the
 * assignment is meant to disappear, and the skill is meant to be left installed and
 * loaded by nobody.** This spec pins the design; it is not a defect report, and the
 * warning asserted at the end is the product telling the user so.
 *
 * The fixture is deliberately NOT a dual-scope one: from a persisted `[P][G]` pair the
 * global half was compiled before the move ever ran, so nothing about the scope filter is
 * exercised. Here `api-framework-hono` and `api-developer` are PROJECT-ONLY (a scratch project
 * init, no prior global install, so neither has a global half), and the move is a genuine
 * P->G departure. The configuration that moves the sub-agent leaves the skill assigned to no
 * sub-agent, since a shared configuration cannot pair a global sub-agent with a project skill.
 *
 * The negative assertion carries a positive subject guard in the SAME captured frame: the
 * newly-global `api-developer.md` must still carry the two global-scoped meta skills. An
 * absence assertion on its own passes over an empty file, a missing file or the wrong file.
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

      // PHASE A -- a scratch project install with a project-scoped skill assigned to a
      // project-scoped sub-agent, every skill ejected so the one that ends up assigned to
      // nothing is observable on disk. No global install underneath either of them, so no
      // dual-scope pair exists anywhere in this fixture.
      await installFromSeed(
        store,
        "ProjectOnly1",
        e2eStackPayload({ projectSkills: [E2E_SKILL.hono.id], projectAgents: [API_DEVELOPER] }),
        project,
      );

      // The fixture's defining property: both are project-ONLY. A single entry each,
      // at project scope, with no global row and no tombstone beside it.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the fixture must hold a project-only skill — a dual-scope pair would make the move a collapse",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "project", origin: "eject" }]);
      expect(
        await readAgentEntriesFor(projectDir, API_DEVELOPER),
        "the fixture must hold a project-only sub-agent",
      ).toStrictEqual([{ name: API_DEVELOPER, scope: "project" }]);

      // The departure state, on every surface the move takes it off.
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

      // PHASE B -- move the sub-agent P->G.
      const { output: editOutput } = await applyFromSeed(
        store,
        "AgentToGlobal1",
        e2eStackPayload({ projectSkills: [E2E_SKILL.hono.id], unassigned: [E2E_SKILL.hono.id] }),
        project,
      );

      // THE POINT. One frame, read once: the project-scoped skill is gone from the
      // newly-global sub-agent, and the two global-scoped ones it kept are the positive
      // subject guard that the frame is the right file and is not empty.
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent(API_DEVELOPER, {
        contains: [E2E_SKILL["research-methodology"].id, E2E_SKILL.reviewing.id],
        notContains: [E2E_SKILL.hono.id],
      });

      // P->G is a MOVE for a sub-agent: the project's compiled copy is gone.
      expect(
        await fileExists(path.join(agentsPath(projectDir), API_DEVELOPER_FILE)),
        `${API_DEVELOPER_FILE} must not exist at project scope after the P->G move`,
      ).toBe(false);

      // The config half of the same move, at both scopes.
      expect(
        await readAgentEntriesFor(fakeHome, API_DEVELOPER),
        "the global config must own the sub-agent after the move",
      ).toStrictEqual([{ name: API_DEVELOPER, scope: "global" }]);

      // The stack the config records, exhaustively — the `api-api` category the
      // project-scoped skill lived in must be absent, not merely emptied. Compared against
      // `PROJECT_API_DEVELOPER_STACK`, which the same read returned one phase ago, this is
      // the departure rather than a key nobody ever filled.
      expect(
        (await loadConfigOrFail(fakeHome)).stack?.[API_DEVELOPER],
        "a global sub-agent's stack must carry the global skills and none of the project ones",
      ).toStrictEqual(GLOBAL_API_DEVELOPER_STACK);

      // NOT asserted here: the project config's own `stack`. It comes back absent, but the
      // project writer filters that stack to PROJECT-scoped sub-agents (`config-writer.ts`),
      // so a row for a now-global sub-agent is dropped at emission whatever the scope filter
      // did. An assertion there would read as this spec's subject and could not fail for it.

      // The orphan is real: still installed, still recorded, loaded by nobody.
      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.hono.id)),
        "the skill must stay installed at project scope — losing its assignment is not an uninstall",
      ).toBe(true);
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the skill must stay recorded at project scope",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "project", origin: "eject" }]);

      // And the run says so, naming the skill and the sub-agent the rule kept it from.
      // Both sentinels rather than the composed sentences: the wording is the
      // implementer's and lives in those two constants. The skill id and the sub-agent
      // name are the spec's own, so they are named here — the sub-agent QUOTED, because
      // its bare name is also the change summary's `~ api-developer ([P] → [G])` row and
      // an unquoted match would pass on that alone.
      expect(editOutput).toContain(STEP_TEXT.SKILL_ASSIGNED_TO_NO_AGENT);
      expect(editOutput).toContain(E2E_SKILL.hono.id);
      expect(editOutput).toContain(STEP_TEXT.STACK_PAIR_DROPPED_BY_SCOPE);
      expect(editOutput).toContain(`'${API_DEVELOPER}'`);
    },
  );
});
