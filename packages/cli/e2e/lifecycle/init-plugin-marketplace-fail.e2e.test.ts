import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createTempDir,
  flattenCliOutput,
  runCLI,
} from "../helpers/test-utils.js";
import {
  EXIT_CODES,
  MANIFEST_REFUSAL_BUILDS_IN_ORDER,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * Partial-state prevention for `cc init` when the marketplace cannot serve the install.
 *
 * The rule this pins: a command performs every failable resolution BEFORE its first filesystem
 * mutation. Where it cannot, it owes either a rollback or a re-run that recognises and recovers the
 * partial state — and `init` has neither, because `detectInstallation` keys off a `config.ts` that
 * a run dying mid-install never wrote. That is why the assertions below read the DISK rather than
 * settling for the exit code: an error message is not evidence that nothing was left behind.
 *
 * `init.tsx::handleInstallation` once ordered steps so that `copyEjectSkillsStep` ran BEFORE
 * `installPluginsStep`. In mixed mode, an unresolvable marketplace caused `installPluginsStep` to
 * hard-error AFTER eject skills had already been copied to `.claude/skills/`, leaving a
 * half-populated project directory with no `config.ts` to recognise it. The fix resolved the
 * marketplace before any filesystem mutation.
 *
 * The fixture that reached it — a local directory with no `.claude-plugin/marketplace.json` — is
 * now refused by the load itself, before the wizard and so before any mode can be chosen (owner
 * ruling 2026-10-02: a custom marketplace must carry a valid manifest). The rule is unchanged and
 * the resolution has only moved earlier, so what this holds is still the disk: not one skill
 * copied, and no success line.
 *
 * Run without a terminal, because the refusal lands before the wizard mounts.
 */

describe("init over a marketplace that cannot serve it: filesystem integrity", () => {
  let unbuilt: E2ESource;
  let tempDir: string | undefined;

  beforeAll(async () => {
    // A directory nobody has built — no `.claude-plugin/marketplace.json`.
    unbuilt = await createE2ESource({ unbuilt: true });
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(unbuilt);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "should hard-error BEFORE copying any skill (no partial state on disk)",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, combined } = await runCLI(
        ["init", "--marketplace", unbuilt.sourceDir],
        projectDir,
        { env: { HOME: tempDir } },
      );

      const output = flattenCliOutput(combined);
      expect(
        output,
        "a marketplace with no marketplace.json must be refused, naming the builds that write one",
      ).toMatch(MANIFEST_REFUSAL_BUILDS_IN_ORDER);
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(output).toContain(unbuilt.sourceDir);

      // Partial-state prevention: no skill directories may exist under `.claude/skills/` — at
      // either root — after the refusal.
      await expect({ dir: projectDir }).toHaveNoLocalSkills();
      await expect({ dir: tempDir }).toHaveNoLocalSkills();

      // And the old "Skills copied to:" success banner must never appear.
      expect(output).not.toContain(STEP_TEXT.SKILLS_COPIED_TO);
    },
  );
});
