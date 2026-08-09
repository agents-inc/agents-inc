import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  createTempDir,
  ensureBinaryExists,
  fileExists,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";
import "../matchers/setup.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";

/**
 * On a genuine first `init` every skill the user picks is new, and the confirm
 * step says so — `classifyDiffRow` treats a `null` baseline as "nothing existed
 * before", so it prefixes every row with `+`. The Sources tab must agree.
 *
 * It does not today. Both surfaces diff against the hydration snapshot
 * `installedSkillConfigs`, which `createInitialState` sets to `null` and
 * `hydrateForInit` overwrites only when a global installation already exists.
 * With that `null` baseline `addedSlotFlag` in wizard-store.ts returns `{}` for
 * every row, so no row is flagged `added` and the Sources grid paints no marker
 * at all — while the confirm step, one step later, marks the same rows `+`.
 * The second `init` into an existing installation works, which is exactly why
 * the divergence went unnoticed: the snapshot is non-null from then on.
 *
 * Fixture: a fresh project directory AND a fresh global HOME. `launchInProject`
 * allocates the HOME through `allocateProjectGlobalHome`, which returns a brand
 * new temp dir when the caller supplies none — so there is no installation at
 * either scope and the snapshot is genuinely `null`. The E2E stack's defaults
 * supply the selection (react, vitest and zustand from Web; hono from API; the
 * three meta skills from Methodology).
 *
 * The assertions deliberately skip the FIRST row. `SourceGrid` seeds focus with
 * `firstFocusableRowIndex(rows, 0)`, and on a first init every row is editable,
 * so row 0 holds focus and its name is padded by the highlight — a separate
 * defect with its own spec (see sources-focused-row-marker-spacing). Asserting
 * only unfocused rows keeps this spec failing for the missing-marker reason and
 * nothing else.
 *
 * Read-only session: the wizard is aborted before the confirm step, so neither
 * the project directory nor the global HOME may gain a config.ts or any skills.
 */

/**
 * The E2E stack's non-web selections. Sources rows follow
 * `getAllSelectedTechnologies()`, which walks `domainSelections` domain by
 * domain, and Web is the first domain the wizard configures — so the focused
 * first row is always a WEB skill and none of these four can ever hold it,
 * whatever the ordering within or between the later domains turns out to be.
 */
const UNFOCUSED_ADDED_SKILLS = [
  E2E_SKILL.hono.display,
  E2E_SKILL["research-methodology"].display,
  E2E_SKILL.reviewing.display,
  E2E_SKILL["cli-reviewing"].display,
] as const;

describe("init wizard — Sources tab marks every skill added on a first-time install", () => {
  let source: E2ESource;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  let projectDir: string | undefined;
  let wizard: InitWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (projectDir) {
      await cleanupTempDir(projectDir);
      projectDir = undefined;
    }
  });

  it(
    "prefixes newly selected skills with the added-diff marker when nothing is installed yet",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      projectDir = await createTempDir();

      wizard = await InitWizard.launchInProject({
        source,
        projectDir,
        ...TERMINAL_SIZE.TALL,
      });
      const globalHome = wizard.globalHome;

      // Setup proof: neither scope holds an installation, so the hydration snapshot is null and
      // every row the Sources tab renders is genuinely new this session.
      expect(
        await fileExists(configTsPath(projectDir)),
        "the project must have no config.ts before a first init",
      ).toBe(false);
      expect(
        await fileExists(configTsPath(globalHome)),
        "the global HOME must have no config.ts before a first init",
      ).toBe(false);

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();
      await sources.waitForReady();

      const frame = sources.getScreen();

      // Green guards: the grid rendered its real content — the step header plus every row this
      // spec asserts on — so a missing marker below is the null-baseline bug, not an empty grid.
      expect(frame).toContain(STEP_TEXT.SOURCES);
      for (const display of UNFOCUSED_ADDED_SKILLS) {
        expect(frame, `the Sources grid must render ${display}. Screen:\n${frame}`).toContain(
          display,
        );
      }

      // Abort BEFORE destroy: InitWizard.destroy() deletes the global HOME it allocated, which
      // would make the "nothing was written there" assertions below vacuous.
      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);

      // Abort saved nothing at either scope: no config.ts and no installed skills.
      expect(
        await fileExists(configTsPath(projectDir)),
        "aborting a Sources-tab preview must not write a project config.ts",
      ).toBe(false);
      expect(
        await fileExists(configTsPath(globalHome)),
        "aborting a Sources-tab preview must not write a global config.ts",
      ).toBe(false);
      await expect({ dir: projectDir }).toHaveNoLocalSkills();
      await expect({ dir: globalHome }).toHaveNoLocalSkills();

      // The contract: with no baseline to diff against, every row is an addition — the same `+`
      // the confirm step prints one step later. NO_COLOR strips the green in E2E, so the marker is
      // what a user and this assertion can see.
      for (const display of UNFOCUSED_ADDED_SKILLS) {
        expect(
          frame,
          `${display} must carry the added-diff prefix on a first init. Screen:\n${frame}`,
        ).toContain(`${UI_SYMBOLS.ADDED} ${display}`);
      }

      // Shape guard: a first install adds rows, it never removes or locks any.
      for (const display of UNFOCUSED_ADDED_SKILLS) {
        expect(frame, `${display} must not render as a removal on a first init`).not.toContain(
          `${UI_SYMBOLS.REMOVED} ${display}`,
        );
        expect(frame, `${display} must not render locked on a first init`).not.toContain(
          `${UI_SYMBOLS.LOCK} ${display}`,
        );
      }
    },
  );
});
