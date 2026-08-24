import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { cleanupFixture } from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * Partial-state prevention for `cc init` when marketplace resolution fails.
 *
 * The rule this pins: a command performs every failable resolution BEFORE its first filesystem
 * mutation. Where it cannot, it owes either a rollback or a re-run that recognises and recovers the
 * partial state — and `init` has neither, because `detectInstallation` keys off a `config.ts` that
 * a run dying mid-install never wrote. That is why the assertions below read the DISK rather than
 * settling for the exit code: an error message is not evidence that nothing was left behind.
 *
 * `init.tsx::handleInstallation` previously ordered steps so that
 * `copyEjectSkillsStep` ran BEFORE `installPluginsStep`. In mixed mode, an
 * unresolvable marketplace caused `installPluginsStep` to hard-error AFTER
 * eject skills had already been copied to `.claude/skills/`, leaving a
 * half-populated project directory with no `config.ts` to recognise it.
 *
 * The fix resolves the marketplace BEFORE any filesystem mutation, so the
 * hard-error fires before `copyEjectSkillsStep` gets a chance to run.
 *
 * This path does NOT require the Claude CLI: `ensureMarketplace` returns
 * `{ marketplace: null }` via the `fetchMarketplace` catch branch (the local
 * source has no `.claude-plugin/marketplace.json`), before any
 * `claudePluginMarketplaceExists` call.
 */

describe("init with unresolvable marketplace: filesystem integrity", () => {
  let localSource: E2ESource;
  let wizard: InitWizard | undefined;

  beforeAll(async () => {
    // Plain local source — no `.claude-plugin/marketplace.json` — triggers
    // the `fetchMarketplace` failure path inside `ensureMarketplace`.
    localSource = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(localSource);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "should hard-error BEFORE copying eject skills in mixed mode (no partial state on disk)",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      wizard = await InitWizard.launch({
        source: localSource,
      });

      // Stack -> Domain -> Build -> all domains -> Sources
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();

      // Toggle ONE source to local while the rest remain plugin-intent. This
      // produces `installMode === "mixed"`: `copyEjectSkillsStep` would run
      // first (pre-fix), then `installPluginsStep` would hard-error, leaving
      // eject copies orphaned on disk.
      await sources.waitForReady();
      await sources.selectFocusedSourceCell();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("init");
      const result = await confirm.confirmExpectingExit();

      expect(await result.exitCode).toBe(EXIT_CODES.ERROR);

      const output = result.output;
      expect(output).toContain("marketplace could not be resolved");
      expect(output).toContain(localSource.sourceDir);

      // Partial-state prevention: no skill directories may exist under
      // `.claude/skills/` after the hard-error. The pre-fix code copied
      // eject skills before `installPluginsStep` threw, leaving orphans.
      await expect({ dir: result.project.dir }).toHaveNoLocalSkills();

      // And the old "Skills copied to:" success banner must never appear.
      expect(output).not.toContain(STEP_TEXT.SKILLS_COPIED_TO);
    },
  );
});
