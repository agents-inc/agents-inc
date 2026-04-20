import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { createGlobalOnlyEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";

/**
 * D-225 — Info panel shows asymmetric diff on scope toggle.
 *
 * Root cause (see /home/vince/dev/cli/todo/D-225-info-panel-asymmetric-scope-toggle-diff.md):
 * `skill-agent-summary.tsx` line 99 computes `removedSkills` by filtering
 * `installedSkillConfigs` with an id-only membership check against
 * `currentSkills`, while `isNew` is keyed on `(id, scope)` via `prevSkillKeySet`.
 * The two sides of the diff use different key shapes, so a scope toggle is
 * detected as `+` at the new scope but NEVER as `-` at the old scope: the id
 * still exists in `currentSkills` (at a different scope), so the old-scope
 * entry is silently suppressed. Same asymmetry on line 102 for agents.
 *
 * Expected after the Option-A fix (symmetric per-(id, scope) filter on both
 * sides of the diff): toggling a skill from P→G produces BOTH a `-` entry
 * in the Project subsection AND a `+` entry in the Global subsection of the
 * info panel / confirm summary. Same symmetry for G→P and for agent scope
 * toggles. The asymmetry also manifests in the live build-step info-panel
 * overlay because it renders the same `SkillAgentSummary` component — the
 * D-225 bug is in the diff model, not the view selection.
 *
 * All scenarios drive the real `cc edit` pipeline end-to-end — no manual
 * writes to `config.ts` or skill directories. Expected to FAIL on `main`
 * until the `removedSkills` / `removedAgents` filter is keyed on
 * `(id, scope)` (and the diff baseline excludes tombstones so removing a
 * tombstone doesn't fire a spurious `-` — plan section "Fix direction").
 *
 * Related: D-223 (tombstone preservation on load), D-224 (tombstone cleanup
 * on P→G restoration). D-225 is strictly the diff-renderer layer; D-223 and
 * D-224 govern the store/config layers that feed it.
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
   * Drive `cc edit` to completion, toggling G→P on the first-focused skill
   * (web-framework-react in the Web domain). Leaves the project config in the
   * dual-scope shape: `{scope:"project"}` active entry + `{scope:"global",
   * excluded:true}` tombstone. Used as the setup for P→G scenarios that need
   * a project-scope baseline.
   */
  async function performSkillGlobalToProjectToggle(
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
      // Web domain: focus defaults to web-framework-react. G→P.
      await toggleWizard.build.toggleScopeOnFocusedSkill();
      await toggleWizard.build.advanceDomain();
      // API + Methodology: pass through.
      await toggleWizard.build.advanceDomain();
      const sources = await toggleWizard.build.advanceToSources();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
    } finally {
      await toggleWizard.destroy();
    }
  }

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
    "Scenario A: P→G skill toggle shows `-` in Project AND `+` in Global on confirm",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      // Baseline: global-only install, then G→P to seat react at project scope.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;
      await performSkillGlobalToProjectToggle(projectDir, fakeHome);

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

      // Web domain: react is now at project scope — toggle P→G.
      await wizard.build.toggleScopeOnFocusedSkill();
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
        `P→G toggle must produce symmetric diff entries.\nScreen:\n${confirm.getScreen()}`,
      ).toEqual(
        expect.arrayContaining([
          { scope: "Project", prefix: "-" },
          { scope: "Global", prefix: "+" },
        ]),
      );

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "Scenario B: G→P skill toggle shows `-` in Global AND `+` in Project on confirm",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      // Baseline: global-only install — react starts at global scope.
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
        `G→P toggle must produce symmetric diff entries.\nScreen:\n${confirm.getScreen()}`,
      ).toEqual(
        expect.arrayContaining([
          { scope: "Global", prefix: "-" },
          { scope: "Project", prefix: "+" },
        ]),
      );

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "Scenario C: P→G agent toggle shows `-` in Project AND `+` in Global on confirm",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      // Baseline: global-only install, then toggle web-developer G→P via a
      // real edit run. After this the project config has the dual-scope agent
      // shape (project active + global tombstone) that mirrors the skill case.
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
      await agentsStep.navigateCursorToAgent("Web Developer");
      await agentsStep.toggleScopeOnFocusedAgent();
      const confirm = await agentsStep.advance("edit");
      await confirm.waitForReady();

      const agentEntries = await confirm.getSummaryDiffEntries(WEB_DEVELOPER_AGENT_NAME);

      expect(
        agentEntries,
        `Agent P→G toggle must produce symmetric diff entries.\nScreen:\n${confirm.getScreen()}`,
      ).toEqual(
        expect.arrayContaining([
          { scope: "Project", prefix: "-" },
          { scope: "Global", prefix: "+" },
        ]),
      );

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "Scenario D: build-step info-panel overlay shows symmetric diff after P→G toggle",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 0 },
    async () => {
      // Same setup as Scenario A — react seeded at project scope.
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;
      await performSkillGlobalToProjectToggle(projectDir, fakeHome);

      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      // Web domain: react is at project scope — toggle P→G. Stay on the
      // build step and open the info panel overlay (`i`) so we inspect the
      // live-diff path, not the confirm step. If the fix applies only to
      // the confirm renderer, this scenario still fails — the same
      // SkillAgentSummary component backs both surfaces.
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.toggleInfoPanel();

      const skillEntries = await wizard.build.getSummaryDiffEntries(REACT_SKILL_DISPLAY_NAME);

      expect(
        skillEntries,
        `Build-step info panel must show the same symmetric diff as the confirm step.\nScreen:\n${wizard.build.getScreen()}`,
      ).toEqual(
        expect.arrayContaining([
          { scope: "Project", prefix: "-" },
          { scope: "Global", prefix: "+" },
        ]),
      );

      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );
});
