import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  EXIT_CODES,
  SOURCE_PATHS,
  STEP_TEXT,
  TERMINAL_SIZE,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  MONOREPO_ROOT,
  cleanupTempDir,
  configTsPath,
  createTempDir,
  directoryExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";
import "../matchers/setup.js";

/**
 * Real-marketplace regression guard for the D-257 pending-removal row on the
 * Sources tab (the render path D-271 reframed as correct once verified).
 *
 * A project-scoped routing skill (`web-routing-react-router`, "React Router")
 * is installed alongside the first stack's default (global) skills. Re-editing
 * and deselecting it must render a pending-removal row `- React Router` in the
 * Sources tab's Project section, using real marketplace skill content rather
 * than the synthetic E2E source. A TALL terminal keeps every row on-screen so
 * the row's presence is the contract under test, not viewport clipping (that is
 * D-271's separate short-viewport concern, covered by
 * sources-overflow-pending-removal.e2e.test.ts). Aborting the edit must leave
 * config.ts byte-identical — the deselection is a preview, not a save.
 *
 * Mirrors real-marketplace.e2e.test.ts: resolves the local skills clone via the
 * SKILLS_SOURCE override (sibling to the monorepo root by default) and skips when
 * it is absent (CI or other machines).
 */

const SKILLS_SOURCE = process.env.SKILLS_SOURCE ?? path.resolve(MONOREPO_ROOT, "../skills");
const hasSkillsSource = await directoryExists(path.join(SKILLS_SOURCE, SOURCE_PATHS.SKILLS_DIR));

// Marketplace-specific data (like the "web-framework-react@agents-inc" literals in
// real-marketplace.e2e.test.ts): the routing skill's id and the display name the
// Sources grid renders for it.
const ROUTER_ID = "web-routing-react-router";
const ROUTER_DISPLAY = "React Router";
const ROUTER_REMOVAL_ROW = `${UI_SYMBOLS.REMOVED} ${ROUTER_DISPLAY}`;

/**
 * A second real skill, left at the default global scope so the re-edit has an
 * inherited-global row to lock. The clone ships no stacks and the built-in
 * catalogue stands in for the default marketplace alone, so this install picks
 * its skills itself rather than inheriting a stack's.
 */
const FRAMEWORK_DISPLAY = "React";

describe.skipIf(!hasSkillsSource)("edit wizard pending-removal row (real marketplace)", () => {
  let projectDir: string;
  let sharedHome: string;
  let configAfterInit: string;
  let editWizard: EditWizard | undefined;

  beforeAll(async () => {
    projectDir = await createTempDir();
    sharedHome = await createTempDir();

    // Install a global React plus a project-scoped React Router. The clone ships
    // no stacks, so the wizard opens on domain selection.
    const { wizard: initWizard, domain } = await InitWizard.launchOnDomainsInProject({
      source: { sourceDir: SKILLS_SOURCE, tempDir: "" },
      projectDir,
      globalHome: sharedHome,
      loadTimeout: TIMEOUTS.INSTALL,
      ...TERMINAL_SIZE.TALL,
    });
    try {
      const build = await domain.acceptDefaults();
      await build.selectSkill(FRAMEWORK_DISPLAY); // stays at the default global scope
      await build.focusSkill(ROUTER_DISPLAY);
      await build.toggleFocusedSkill(); // select React Router (unselected by default)
      await build.toggleScopeOnFocusedSkill(); // move it to project scope
      const sources = await build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("init");
      const result = await confirm.confirm();
      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
    } finally {
      await initWizard.destroy();
    }

    configAfterInit = await readTestFile(configTsPath(projectDir));
    // Setup proof: React Router is genuinely a saved project-scoped skill, so a
    // missing Sources row later is the render bug, not a setup miss.
    expect(configAfterInit).toMatch(/'web-routing-react-router', scope: 'project'/);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (projectDir) await cleanupTempDir(projectDir);
    if (sharedHome) await cleanupTempDir(sharedHome);
  });

  afterEach(async () => {
    if (editWizard) {
      await editWizard.abortAndDestroy(TIMEOUTS.EXIT);
      editWizard = undefined;
    }
  });

  it(
    "renders a deselected project routing skill as a pending-removal row on the Sources tab",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      editWizard = await EditWizard.launchInProject({
        projectDir,
        source: { sourceDir: SKILLS_SOURCE, tempDir: "" },
        globalHome: sharedHome,
        ...TERMINAL_SIZE.TALL,
      });
      await editWizard.build.focusSkill(ROUTER_DISPLAY);
      await editWizard.build.toggleFocusedSkill(); // deselect React Router
      const sources = await editWizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();

      const frame = sources.getScreen();

      // Green guards: the Sources grid rendered its real content — the step
      // header and the inherited global rows' lock glyphs — so an absent React
      // Router row would be the vanished-row bug, not an empty grid.
      expect(frame).toContain(STEP_TEXT.SOURCES);
      expect(
        frame,
        `Sources grid must render the inherited global rows. Screen:\n${frame}`,
      ).toContain(UI_SYMBOLS.LOCK);

      // The deselected saved project skill stays visible as a pending-removal
      // row (removal marker + red), NOT a lock (that would read "installed
      // globally") and NOT an added marker. NO_COLOR strips the colour in E2E,
      // so the marker is what a user and this assertion can see.
      expect(
        frame,
        `deselected project skill must render as a pending-removal row. Screen:\n${frame}`,
      ).toContain(ROUTER_REMOVAL_ROW);
      expect(frame).not.toContain(`${UI_SYMBOLS.LOCK} ${ROUTER_DISPLAY}`);
      expect(frame).not.toContain(`${UI_SYMBOLS.ADDED} ${ROUTER_DISPLAY}`);
    },
  );

  it(
    "leaves config.ts byte-identical when the deselection edit is aborted",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      editWizard = await EditWizard.launchInProject({
        projectDir,
        source: { sourceDir: SKILLS_SOURCE, tempDir: "" },
        globalHome: sharedHome,
        ...TERMINAL_SIZE.TALL,
      });
      await editWizard.build.focusSkill(ROUTER_DISPLAY);
      await editWizard.build.toggleFocusedSkill(); // deselect React Router
      const sources = await editWizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      // Prove the removal is live in this session before aborting.
      expect(sources.getScreen()).toContain(ROUTER_REMOVAL_ROW);

      await editWizard.abortAndDestroy(TIMEOUTS.EXIT);
      editWizard = undefined;

      // Abort saved nothing: config.ts is untouched and React Router persists.
      const configAfterAbort = await readTestFile(configTsPath(projectDir));
      expect(configAfterAbort, "aborting a deselection preview must not rewrite config.ts").toBe(
        configAfterInit,
      );
      expect(configAfterAbort).toContain(ROUTER_ID);
    },
  );
});
