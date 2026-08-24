import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, configTsPath, readTestFile } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";
import { TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * A skill selected this session but absent from the saved config (the hydration
 * snapshot) is "added". The Sources tab must mark such a row with the info
 * panel's added-diff prefix `+ ` (`DIFF_PREFIX.added` in
 * src/cli/components/wizard/skill-agent-summary.tsx) — the green complement of
 * the removed `- ` marker the Sources tab already renders for a deselected saved
 * skill (see project-only-deselect-integrity.e2e.test.ts). NO_COLOR strips the
 * green in E2E, so the visible `+ ` glyph — not the colour — is what this
 * asserts; matching the colour to the info panel is the fix's job.
 *
 * Today an added skill renders as a plain selectable Sources row with no prefix,
 * so the row-present assertions pass while the marker assertion fails — proving
 * the failure is the missing added marker, not a missing row.
 */

describe("edit wizard — added-skill marker on the Sources tab", () => {
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
    "marks a skill added this session with the added-diff prefix on the Sources tab",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Seed a saved project with react + vitest but NO web-client-state skill, so zustand
      // (present in the source matrix) is genuinely uninstalled and its exclusive category slot is
      // empty — selecting it this session is a clean addition, not an exclusive-category swap.
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        agents: ["web-developer"],
        domains: ["web"],
      });
      const projectDir = project.dir;
      tempDir = path.dirname(projectDir);

      // Setup proof: zustand is absent from the hydration snapshot (the saved config.ts), so its
      // later Sources row is genuinely "added this session" and not a pre-existing entry. The
      // react/vitest checks prove the seed installed exactly what the scenario assumes.
      const configBefore = await readTestFile(configTsPath(projectDir));
      expect(configBefore, "seed must install react").toContain(E2E_SKILL.react.id);
      expect(configBefore, "seed must install vitest").toContain(E2E_SKILL.vitest.id);
      expect(
        configBefore,
        "zustand must be absent from the saved config so its Sources row is genuinely added this session",
      ).not.toContain(E2E_SKILL.zustand.id);

      wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        ...TERMINAL_SIZE.TALL,
      });

      // Add zustand — in the source matrix, absent from the saved project. Space selects it because
      // it starts unselected, and the empty exclusive web-client-state slot accepts it cleanly.
      await wizard.build.selectSkill(E2E_SKILL.zustand.display);

      // Single web domain: advance straight to the Sources tab.
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();

      // The added zustand row takes default focus (row 0). A focused Source row wraps its name in
      // spaces, which would split the marker from the name; move focus off it so it renders in the
      // stable unfocused form — the same form the info panel prints and the fix will render — with
      // the `+ ` marker flush against the name.
      await sources.navigateDown();

      const sourcesFrame = sources.getOutput();

      // Positive shape: an installed skill row proves the Sources grid rendered (non-empty, correct
      // screen), so a missing zustand marker below is the bug — not an empty or wrong grid.
      expect(
        sourcesFrame,
        `Sources grid must render the installed react skill. Screen:\n${sources.getScreen()}`,
      ).toContain(E2E_SKILL.react.display);

      // The newly-added skill's row is present on the Sources tab...
      expect(
        sourcesFrame,
        `the added skill must be visible on the Sources tab. Screen:\n${sources.getScreen()}`,
      ).toContain(E2E_SKILL.zustand.display);

      // ...and it must carry the info panel's added marker (the green complement of the removed
      // `- ` marker) so both surfaces read consistently. The wizard runs with NO_COLOR in E2E, so
      // the green carries no signal here — the `+ ` marker is what a user (and this assertion) can
      // actually see. Fails today: the added row renders with no prefix.
      expect(
        sourcesFrame,
        `a skill added this session must be marked with the added-diff prefix on the Sources tab. Screen:\n${sources.getScreen()}`,
      ).toContain(`${UI_SYMBOLS.ADDED} ${E2E_SKILL.zustand.display}`);

      // Asymmetry guard (uses the exported removed source-of-truth): an added skill must not be
      // mistaken for a removal. Holds today and must keep holding after the fix.
      expect(
        sourcesFrame,
        "an added skill must not render with the removed marker on the Sources tab",
      ).not.toContain(`${UI_SYMBOLS.REMOVED} ${E2E_SKILL.zustand.display}`);
    },
  );
});
