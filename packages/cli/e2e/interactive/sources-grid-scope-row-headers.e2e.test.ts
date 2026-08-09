import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * When its rows span both scopes the Sources grid heads each block with a `Global` / `Project` row
 * header in an 11-column left gutter (`groupRowsByScope` + `SCOPE_COL_WIDTH` in source-grid.tsx),
 * printed on the block's first row only. What it does NOT print is a `Scope` caption over that
 * gutter: every value in the column is the column's own name, so a caption there says nothing the
 * rows below it do not already say. The pinned header keeps a same-width spacer so `Local` /
 * `Plugin` still line up over their cells.
 *
 * The grouping those labels head: global rows sort ahead of project rows (`sourceRowSortTier`) and
 * a blank line separates the two blocks — hence the ordering chain below, which reads the labels
 * and the rows they head in one sequence.
 *
 * Fixture: react is saved as a GLOBAL entry (inherited, so it renders locked in a project edit) and
 * vitest as a PROJECT entry. That mix is what makes `groupRowsByScope` return groups at all — a
 * single-scope grid renders flat, with neither gutter nor labels.
 *
 * The gutter is the only producer of these words on this screen, so the positives and the negative
 * both read the grid and nothing else: the Sources footer paints `Set all local`, `Set all plugin`,
 * `Settings` and `Info` but NOT the `Scope` hotkey (that DefinitionItem is gated on the
 * build/agents steps in wizard-layout.tsx), the tab bar reads Stack/Domains/Skills/Sources/Agents/
 * Confirm, and the step's dropdown card reads "Customize skill sources". The info panel — the other
 * surface that heads per-scope blocks with these words — is toggled off by default. Asserted
 * against `getScreen()` (the viewport) rather than `getOutput()` precisely because the build step's
 * footer DOES paint `Scope`, and that frame is still in scrollback.
 *
 * Read-only session: the wizard is aborted, so config.ts and the project skills directory must come
 * out byte-for-byte unchanged.
 */

describe("edit wizard — Sources grid heads its scope blocks but captions no scope column", () => {
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
    "labels the global block above the project block without captioning the column they head",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await ProjectBuilder.editable({
        source: sourceDir,
        skills: [E2E_SKILL.vitest.id],
        globalSkills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });
      const projectDir = project.dir;
      tempDir = path.dirname(projectDir);

      // Setup proof: the two rows genuinely sit at different scopes, which is the only shape that
      // takes the grouped branch of the grid.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.react.id),
        "react must be saved as a global-only entry before the edit",
      ).toStrictEqual([{ id: E2E_SKILL.react.id, scope: "global", source: "eject" }]);
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.vitest.id),
        "vitest must be saved as a project-only entry before the edit",
      ).toStrictEqual([{ id: E2E_SKILL.vitest.id, scope: "project", source: "eject" }]);

      const configBefore = await readTestFile(configTsPath(projectDir));
      const skillDirsBefore = (await listFiles(skillsPath(projectDir))).sort();

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        ...TERMINAL_SIZE.TALL,
      });

      // Single web domain: advance straight to the Sources tab.
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();

      const frame = sources.getScreen();

      // Green guards: the grid rendered its real content — the step header plus both rows, react's
      // inherited global row carrying its lock — so the absent caption below is the removal working,
      // not an unrendered grid.
      expect(frame).toContain(STEP_TEXT.SOURCES);
      expect(frame, `react's inherited global row must render. Screen:\n${frame}`).toContain(
        `${UI_SYMBOLS.LOCK} ${E2E_SKILL.react.display}`,
      );
      expect(frame, `vitest's project row must render. Screen:\n${frame}`).toContain(
        E2E_SKILL.vitest.display,
      );

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      wizard = undefined;

      // Abort saved nothing: config.ts and the project skills directory are untouched. Asserted
      // before the scope-text assertions so the read-only guarantee is verified on every run.
      expect(
        await readTestFile(configTsPath(projectDir)),
        "aborting a Sources-tab preview must not rewrite config.ts",
      ).toBe(configBefore);
      expect(
        (await listFiles(skillsPath(projectDir))).sort(),
        "aborting a Sources-tab preview must not add or remove skill directories",
      ).toStrictEqual(skillDirsBefore);

      // Both blocks are headed.
      expect(frame, `the Sources grid must head its global block. Screen:\n${frame}`).toContain(
        STEP_TEXT.SCOPE_GLOBAL,
      );
      expect(frame, `the Sources grid must head its project block. Screen:\n${frame}`).toContain(
        STEP_TEXT.SCOPE_PROJECT,
      );

      // Each label sits in the gutter to the LEFT of the row it heads, and the global block sorts
      // above the project block — one chain, read in render order.
      expect(
        frame.indexOf(STEP_TEXT.SCOPE_GLOBAL),
        `the global label must head react's row from the gutter. Screen:\n${frame}`,
      ).toBeLessThan(frame.indexOf(E2E_SKILL.react.display));
      expect(
        frame.indexOf(E2E_SKILL.react.display),
        `the global block must still render above the project block. Screen:\n${frame}`,
      ).toBeLessThan(frame.indexOf(STEP_TEXT.SCOPE_PROJECT));
      expect(
        frame.indexOf(STEP_TEXT.SCOPE_PROJECT),
        `the project label must head vitest's row from the gutter. Screen:\n${frame}`,
      ).toBeLessThan(frame.indexOf(E2E_SKILL.vitest.display));

      // The caption over them does not exist: the labels already name the column.
      expect(
        frame,
        `the Sources grid must not caption the scope column. Screen:\n${frame}`,
      ).not.toContain(STEP_TEXT.SCOPE);
    },
  );
});
