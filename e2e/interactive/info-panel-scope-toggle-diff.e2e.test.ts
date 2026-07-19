import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  createGlobalOnlyEnv,
  runEditWithFirstSkillAction,
  type DualScopeEnv,
} from "../fixtures/dual-scope-helpers.js";

/**
 * Info-panel scope-toggle diff — D-225 symmetry + D-230 / D-232 correctness.
 *
 * `skill-agent-summary.tsx` renders a diff between the saved config
 * (`installedSkillConfigs`) and the live wizard state (`skillConfigs`).
 * Every scenario in this file exercises the dual-scope model established by
 * D-223: a skill/agent that is globally installed AND active at project
 * scope is represented as `[{id, project}, {id, global, excluded: true}]`,
 * where the tombstone is a dual-scope INDICATOR (not a removal signal).
 *
 * Correctness invariants:
 * - **Scope toggle adds Project** (G→P on a pre-existing global install):
 *   the store emits the dual-scope shape above. Global install survives —
 *   the Global row renders as `•` (unchanged), NOT `-`. Project row is `+`.
 *   (D-230.)
 * - **Scope toggle restores Global** (P→G on a dual-scope baseline): the
 *   store drops the project entry AND strips the tombstone. The global
 *   install was always live (the tombstone was the dual-scope indicator),
 *   so Global renders as `•`, NOT `+` — the user is restoring a
 *   pre-existing install, not adding a new one. Project row is `-`.
 * - **Re-open with saved dual-scope, no changes** (D-232): the diff is a
 *   no-op. The Global row rendered from the saved tombstone must NOT be
 *   tagged `+` (which would falsely re-tag a long-installed global as
 *   newly added).
 *
 * All scenarios drive the real `cc edit` pipeline end-to-end — no manual
 * writes to `config.ts` or skill directories.
 *
 * Related: D-223 (tombstone preservation on load), D-224 (tombstone cleanup
 * on P→G restoration), D-225 (diff baseline symmetric on (id, scope)),
 * D-230 (no false `-` on surviving global), D-232 (no false `+` on re-read
 * tombstone).
 */

const REACT_SKILL_DISPLAY_NAME = "web-framework-react";
const WEB_DEVELOPER_AGENT_NAME = "web-developer";

