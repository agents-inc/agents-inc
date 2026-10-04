import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { withCodexOnIt } from "../fixtures/codex-on-path.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { foundByName } from "../helpers/found-by-name.js";
import { pathHoldingOnly } from "../helpers/path-holding-only.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
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
 * compares hashes, never rewrites a skill directory, and never recompiles.
 *
 * Ejected skills are the user's copies. The command says so in one line and leaves them
 * alone, which is what makes an eject-only installation a successful no-op rather than
 * an error.
 *
 * The Claude-CLI-absent runs are handed a PATH holding node and sh alone, and ASSERT that no
 * `claude` is found on it — the technique `plugin-uninstall-edge-cases.e2e.test.ts` uses. Asserting
 * a SUCCESSFUL marketplace refresh from here would need a real marketplace registered in the run's
 * fake HOME, so that assertion lives in the unit spec, against the wrapper.
 *
 * _Corrected 2026-09-26:_ these runs were handed `node`'s own bin directory plus `/usr/bin:/bin`,
 * and called that deterministic on every machine. It is where `npm i -g @anthropic-ai/claude-code`
 * puts `claude`, and on the machine this was measured on it held one — so the "no Claude CLI" cases
 * ran with a real `claude` on their PATH.
 */

/** The marketplace name the seeded config claims its plugin skills came from. */
const MARKETPLACE = "e2e-update-marketplace";

/**
 * A PATH holding node and sh alone, linked under `root`, and the subject guard that no `claude` is
 * found on it — asked of the PATH the command is actually handed, since `CLI.run` puts the pinned
 * codex in front of whatever it is given.
 */
async function aPathWithoutClaude(root: string): Promise<string> {
  const searchPath = await pathHoldingOnly({ root }, ["node", "sh"]);
  expect(
    await foundByName("claude", withCodexOnIt(searchPath)),
    "the run below would have a claude on its PATH, so it could not show what its absence does",
  ).toBe("");
  return searchPath;
}

describe("update command", () => {
  let tempDir: string | undefined;

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
    ).not.toContain("--marketplace");
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
        skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
        agents: [],
      });
      await writeConfigTypes(projectDir);
      await createLocalSkill(projectDir, E2E_SKILL.react.id);

      const { exitCode, output } = await CLI.run(
        ["update"],
        { dir: projectDir },
        { env: { PATH: await aPathWithoutClaude(tempDir), HOME: projectDir } },
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
          { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
          { id: E2E_SKILL.vitest.id, scope: "project", origin: MARKETPLACE },
        ],
        agents: [],
      });
      await writeConfigTypes(projectDir);
      await createLocalSkill(projectDir, E2E_SKILL.react.id);

      const { exitCode, output } = await CLI.run(
        ["update"],
        { dir: projectDir },
        { env: { PATH: await aPathWithoutClaude(tempDir), HOME: projectDir } },
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
        skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: MARKETPLACE }],
        agents: [],
      });
      await writeConfigTypes(projectDir);

      const { exitCode, output } = await CLI.run(
        ["update"],
        { dir: projectDir },
        { env: { PATH: await aPathWithoutClaude(tempDir), HOME: projectDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(output).toContain(STEP_TEXT.UPDATE_NO_CLAUDE_CLI);
      expect(output, "nothing was refreshed, so nothing may claim to be").not.toContain(
        STEP_TEXT.UPDATE_PLUGINS_UNCHANGED,
      );
    },
  );
});
