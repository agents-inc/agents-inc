import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  skillsPath,
} from "../helpers/test-utils.js";
import { readConfigSkillIds } from "../fixtures/dual-scope-helpers.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import type { SourcesStep } from "../pages/steps/sources-step.js";

/**
 * Sources step clips its trailing rows — including the D-257 pending-removal row
 * — at a short terminal height, with NO overflow affordance and no way to scroll
 * the clipped rows into view (D-271).
 *
 * Setup: an all-project install of eight skills (no stack, so nothing is
 * preloaded and the first-focused build-grid skill is a plain editable row).
 * `web-framework-react` is the first skill of the first domain, so a single
 * focused-skill toggle deselects it with no grid navigation — this is the only
 * reliable build-step edit at TERMINAL_SIZE.SHORT, where the build grid
 * overflows the viewport and cannot be read by name. Deselecting react drops
 * every config entry for it, so `buildSourceRows` appends its pending-removal
 * row last; with eight rows plus the grid chrome exceeding the 16-row viewport,
 * that trailing row falls below the fold.
 *
 * Each test proves the deselection genuinely happened (react removed from
 * config.ts, its ejected skill dir deleted, the other seven retained) so the RED
 * assertion pins the missing affordance / unreachable row — not a setup miss.
 *
 * RED today: the Sources grid renders NO "N more below" affordance while it
 * clips content (unlike step-confirm / info-panel), and the clipped
 * pending-removal row cannot be brought into view because every visible row is
 * inert and the viewport only follows focus. When D-271 is fixed both
 * assertions pass and these tests go green.
 */

const OVERFLOW_SKILLS = [
  "web-framework-react",
  "web-state-zustand",
  "web-testing-vitest",
  "web-testing-visual-regression",
  "api-framework-hono",
  "meta-methodology-research-methodology",
  "meta-reviewing-reviewing",
  "meta-reviewing-cli-reviewing",
] as const;

/**
 * The all-inert variant: `web-framework-react` is the sole project (editable) skill — deselecting it
 * appends the pending-removal row — and every other skill is recorded at `scope: "global"`, so in a
 * project edit they render as inherited, locked (readOnly) rows. After the deselect NO row is
 * focusable, which is the real-world shape (all skills inherited-global + one pending removal) the
 * viewport-follows-focus scroll cannot reach.
 */
const ALL_INERT_GLOBAL_SKILLS = [
  "web-state-zustand",
  "web-testing-vitest",
  "api-framework-hono",
  "meta-methodology-research-methodology",
  "meta-reviewing-reviewing",
  "meta-reviewing-cli-reviewing",
] as const;

/** Down-presses used to exhaust the Sources list looking for the clipped row — more than the row count. */
const SCROLL_ATTEMPTS = 20;

const REACT_REMOVAL_ROW = `${UI_SYMBOLS.REMOVED} ${E2E_SKILL.react.display}`;

