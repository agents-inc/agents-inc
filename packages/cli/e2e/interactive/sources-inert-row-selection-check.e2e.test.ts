import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  listFiles,
  readTestFile,
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import {
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  SOURCE_DISPLAY_NAMES,
  UI_SYMBOLS,
} from "../../src/cli/consts.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * The Sources grid has one vocabulary for "this is the selected source" and it
 * is not a checkmark. An EDITABLE row carries its selection in colour and
 * weight, and its prefix slot only ever holds the focus chevron or a blank.
 * `SourceTag` in source-grid.tsx switches vocabulary for INERT rows — `readOnly`
 * (a globally-installed skill this project may not change) and `disabled` (a
 * slot this session emptied) — and paints `UI_SYMBOLS.SELECTED` there instead.
 *
 * So the `✓` appears nowhere else in the grid, and it lands exactly on the rows
 * the user cannot act on. On the pending-removal row it is actively misleading:
 * `toPendingRemovalRow` re-pins the selection to the persisted source, so the
 * row that is about to be DELETED gets an affirmative tick beside the source it
 * is about to lose. Inert rows already read as inert without it — red for
 * pending removal, dimmed for locked — so the branch goes and both keep their
 * colour treatment and the blank chevron spacer.
 *
 * Fixture: react installed at BOTH scopes, its project half collapsed back to
 * global with `s`. That produces one row of each inert kind at once — the
 * surviving locked global row and the emptied project slot's pending-removal
 * row — which is the whole of the `✓` branch in a single frame.
 *
 * The global entry is marketplace-sourced on purpose: a project EJECT entry over
 * a global EJECT install cannot be collapsed at all (`wouldOverwriteGlobalEject`
 * refuses the `s` press with a toast), so an eject/eject pair would fail on a
 * swallowed keystroke rather than on the render.
 *
 * The blanket negative is safe on this screen. `SourceTag` is the only producer
 * of `UI_SYMBOLS.SELECTED` in the wizard's render path — the agents step and the
 * checkbox grid wrap theirs in `[…]` on other steps, and the settings overlay's
 * tick needs `s` to open it, which this spec never presses. Asserted against
 * `getScreen()` (the viewport) rather than `getOutput()`, whose scrollback still
 * holds the domain step's checkbox frames.
 *
 * Read-only session: the wizard is aborted, so config.ts and the project skills
 * directory must come out byte-for-byte unchanged.
 */

describe("edit wizard — Sources grid paints no selection check on inert rows", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let tempDir: string | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "renders neither the pending-removal row nor the locked global row with a selected-source check",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "inert-row-check-test",
          skills: [
            ...buildSkillConfigs([E2E_SKILL.react.id, E2E_SKILL.vitest.id], {
              scope: "project",
              source: EJECT_SOURCE,
            }),
            ...buildSkillConfigs([E2E_SKILL.react.id], {
              scope: "global",
              source: DEFAULT_PUBLIC_SOURCE_NAME,
            }),
          ],
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
          domains: ["web"],
          selectedAgents: [E2E_AGENT["web-developer"].name],
        }),
      );

      await createLocalSkill(projectDir, E2E_SKILL.react.id, {
        description: "React framework for inert-row rendering",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.react.id,
          category: "web-framework",
          slug: E2E_SKILL.react.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "b2c3d4e",
        }),
      });
      await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
        description: "Vitest testing skill for inert-row rendering",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.vitest.id,
          category: "web-testing",
          slug: E2E_SKILL.vitest.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "c3d4e5f",
        }),
      });

      // Setup proof: react genuinely occupies both slots, so the collapse below empties a real one.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.react.id),
        "react must be saved at both project and global scope before the edit",
      ).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", source: DEFAULT_PUBLIC_SOURCE_NAME },
        { id: E2E_SKILL.react.id, scope: "project", source: EJECT_SOURCE },
      ]);

      const configBefore = await readTestFile(configTsPath(projectDir));
      const skillDirsBefore = (await listFiles(skillsPath(projectDir))).sort();

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        ...TERMINAL_SIZE.TALL,
      });

      await wizard.build.focusSkill(E2E_SKILL.react.display);
      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "react must start as the project-scoped half of the dual-scope install",
      ).toStrictEqual(["P"]);

      // `s` is the sole dual-scope toggle: P→G drops the project override. Proof-of-execution —
      // without the badge flip the press was swallowed (or refused by a guard) and the Sources
      // assertions below would hold vacuously, with no inert removal row to render at all.
      await wizard.build.toggleScopeOnFocusedSkill();
      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "`s` must collapse the pair to global-only, emptying react's project slot",
      ).toStrictEqual(["G"]);

      // Single web domain: advance straight to the Sources tab.
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();

      const frame = sources.getScreen();

      // Green guards: BOTH inert kinds are on screen — the surviving locked global row and the
      // emptied project slot's pending-removal row — plus the untouched editable vitest row. So a
      // missing check below is the branch being gone, not the rows being absent.
      expect(frame).toContain(STEP_TEXT.SOURCES);
      expect(frame, `react's surviving global row must stay locked. Screen:\n${frame}`).toContain(
        `${UI_SYMBOLS.LOCK} ${E2E_SKILL.react.display}`,
      );
      expect(
        frame,
        `the emptied project slot must render as a pending-removal row. Screen:\n${frame}`,
      ).toContain(`${UI_SYMBOLS.REMOVED} ${E2E_SKILL.react.display}`);
      expect(frame, `the untouched project skill must render. Screen:\n${frame}`).toContain(
        E2E_SKILL.vitest.display,
      );

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      wizard = undefined;

      // Abort saved nothing: config.ts and the project skills directory are untouched. Asserted
      // before the glyph assertions so the read-only guarantee is verified on every run.
      expect(
        await readTestFile(configTsPath(projectDir)),
        "aborting a scope-collapse preview must not rewrite config.ts",
      ).toBe(configBefore);
      expect(
        (await listFiles(skillsPath(projectDir))).sort(),
        "aborting a scope-collapse preview must not add or remove skill directories",
      ).toStrictEqual(skillDirsBefore);

      // The row about to be removed must not tick the source it is losing. Both inert rows
      // resolve to the eject column here — the pending-removal row is re-pinned to its persisted
      // source and the surviving global row to its live one — so this one string covers both.
      expect(
        frame,
        `an inert row must not check its selected source. Screen:\n${frame}`,
      ).not.toContain(`${UI_SYMBOLS.SELECTED} ${SOURCE_DISPLAY_NAMES[EJECT_SOURCE]}`);

      // Exhaustive: the grid has one selection vocabulary (colour and weight), so the check
      // belongs to no row at all.
      expect(
        frame,
        `the Sources grid must not paint a selection check anywhere. Screen:\n${frame}`,
      ).not.toContain(UI_SYMBOLS.SELECTED);
    },
  );
});
