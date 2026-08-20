import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  readAgentEntriesFor,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createDualScopeEnv,
  createGlobalOnlyEnv,
  readSkillEntries,
  runEditWithFirstSkillAction,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * D-260 — `s` round-trips a `[P][G]` pair, and the two keys own different halves
 * of it.
 *
 * Wanted binding, for a PERSISTED dual-scope pair (active project entry plus a
 * global excluded tombstone):
 *
 *   - `s` round-trips BOTH ways: `[P][G]` --s--> `[G]` --s--> `[P][G]`.
 *   - SKILLS: spacebar drops the half the PROJECT owns, collapsing the pair to
 *     the inherited `[G]` it was masking. The global install underneath is
 *     untouched — nothing project scope may not do.
 *   - AGENTS: spacebar stays a no-op that emits the global-locked agent toast.
 *     The agent-side pair is locked to `s` as a whole; only the skill guard was
 *     narrowed to global-owned halves.
 *
 * Both suites run against a real `cc edit` session with `HOME` pointed at a fake
 * home distinct from the project dir, so the run exercises genuine PROJECT scope
 * (a run where `HOME === projectDir` silently becomes a global edit, where every
 * scope guard is bypassed and the assertions below would be vacuous).
 *
 * Every session here is aborted, never saved: the seeded config.ts must stay
 * byte-identical and the compiled artefacts at both scopes must survive.
 */

describe("dual-scope `s` round-trip, and what spacebar owns beside it", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "skill: `s` round-trips [P][G] both ways and spacebar drops the project half",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // Seed a PERSISTED [P][G] pair: a real `s` toggle on the first-focused Web
      // skill, saved through to completion.
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.react.id),
        "setup must persist an active project entry plus a global tombstone",
      ).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
      ]);

      const projectConfigPath = configTsPath(projectDir);
      const configBefore = await readTestFile(projectConfigPath);

      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      try {
        // Focus react explicitly rather than relying on where the grid opens: every
        // `s`/space below acts on the focused skill (focus persists across them).
        await wizard.build.focusSkill(E2E_SKILL.react.display);

        // Baseline: the persisted pair renders both badges and the skill is the
        // one selected framework.
        expect(
          [...(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display))].sort(),
          "a persisted dual-scope skill must render both [P] and [G] badges",
        ).toStrictEqual(["G", "P"]);
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
          "the dual-scope skill must start out as the one selected framework",
        ).toBe(1);

        // `s` collapses the pair to the single inherited-global entry.
        await wizard.build.toggleScopeOnFocusedSkill();
        expect(
          await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
          "`s` on a persisted dual-scope skill must collapse [P][G] to [G]",
        ).toStrictEqual(["G"]);

        // `s` again restores the pair — one key drives both directions.
        await wizard.build.toggleScopeOnFocusedSkill();
        expect(
          [...(await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display))].sort(),
          "`s` must round-trip the collapsed row back to [P][G]",
        ).toStrictEqual(["G", "P"]);

        // Spacebar on the restored pair drops the project half — the project owns
        // that entry — and the masked global install surfaces in its place, so the
        // skill is still the one selected framework.
        await wizard.build.toggleFocusedSkill();
        expect(
          await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
          "spacebar must drop the project half and leave the inherited global badge",
        ).toStrictEqual(["G"]);
        expect(
          await wizard.build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
          "the skill stays selected after the project half goes — it is still active globally",
        ).toBe(1);
      } finally {
        await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      }

      // Aborted session: config.ts and both scopes' skill dirs are untouched.
      expect(
        await readTestFile(projectConfigPath),
        "an aborted session must not rewrite config.ts",
      ).toBe(configBefore);
      expect(await readSkillEntries(projectDir, E2E_SKILL.react.id)).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject", excluded: true },
        { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
      ]);
      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.react.id)),
        "the project-scope skill dir must survive an aborted session",
      ).toBe(true);
      expect(
        await directoryExists(path.join(skillsPath(fakeHome), E2E_SKILL.react.id)),
        "the global-scope skill dir must survive an aborted session",
      ).toBe(true);
    },
  );

  it(
    "agent: `s` round-trips [P][G] both ways and spacebar is an inert global-locked no-op",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // createDualScopeEnv toggles api-developer G->P inside the project and
      // saves, so it lands as a persisted dual-scope agent pair.
      env = await createDualScopeEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      const agentName = E2E_AGENT["api-developer"].name;
      const agentLabel = E2E_AGENT["api-developer"].display;

      const rowsBefore = await readAgentEntriesFor(projectDir, agentName);
      expect(
        rowsBefore.filter((row) => !row.excluded),
        "setup must persist exactly one active project agent entry",
      ).toStrictEqual([{ name: agentName, scope: "project" }]);
      expect(
        rowsBefore.filter((row) => row.excluded === true),
        "setup must persist exactly one global agent tombstone",
      ).toStrictEqual([{ name: agentName, scope: "global", excluded: true }]);

      const projectConfigPath = configTsPath(projectDir);
      const configBefore = await readTestFile(projectConfigPath);

      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      try {
        const sources = await wizard.build.passThroughAllDomains();
        await sources.waitForReady();
        const agents = await sources.advance();
        await agents.navigateCursorToAgent(agentLabel);

        expect(
          [...(await agents.getScopeBadgesForAgent(agentLabel))].sort(),
          "a persisted dual-scope agent must render both [P] and [G] badges",
        ).toStrictEqual(["G", "P"]);

        // `s` collapses the pair to the single inherited-global entry.
        await agents.toggleScopeOnFocusedAgent();
        expect(
          await agents.getScopeBadgesForAgent(agentLabel),
          "`s` on a persisted dual-scope agent must collapse [P][G] to [G]",
        ).toStrictEqual(["G"]);

        // `s` again restores the pair — one key drives both directions.
        await agents.toggleScopeOnFocusedAgent();
        expect(
          [...(await agents.getScopeBadgesForAgent(agentLabel))].sort(),
          "`s` must round-trip the collapsed agent row back to [P][G]",
        ).toStrictEqual(["G", "P"]);

        // Space is the agents step's selection key — inert here, with the
        // global-locked AGENT toast awaited on the anchored raw surface.
        await agents.toggleFocusedAgentAwaiting(STEP_TEXT.GLOBAL_AGENTS_BLOCKED);
        expect(
          [...(await agents.getScopeBadgesForAgent(agentLabel))].sort(),
          "an inert spacebar must leave the dual-scope agent badges untouched",
        ).toStrictEqual(["G", "P"]);
      } finally {
        await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      }

      // Aborted session: config.ts and both scopes' compiled agents are untouched.
      expect(
        await readTestFile(projectConfigPath),
        "an aborted session must not rewrite config.ts",
      ).toBe(configBefore);
      expect(await readAgentEntriesFor(projectDir, agentName)).toStrictEqual(rowsBefore);
      expect(
        await fileExists(path.join(agentsPath(projectDir), `${agentName}.md`)),
        "the project-scope compiled agent must survive an aborted session",
      ).toBe(true);
      expect(
        await fileExists(path.join(agentsPath(fakeHome), `${agentName}.md`)),
        "the global-scope compiled agent must survive an aborted session",
      ).toBe(true);
    },
  );
});
