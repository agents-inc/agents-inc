import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { readAllSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * A status marker must cost the same space on every Sources row, focused or not.
 * `SourceSection` in source-grid.tsx builds the focused row as
 * `{statusGlyph}{` ${name} `}` — but `rowStatusGlyph` already returns a TRAILING
 * space (`"+ "`), so the highlight's own leading pad lands on top of it and a
 * focused diff row renders `"+  Name "` with two spaces, while the same row
 * unfocused renders `"+ Name"`. The name shifts one column the moment focus
 * arrives.
 *
 * The workaround is visible in the suite: both dual-scope Sources specs carry a
 * paragraph explaining that they capture the frame on an UNFOCUSED row to dodge
 * this exact padding. That dodge is the bug, and this spec is the one place that
 * refuses it.
 *
 * Target shape: the marker occupies a fixed two-column cell on every row (blank
 * when the row carries no status, mirroring `DIFF_PREFIX` in
 * skill-agent-summary.tsx, which gives even `unchanged` a two-char prefix), the
 * cell sits INSIDE the focused row's highlight so the band is one width on every
 * row, and exactly ONE space separates marker from name whether the row is
 * focused or not. The `🔒` lock glyph is double-width and still renders one
 * column wider; that is a pre-existing accepted limitation, not part of this
 * contract.
 *
 * Fixture: react and vitest are saved as GLOBAL entries, so in a project edit
 * both render locked and INERT — `SourceGrid`'s `skipRow` refuses them focus.
 * zustand is selected during the session, giving it a slot the hydration
 * snapshot does not hold, so it is the grid's only `added` row AND its only
 * focusable one: `firstFocusableRowIndex` can land nowhere else. That removes
 * any need to move focus with a key press, which would only re-render the row
 * under test in some other state.
 *
 * Read-only session: the wizard is aborted, so config.ts and the project skills
 * directory must come out byte-for-byte unchanged.
 */

describe("edit wizard — focused Sources row keeps one space between its marker and its name", () => {
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
    "renders the added marker flush against the skill name on the focused row",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await ProjectBuilder.editable({
        marketplace: E2E_SOURCE.sourceDir,
        skills: [],
        globalSkills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        agents: ["web-developer"],
        domains: ["web"],
      });
      const projectDir = project.dir;
      tempDir = path.dirname(projectDir);

      // Setup proof: every saved entry is global, so every pre-existing Sources row is inert and
      // the row selected below is the only one focus can land on.
      expect(
        await readAllSkillEntries(projectDir),
        "the project must start with global-only skill entries",
      ).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", origin: "eject" },
        { id: E2E_SKILL.vitest.id, scope: "global", origin: "eject" },
      ]);

      const configBefore = await readTestFile(configTsPath(projectDir));
      const skillDirsBefore = (await listFiles(skillsPath(projectDir))).sort();

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      // Select a skill the snapshot does not hold: its Sources row is new this session, so it
      // carries the added marker and stays editable (an added row is not inert).
      await wizard.build.selectSkill(E2E_SKILL.zustand.display);
      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.zustand.display),
        "selecting zustand must give it a live scope badge, proving the press landed",
      ).toStrictEqual(["G"]);

      // Single web domain: advance straight to the Sources tab.
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();

      const frame = sources.getScreen();

      // Green guards: the grid rendered, both inherited rows are locked (hence unfocusable), and
      // some row owns the focus chevron — so the row under test is the focused one.
      expect(frame).toContain(STEP_TEXT.SOURCES);
      expect(frame, `react's inherited row must render locked. Screen:\n${frame}`).toContain(
        `${UI_SYMBOLS.LOCK} ${E2E_SKILL.react.display}`,
      );
      expect(frame, `vitest's inherited row must render locked. Screen:\n${frame}`).toContain(
        `${UI_SYMBOLS.LOCK} ${E2E_SKILL.vitest.display}`,
      );
      expect(
        frame,
        `the grid must paint a focus chevron on its only focusable row. Screen:\n${frame}`,
      ).toContain(UI_SYMBOLS.CHEVRON);

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      wizard = undefined;

      // Abort saved nothing: config.ts and the project skills directory are untouched. Asserted
      // before the spacing assertions so the read-only guarantee is verified on every run.
      expect(
        await readTestFile(configTsPath(projectDir)),
        "aborting a Sources-tab preview must not rewrite config.ts",
      ).toBe(configBefore);
      expect(
        (await listFiles(skillsPath(projectDir))).sort(),
        "aborting a Sources-tab preview must not add or remove skill directories",
      ).toStrictEqual(skillDirsBefore);

      // The contract: one space between marker and name, on the focused row as on any other.
      expect(
        frame,
        `the focused added row must render its marker flush against the name. Screen:\n${frame}`,
      ).toContain(`${UI_SYMBOLS.ADDED} ${E2E_SKILL.zustand.display}`);

      // The bug shape: the highlight's leading pad doubling the glyph's own trailing space.
      expect(
        frame,
        `the focused row must not render a second space after the marker. Screen:\n${frame}`,
      ).not.toContain(`${UI_SYMBOLS.ADDED}  ${E2E_SKILL.zustand.display}`);
    },
  );
});