describe("info panel — scope-toggle diff symmetry", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let env: DualScopeEnv | undefined;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    await env?.destroy();
    env = undefined;
  });

  /**
   * Drive `cc edit` to completion, toggling the web-developer agent G→P. The
   * E2E source's web-developer agent is the first of two; navigating the
   * cursor to it by display name keeps the helper independent of cursor
   * default-position changes.
   */
  async function performAgentGlobalToProjectToggle(
    projectDir: string,
    fakeHome: string,
  ): Promise<void> {
    const toggleWizard = await EditWizard.launch({
      projectDir,
      source: { sourceDir, tempDir: sourceTempDir },
      env: { HOME: fakeHome },
      rows: 60,
      cols: 120,
    });

    try {
      const sources = await toggleWizard.build.passThroughAllDomains();
      await sources.waitForReady();
      const agentsStep = await sources.advance();
      await agentsStep.navigateCursorToAgent("Web Developer");
      await agentsStep.toggleScopeOnFocusedAgent();
      const confirm = await agentsStep.advance("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
    } finally {
      await toggleWizard.destroy();
    }
  }

  it(
    "Scenario A: P→G restoration shows `-` in Project and `•` in Global",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Baseline: global-only install, then G→P to seat react at project scope
      // — the saved config carries `[{react, project}, {react, global,
      // excluded: true}]` (D-223 dual-scope shape). In this session the user
      // toggles P→G: the store drops the project entry and strips the
      // tombstone. The global install was always live (the tombstone was the
      // dual-scope indicator, not a removal) — so restoring it renders as
      // `•` (unchanged), not `+` (which would falsely tag a long-installed
      // global as newly added).
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");

      // The P→G toggle session. Drive the wizard up to the confirm step and
      // capture the change summary BEFORE confirming — no filesystem mutation
      // should happen between the Enter that advances Agents→Confirm and our
      // abort. The confirm step's Enter is the point of no return; reading
      // the screen and aborting with Ctrl+C leaves disk state untouched.
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      // Web domain: react is a persisted [P][G] pair, so `s` is now inert on it
      // (dual-scope scope-toggle guard). Space (deselect) is the sanctioned way to
      // drop the project half — it collapses [P][G] → [G], the same P→G restoration
      // end-state the scope toggle used to produce.
      await wizard.build.toggleFocusedSkill();
      await wizard.build.advanceDomain();
      // API + Methodology: pass through.
      await wizard.build.advanceDomain();
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      const agentsStep = await sources.advance();
      const confirm = await agentsStep.acceptDefaults("edit");
      await confirm.waitForReady();

      const skillEntries = await confirm.getSummaryDiffEntries(REACT_SKILL_DISPLAY_NAME);

      expect(
        skillEntries,
        `P→G restoration must render Project - and Global •.\nScreen:\n${confirm.getScreen()}`,
      ).toStrictEqual([
        { scope: "Project", prefix: "-" },
        { scope: "Global", prefix: "\u2022" },
      ]);
      expect(
        skillEntries,
        `P→G restoration must NOT tag the pre-existing global as newly added.\nScreen:\n${confirm.getScreen()}`,
      ).not.toStrictEqual(expect.arrayContaining([{ scope: "Global", prefix: "+" }]));

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "Scenario B: G→P skill toggle on pre-existing global install shows `+` in Project and `•` in Global",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Baseline: global-only install — react starts at global scope. User
      // toggles G→P: the store emits dual-scope state `[{react, project},
      // {react, global, excluded: true}]` — the tombstone is a D-223
      // dual-scope indicator, NOT a removal. The global install survives on
      // disk. The info panel must render Global as `•` (unchanged), not `-`
      // (which would falsely suggest the global install was removed).
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      // Web domain: react is at global — toggle G→P.
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();
      await wizard.build.advanceDomain();
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      const agentsStep = await sources.advance();
      const confirm = await agentsStep.acceptDefaults("edit");
      await confirm.waitForReady();

      const skillEntries = await confirm.getSummaryDiffEntries(REACT_SKILL_DISPLAY_NAME);

      expect(
        skillEntries,
        `G→P toggle must render Project + and Global •.\nScreen:\n${confirm.getScreen()}`,
      ).toStrictEqual([
        { scope: "Project", prefix: "+" },
        { scope: "Global", prefix: "\u2022" },
      ]);
      expect(
        skillEntries,
        `G→P toggle must NOT render Global as -.\nScreen:\n${confirm.getScreen()}`,
      ).not.toStrictEqual(expect.arrayContaining([{ scope: "Global", prefix: "-" }]));

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "Scenario C: agent P→G restoration shows `-` in Project and `•` in Global",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Baseline: global-only install, then toggle web-developer G→P via a
      // real edit run. After this the project config has the dual-scope agent
      // shape `[{web-developer, project}, {web-developer, global, excluded:
      // true}]` mirroring the skill case. In this session the user toggles
      // P→G which strips the tombstone — the global agent was always live,
      // so Global must render `•`, not `+` (D-230 agent symmetry).
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;
      await performAgentGlobalToProjectToggle(projectDir, fakeHome);

      // The P→G toggle session.
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      const sources = await wizard.build.passThroughAllDomains();
      await sources.waitForReady();
      const agentsStep = await sources.advance();
      // web-developer is a persisted [P][G] pair, so `s` is now inert on it.
      // Space (deselect) is the sanctioned way to drop the project half — it
      // collapses [P][G] → [G], the same P→G restoration end-state.
      await agentsStep.toggleAgent("Web Developer");
      const confirm = await agentsStep.advance("edit");
      await confirm.waitForReady();

      const agentEntries = await confirm.getSummaryDiffEntries(WEB_DEVELOPER_AGENT_NAME);

      expect(
        agentEntries,
        `Agent P→G restoration must render Project - and Global •.\nScreen:\n${confirm.getScreen()}`,
      ).toStrictEqual([
        { scope: "Project", prefix: "-" },
        { scope: "Global", prefix: "\u2022" },
      ]);
      expect(
        agentEntries,
        `Agent P→G restoration must NOT tag the pre-existing global agent as newly added.\nScreen:\n${confirm.getScreen()}`,
      ).not.toStrictEqual(expect.arrayContaining([{ scope: "Global", prefix: "+" }]));

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "Scenario D: build-step info-panel overlay on P→G restoration shows `-` in Project and `•` in Global",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // Setup seeds react at project scope with a live global install (the
      // D-223 dual-scope shape). Opening the wizard, toggling P→G restores
      // the original global install — the tombstone is stripped but the
      // global install was already there. Global must render `•`, not `+`
      // (which would falsely tag a long-installed global as newly added).
      // Build-step info panel and confirm renderer share the same component,
      // so the invariant must hold on both surfaces.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");

      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      // Web domain: react is a persisted [P][G] pair, so `s` is now inert on it.
      // Space (deselect) collapses [P][G] → [G] — the same P→G restoration
      // end-state (tombstone stripped, global goes active). Open the info panel
      // overlay (`i`) to inspect the live-diff path.
      await wizard.build.toggleFocusedSkill();
      await wizard.build.toggleInfoPanel();

      const skillEntries = await wizard.build.getSummaryDiffEntries(REACT_SKILL_DISPLAY_NAME);

      expect(
        skillEntries,
        `Build-step info panel: P→G restoration must render Project - and Global •.\nScreen:\n${wizard.build.getScreen()}`,
      ).toStrictEqual([
        { scope: "Project", prefix: "-" },
        { scope: "Global", prefix: "\u2022" },
      ]);
      expect(
        skillEntries,
        `P→G restoration must NOT render Global as +.\nScreen:\n${wizard.build.getScreen()}`,
      ).not.toStrictEqual(expect.arrayContaining([{ scope: "Global", prefix: "+" }]));

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "Scenario E: re-open with saved dual-scope shape shows no + or - for the dual-scope skill",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // D-232: after a G→P toggle is saved, the config carries `[{react,
      // project}, {react, global, excluded: true}]`. On NEXT `cc edit`, the
      // diff must be a no-op — react is not newly added at either scope.
      // The Global row (rendered from the tombstone) must show `•`, not `+`.
      // Without a user-initiated change this session, no diff prefix should
      // appear for react at all.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;
      await runEditWithFirstSkillAction(projectDir, fakeHome, sourceDir, sourceTempDir, "scope");

      // Second session — no changes — advance through to the confirm step.
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      await wizard.build.advanceDomain();
      await wizard.build.advanceDomain();
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      const agentsStep = await sources.advance();
      const confirm = await agentsStep.acceptDefaults("edit");
      await confirm.waitForReady();

      const skillEntries = await confirm.getSummaryDiffEntries(REACT_SKILL_DISPLAY_NAME);

      // Under D-232 a tombstone re-read from config must render as • on both
      // rows — the Project row (from the active project-scoped entry) and the
      // Global row (from the tombstone). No prefix drift (+/-/~) is allowed
      // because this session made no changes. diffRowPattern at
      // base-step.ts captures bullets, so both rows appear as
      // `{prefix: "\u2022"}` entries.
      expect(
        skillEntries,
        `Re-open with saved dual-scope must render both rows as •.\nScreen:\n${confirm.getScreen()}`,
      ).toStrictEqual([
        { scope: "Project", prefix: "\u2022" },
        { scope: "Global", prefix: "\u2022" },
      ]);
      expect(
        skillEntries,
        `Re-open with saved dual-scope must NOT tag react as newly added.\nScreen:\n${confirm.getScreen()}`,
      ).not.toStrictEqual(expect.arrayContaining([{ scope: "Global", prefix: "+" }]));
      expect(
        skillEntries,
        `Re-open with saved dual-scope must NOT render react as removed.\nScreen:\n${confirm.getScreen()}`,
      ).not.toStrictEqual(expect.arrayContaining([{ scope: "Global", prefix: "-" }]));
      expect(
        skillEntries,
        `Re-open with saved dual-scope must NOT tag react as newly added at project scope.\nScreen:\n${confirm.getScreen()}`,
      ).not.toStrictEqual(expect.arrayContaining([{ scope: "Project", prefix: "+" }]));

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );
});