describe("Sources step overflow with a pending-removal row at a short terminal height", () => {
  let source: E2ESource;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  let testTempDir: string | undefined;
  let projectDir: string | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (testTempDir) {
      await cleanupTempDir(testTempDir);
      testTempDir = undefined;
    }
    projectDir = undefined;
  });

  /**
   * Build the all-project fixture, edit it at SHORT, deselect the first-focused
   * react row, and advance Web -> API -> Methodology -> Sources. Returns the
   * Sources step with its first frame settled.
   */
  async function driveToClippedSources(): Promise<SourcesStep> {
    const project = await ProjectBuilder.editable({
      skills: [...OVERFLOW_SKILLS],
      agents: ["web-developer", "api-developer"],
      domains: ["web", "api", "meta"],
    });
    projectDir = project.dir;
    testTempDir = path.dirname(project.dir);

    wizard = await EditWizard.launchInProjectShort({
      projectDir: project.dir,
      source,
      ...TERMINAL_SIZE.SHORT,
    });

    // Build entry focuses the first-alphabetical skill of the first domain (Vue);
    // react sits one cell to its right. No stack means nothing is preloaded, so the
    // row is editable — a single blind Right + toggle deselects react without
    // reading the garbled short-viewport grid.
    await wizard.build.navigateRight();
    await wizard.build.toggleFocusedSkill();
    await wizard.build.advanceDomain();
    await wizard.build.advanceDomain();
    const sources = await wizard.build.advanceToSources();
    await sources.waitForReady();
    return sources;
  }

  /**
   * Complete the edit and assert the deselection landed: react is gone from
   * config.ts and its ejected skill dir on disk, while the other seven skills
   * survive. Proves the pending-removal row genuinely exists this session, so a
   * failing RED assertion is the clipping bug and not a no-op deselection.
   */
  async function completeAndProveReactRemoved(sources: SourcesStep): Promise<void> {
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    const result = await confirm.confirm();
    expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
    await result.destroy();

    const skillIdsAfter = await readConfigSkillIds(projectDir!);
    expect(skillIdsAfter, "config.ts must drop the deselected react skill").not.toContain(
      E2E_SKILL.react.id,
    );
    expect(
      skillIdsAfter.sort(),
      "the seven untouched skills must remain in config.ts",
    ).toStrictEqual(
      OVERFLOW_SKILLS.filter((id) => id !== E2E_SKILL.react.id)
        .slice()
        .sort(),
    );
    expect(
      await fileExists(path.join(skillsPath(projectDir!), E2E_SKILL.react.id)),
      "the ejected react skill dir must be deleted after deselection",
    ).toBe(false);
  }

  it(
    "shows an overflow affordance when the Sources list is taller than the short viewport",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const sources = await driveToClippedSources();
      const frame = sources.getScreen();

      // Green guards: the Sources grid rendered and its top row is visible, so
      // any clipped row below is genuinely below the fold.
      expect(frame).toContain(STEP_TEXT.SOURCES);
      expect(frame, `Sources grid must render the top of the list. Screen:\n${frame}`).toContain(
        E2E_SKILL.vitest.display,
      );

      // Deselection proof (also the required state-change verification).
      await completeAndProveReactRemoved(sources);

      // RED: the Sources grid clips content but paints no "N more below" hint,
      // unlike step-confirm and the info panel. Fails on the current build.
      expect(
        frame,
        `Sources must signal clipped content with an overflow affordance. Screen:\n${frame}`,
      ).toContain(STEP_TEXT.SCROLL_MORE_BELOW);
    },
  );

  it(
    "can bring the clipped pending-removal row into view with the down-key scroll the grid offers",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const sources = await driveToClippedSources();

      // Green guards: Sources rendered, list top visible, and the react removal
      // row starts below the fold (so reaching it is a real scroll, not a no-op).
      expect(sources.getScreen()).toContain(STEP_TEXT.SOURCES);
      expect(sources.getScreen()).toContain(E2E_SKILL.vitest.display);
      expect(
        sources.getScreen(),
        `the react pending-removal row must start clipped below the fold. Screen:\n${sources.getScreen()}`,
      ).not.toContain(REACT_REMOVAL_ROW);

      // Attempt the scroll the grid offers: press down until the clipped row comes into view,
      // or the budget runs out. Stopping on sight is what a user does, and it is the only
      // phase-independent way to drive this: once nothing is left hidden below, the next press
      // wraps focus back to the top and takes the viewport with it, so a fixed press count
      // asserts whichever point of that cycle it happens to land on.
      for (
        let i = 0;
        i < SCROLL_ATTEMPTS && !sources.getScreen().includes(REACT_REMOVAL_ROW);
        i++
      ) {
        await sources.navigateDown();
      }
      const frameAfterScroll = sources.getScreen();

      // Deselection proof (also the required state-change verification).
      await completeAndProveReactRemoved(sources);

      // RED: the pending-removal row stays unreachable — inert rows are not
      // navigable and the viewport only follows focus. Fails on the current build.
      expect(
        frameAfterScroll,
        `down-key scrolling must bring the pending-removal row into view. Screen:\n${frameAfterScroll}`,
      ).toContain(REACT_REMOVAL_ROW);
    },
  );
});

/**
 * The zero-focusable-rows case (D-271 follow-up). When every remaining Sources row is inert — a run
 * of locked-global (readOnly) rows plus the single pending-removal (disabled) row — there is no
 * "last focusable row" to anchor overscroll on, and the viewport-follows-focus scroll has no focused
 * row to track. The overflow affordance must still render, and down-presses must still scroll the
 * clipped trailing removal row into view via a pure viewport-scroll fallback.
 *
 * Setup: a project install of one editable skill (`web-framework-react`) plus six `scope: "global"`
 * skills that render locked in a project edit. Deselecting the sole editable react row (first-focused
 * at build entry) drops every config entry for it, so `buildSourceRows` appends its pending-removal
 * row after the six locked rows — a seven-row all-inert list that overflows the SHORT viewport with
 * the removal row below the fold.
 */
