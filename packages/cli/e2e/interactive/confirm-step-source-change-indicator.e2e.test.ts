import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";

/**
 * Confirm-step source-change indicator (D-261).
 *
 * When a skill's SOURCE changes during edit (e.g. eject -> plugin), the confirm
 * step must flag the row with the compact "~" change marker beside the skill
 * name and NOTHING else — the row already shows its current install mode, so
 * "~" alone signals that the source changed. Today `skill-agent-summary.tsx`
 * ALSO renders a verbose "<oldSource> -> <newSource>" transition (the only "->"
 * / U+2192 arrow painted in the confirm frame) which overflows / wraps the
 * layout. This test pins the compact form and the absence of the verbose arrow.
 *
 * Existing confirm-step diff tests inspect the summary through the
 * `getSummaryDiffEntries` page-object scraper, which extracts only the prefix
 * token (+ / - / ~ / •) and discards the verbose transition text — so none of
 * them can observe the overflowing arrow.
 */

describe("confirm step — source-change indicator", () => {
  let source: E2ESource;
  let wizard: EditWizard | undefined;
  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (source) await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "flags a source-changed skill with the compact ~ marker and no verbose transition",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      // Baseline: an eject-mode project — web-framework-react saved at
      // { scope: project, source: "eject" }.
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source,
        env: { HOME: project.dir },
        ...TERMINAL_SIZE.TALL,
      });

      // Switch the installed skill from eject to plugin on the sources step —
      // its source flips eject -> plugin, a genuine source change the confirm
      // step must render as a source-changed row.
      const sources = await wizard.build.advanceToSources();
      await sources.setAllPlugin();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      // Reaching (and settling) the confirm step proves the eject -> plugin
      // switch drove the wizard all the way to confirm with react present.
      await confirm.waitForReady();

      const confirmOutput = confirm.getOutput();

      // The verbose "<oldSource> → <newSource>" transition must NOT be rendered —
      // it overflows the 50%-width Skills column and wraps, corrupting the row.
      // "→" (U+2192) is the sole arrow painted in the confirm frame (only
      // skill-agent-summary.tsx renders it), so its absence is the contract.
      expect(
        confirmOutput,
        `confirm step must not render the verbose source-transition arrow.\nScreen:\n${confirm.getScreen()}`,
      ).not.toContain("→");

      // The source-changed skill must be flagged with the compact "~" marker
      // directly beside its name — the row already shows its install mode, so
      // "~" alone signals the source changed. Today the verbose transition wraps
      // the layout and splits "~" from the skill name, so this fails.
      expect(
        confirmOutput,
        `confirm step must flag the source-changed skill with a compact "~ <name>" marker.\nScreen:\n${confirm.getScreen()}`,
      ).toContain(`~ ${E2E_SKILL.react.display}`);

      // Durable structural proof (green after the fix): with the verbose
      // transition gone, the scraped diff for react is exactly one project-scoped
      // source-changed ("~") row. Uses the trusted page-object scraper — the
      // wrapping the bug introduces prevents its regex from matching today.
      const skillEntries = await confirm.getSummaryDiffEntries(E2E_SKILL.react.display);
      expect(
        skillEntries,
        `react must render as a single project-scoped ~ row.\nScreen:\n${confirm.getScreen()}`,
      ).toStrictEqual([{ scope: "Project", prefix: "~" }]);

      // Read-only scenario: abort before the confirm Enter so no install runs
      // and disk state stays untouched.
      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );
});
