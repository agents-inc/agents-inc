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
 * Adopting a globally-installed skill at project scope creates a NEW project
 * slot for it — `s` on a `[G]`-only row is the sole dual-scope toggle and
 * produces the persisted `[P][G]` pair (see
 * .ai-docs/reference/concepts/tombstone-pattern.md). That project slot is an
 * addition, exactly as the confirm step's `computeScopeDiff` classifies it: the
 * diff keys on the `(id, scope)` SLOT, so a skill already installed globally
 * still counts as added once a project entry appears.
 *
 * The Sources tab must agree: the EDITABLE project row carries the info panel's
 * added marker `+ ` while the inherited global row keeps its lock. Today the
 * Sources tab computes its own session diff keyed on ID ALONE, so a skill
 * present in the hydration snapshot at any scope can never register as added —
 * no `+` appears at all.
 *
 * Read-only session: the wizard is aborted, so config.ts and the project skills
 * directory must come out byte-for-byte unchanged.
 */

describe("edit wizard — added marker when a global skill is adopted at project scope", () => {
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
    "marks the project row of a global skill adopted this session with the added-diff prefix",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // react is saved as a GLOBAL entry (inherited, locked in a project edit); vitest is the
      // project-scoped skill that keeps the Sources grid populated with an untouched row.
      const project = await ProjectBuilder.editable({
        marketplace: sourceDir,
        skills: [E2E_SKILL.vitest.id],
        globalSkills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });
      const projectDir = project.dir;
      tempDir = path.dirname(projectDir);

      // Setup proof: react is a single saved GLOBAL entry with no project slot, so the project
      // row that appears after the `s` toggle is genuinely new this session.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.react.id),
        "react must be saved as a global-only entry before the edit",
      ).toStrictEqual([{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }]);

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
        "react must start as an inherited global-only row",
      ).toStrictEqual(["G"]);

      // `s` is the sole dual-scope toggle: G→P adopts the global skill at project scope and
      // keeps the global install alive as a tombstone.
      await wizard.build.toggleScopeOnFocusedSkill();
      expect(
        (await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display)).slice().sort(),
        "`s` must produce the dual-scope [P][G] pair the added row belongs to",
      ).toStrictEqual(["G", "P"]);

      // Single web domain: advance straight to the Sources tab.
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();

      // Captured on the Sources grid's own frame, with no navigation key in between: `getOutput()`
      // reads xterm's repainted-in-place buffer rather than a log of past frames, so a row state a
      // later frame overwrites is unrecoverable from it. Focus does not matter to the assertions —
      // the marker occupies a fixed two-column cell with one space before the name on every row,
      // focused or not.
      const sourcesOutput = sources.getOutput();
      const sourcesScreen = sources.getScreen();

      // Green guards: the Sources grid rendered its real content — the step header, the
      // untouched project row, and react's inherited global row with its lock — so a missing
      // added marker below is the diff bug, not an empty or wrong grid.
      expect(sourcesOutput).toContain(STEP_TEXT.SOURCES);
      expect(
        sourcesOutput,
        `Sources grid must render the untouched project skill. Screen:\n${sourcesScreen}`,
      ).toContain(E2E_SKILL.vitest.display);
      expect(
        sourcesOutput,
        `react's inherited global row must stay locked. Screen:\n${sourcesScreen}`,
      ).toContain(`${UI_SYMBOLS.LOCK} ${E2E_SKILL.react.display}`);

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      wizard = undefined;

      // Abort saved nothing: config.ts and the project skills directory are untouched. Asserted
      // before the marker assertion so the read-only guarantee is verified on every run.
      expect(
        await readTestFile(configTsPath(projectDir)),
        "aborting a scope-toggle preview must not rewrite config.ts",
      ).toBe(configBefore);
      expect(
        (await listFiles(skillsPath(projectDir))).sort(),
        "aborting a scope-toggle preview must not add or remove skill directories",
      ).toStrictEqual(skillDirsBefore);

      // The editable project row for the adopted skill must carry the added marker — the same
      // `+ ` the confirm step prints for the new (react, project) slot. NO_COLOR strips the
      // green in E2E, so the marker is what a user and this assertion can see. The locked
      // global row renders the lock instead, so this `+ ` can only be the project row.
      expect(
        sourcesOutput,
        `the adopted project row must carry the added-diff prefix. Screen:\n${sourcesScreen}`,
      ).toContain(`${UI_SYMBOLS.ADDED} ${E2E_SKILL.react.display}`);

      // Asymmetry guard: adopting a skill is not a removal.
      expect(
        sourcesOutput,
        "an adopted skill must not render with the removed marker on the Sources tab",
      ).not.toContain(`${UI_SYMBOLS.REMOVED} ${E2E_SKILL.react.display}`);
    },
  );
});