describe("Sources step overflow when every remaining row is inert (zero focusable rows)", () => {
  let source: E2ESource;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  let testTempDir: string | undefined;
  let projectDir: string | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (testTempDir) {
      await cleanupTempDir(testTempDir);
      testTempDir = undefined;
    }
    projectDir = undefined;
  });

  /**
   * Build the mixed-scope fixture (one project react row + six locked-global rows), edit it at SHORT,
   * deselect the first-focused react row, and advance Web -> API -> Methodology -> Sources. Returns
   * the Sources step, whose every row is now inert, with its first frame settled.
   */
  async function driveToAllInertSources(): Promise<SourcesStep> {
    const project = await ProjectBuilder.editable({
      skills: [E2E_SKILL.react.id],
      globalSkills: [...ALL_INERT_GLOBAL_SKILLS],
      agents: ["web-developer", "api-developer"],
      domains: ["web", "api", "meta"],
    });
    projectDir = project.dir;
    testTempDir = path.dirname(project.dir);

    wizard = await EditWizard.launchInProjectShort({
      projectDir: project.dir,
      source,
      ...TERMINAL_SIZE.SHORT,
    });

    // react is the sole project/editable skill; it sits one cell to the right of the
    // first-alphabetical Vue cell. A single blind Right + toggle deselects it with no
    // grid parsing — the six global skills are locked.
    await wizard.build.navigateRight();
    await wizard.build.toggleFocusedSkill();
    await wizard.build.advanceDomain();
    await wizard.build.advanceDomain();
    const sources = await wizard.build.advanceToSources();
    await sources.waitForReady();
    return sources;
  }

  /**
   * Complete the edit and assert the deselection landed: react is gone from config.ts and its ejected
   * skill dir on disk, while the six inherited global skills survive. Proves the pending-removal row
   * genuinely exists this session, so a failing assertion is the clipping/scroll bug and not a no-op.
   */
  async function completeAndProveInertReactRemoved(sources: SourcesStep): Promise<void> {
    const agents = await sources.advance();
    const confirm = await agents.acceptDefaults("edit");
    const result = await confirm.confirm();
    expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
    await result.destroy();

    const skillIdsAfter = await readConfigSkillIds(projectDir!);
    expect(skillIdsAfter, "config.ts must drop the deselected react skill").not.toContain(
      E2E_SKILL.react.id,
    );
    expect(
      skillIdsAfter.sort(),
      "the six inherited global skills must remain in config.ts",
    ).toStrictEqual([...ALL_INERT_GLOBAL_SKILLS].slice().sort());
    expect(
      await fileExists(path.join(skillsPath(projectDir!), E2E_SKILL.react.id)),
      "the ejected react skill dir must be deleted after deselection",
    ).toBe(false);
  }

  it(
    "shows an overflow affordance when every Sources row is inert and the list overflows",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const sources = await driveToAllInertSources();
      const frame = sources.getScreen();

      // Green guards: the Sources grid rendered and a locked-global row is visible at the top, so any
      // clipped row below (the trailing removal row) is genuinely below the fold.
      expect(frame).toContain(STEP_TEXT.SOURCES);
      expect(frame, `Sources grid must render the locked global rows. Screen:\n${frame}`).toContain(
        UI_SYMBOLS.LOCK,
      );

      // Deselection proof (also the required state-change verification).
      await completeAndProveInertReactRemoved(sources);

      // The Sources grid clips content but must still paint the "N more below" hint even though no
      // row is focusable.
      expect(
        frame,
        `Sources must signal clipped content with an overflow affordance. Screen:\n${frame}`,
      ).toContain(STEP_TEXT.SCROLL_MORE_BELOW);
    },
  );

  it(
    "brings the clipped pending-removal row into view with down-key viewport scroll when no row is focusable",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const sources = await driveToAllInertSources();

      // Green guards: Sources rendered, a locked row is visible, and the react removal row starts
      // below the fold (so reaching it is a real scroll, not a no-op).
      expect(sources.getScreen()).toContain(STEP_TEXT.SOURCES);
      expect(sources.getScreen()).toContain(UI_SYMBOLS.LOCK);
      expect(
        sources.getScreen(),
        `the react pending-removal row must start clipped below the fold. Screen:\n${sources.getScreen()}`,
      ).not.toContain(REACT_REMOVAL_ROW);

      // Attempt the scroll the grid offers: press down through the whole list.
      for (let i = 0; i < SCROLL_ATTEMPTS; i++) {
        await sources.navigateDown();
      }
      const frameAfterScroll = sources.getScreen();

      // Deselection proof (also the required state-change verification).
      await completeAndProveInertReactRemoved(sources);

      // With zero focusable rows, down-key scrolling must fall back to pure viewport scroll and bring
      // the trailing pending-removal row into view.
      expect(
        frameAfterScroll,
        `down-key scrolling must bring the pending-removal row into view. Screen:\n${frameAfterScroll}`,
      ).toContain(REACT_REMOVAL_ROW);
    },
  );
});
