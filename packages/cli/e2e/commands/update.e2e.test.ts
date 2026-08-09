import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  writeConfigTypes,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * `update` wraps Claude's own marketplace update and nothing else.
 *
 * It reads the marketplaces its installation's config actually names — the distinct
 * non-eject `source` values on the active skill entries — and runs
 * `claude plugin marketplace update` for each. It never reads a skills source, never
 * compares hashes, never rewrites a skill directory, and never recompiles: subagents
 * reference plugin skills by pointer, so refreshed content lands without touching the
 * compiled agents.
 *
 * Ejected skills are the user's copies. The command says so in one line and leaves them
 * alone, which is what makes an eject-only installation a successful no-op rather than
 * an error.
 *
 * The Claude-CLI-absent runs use a minimal PATH (node + the standard bin directories,
 * no `claude`), the same technique `plugin-uninstall-edge-cases.e2e.test.ts` uses. It is
 * the one claude-dependent branch that is deterministic on every machine: asserting a
 * SUCCESSFUL marketplace refresh from here would need a real marketplace registered in
 * the run's fake HOME, so that assertion lives in the unit spec, against the wrapper.
 */

/** The marketplace name the seeded config claims its plugin skills came from. */
const MARKETPLACE = "e2e-update-marketplace";

/** A PATH with node and the standard bin directories but deliberately no `claude`. */
const PATH_WITHOUT_CLAUDE = [path.dirname(process.execPath), "/usr/bin", "/bin"].join(":");

describe("update command", () => {
  let tempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("declares no skill argument and no flags", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["update", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UPDATE_HELP_SUMMARY);
    expect(stdout, "a plain marketplace refresh confirms nothing, so --yes is gone").not.toContain(
      "--yes",
    );
    expect(
      stdout,
      "the command reads its marketplaces from config, not from a source",
    ).not.toContain("--source");
  });

  it("rejects a skill argument", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["update", E2E_SKILL.react.id], { dir: tempDir });

    expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
    // `topicSeparator: " "` makes a trailing word a subcommand rather than an argument,
    // so the rejection comes from plugin-not-found: there is no `update <skill>` at all.
    expect(output, "there are no per-skill updates left to target").toContain(
      `update ${E2E_SKILL.react.id} is not a`,
    );
  });

  it("reports no installation and exits successfully in an empty directory", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["update"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.NO_INSTALLATION);
  });

  it(
    "leaves an eject-only installation untouched and needs no Claude CLI to say so",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await writeProjectConfig(projectDir, {
        name: "eject-only",
        skills: [{ id: E2E_SKILL.react.id, scope: "project", source: "eject" }],
        agents: [],
      });
      await writeConfigTypes(projectDir);
      await createLocalSkill(projectDir, E2E_SKILL.react.id);

      const { exitCode, output } = await CLI.run(
        ["update"],
        { dir: projectDir },
        { env: { PATH: PATH_WITHOUT_CLAUDE, HOME: projectDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output, "the ownership line is the whole answer for an ejected skill").toContain(
        STEP_TEXT.UPDATE_EJECTED_OWNED,
      );
      expect(output, "an eject-only install configures no marketplace to refresh").toContain(
        STEP_TEXT.UPDATE_NO_MARKETPLACES,
      );
      expect(
        output,
        "no marketplace means no Claude CLI is needed, so its absence must not surface",
      ).not.toContain(STEP_TEXT.UPDATE_NO_CLAUDE_CLI);
    },
  );

  it(
    "names the ejected skills it is leaving alone before it reaches the Claude CLI",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await writeProjectConfig(projectDir, {
        name: "mixed-install",
        skills: [
          { id: E2E_SKILL.react.id, scope: "project", source: "eject" },
          { id: E2E_SKILL.vitest.id, scope: "project", source: MARKETPLACE },
        ],
        agents: [],
      });
      await writeConfigTypes(projectDir);
      await createLocalSkill(projectDir, E2E_SKILL.react.id);

      const { exitCode, output } = await CLI.run(
        ["update"],
        { dir: projectDir },
        { env: { PATH: PATH_WITHOUT_CLAUDE, HOME: projectDir } },
      );

      // The ownership line is printed before the marketplace half runs, so it survives
      // the run that cannot reach the Claude CLI — that ordering is the assertion.
      expect(output).toContain(STEP_TEXT.UPDATE_EJECTED_OWNED);
      expect(output, "a mixed install does configure a marketplace").not.toContain(
        STEP_TEXT.UPDATE_NO_MARKETPLACES,
      );
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(output).toContain(STEP_TEXT.UPDATE_NO_CLAUDE_CLI);
    },
  );

  it(
    "fails with an actionable error when a marketplace is configured but the Claude CLI is missing",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await writeProjectConfig(projectDir, {
        name: "plugin-install",
        skills: [{ id: E2E_SKILL.react.id, scope: "project", source: MARKETPLACE }],
        agents: [],
      });
      await writeConfigTypes(projectDir);

      const { exitCode, output } = await CLI.run(
        ["update"],
        { dir: projectDir },
        { env: { PATH: PATH_WITHOUT_CLAUDE, HOME: projectDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(output).toContain(STEP_TEXT.UPDATE_NO_CLAUDE_CLI);
      expect(output, "nothing was refreshed, so nothing may claim to be").not.toContain(
        STEP_TEXT.UPDATE_COMPLETE,
      );
    },
  );
});
