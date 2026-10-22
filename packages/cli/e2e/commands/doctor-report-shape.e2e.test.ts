import { describe, it, expect, afterEach } from "vitest";
import { STEP_TEXT } from "../pages/constants.js";
import { createTempDir, cleanupTempDir } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";

/**
 * `doctor` over an empty directory: no loader trace between headings and rows, and the marketplace
 * row names what it reached. Reachability is not stubbed: with no config the public catalogue is
 * really fetched.
 */

/** Asserted whole and spelled literally: the layout is part of the claim. */
const EMPTY_CONTENT_SECTION = [
  "  Content checks",
  "    Config                  ✓  No configs to validate",
  "    Marketplaces            ✓  No marketplaces to validate",
  "                               - marketplace (github:agents-inc/skills) — skipped (remote)",
  "    Plugins                 ✓  No plugins to validate",
  "    Skills                  ✓  No skills to validate",
  "    Agents                  ✓  No agents to validate",
  "",
  "  Operational checks",
].join("\n");

/**
 * Only the first row; later rows carry temp paths. With no global home of its own, the run
 * directory is home (`globalHomeFor`).
 */
const EMPTY_OPERATIONAL_OPENING = [
  "  Operational checks",
  "    Config Valid            ✗  The global installation: ~/.agents-inc/claude/config.ts not found",
].join("\n");

describe("the report doctor prints over a directory holding nothing", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  it("prints its report and none of its own internals", async () => {
    tempDir = await createTempDir();

    const { stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(
      stdout,
      "the loaders' diagnostics landed between each heading and the rows it heads",
    ).toContain(EMPTY_CONTENT_SECTION);
    expect(stdout).toContain(EMPTY_OPERATIONAL_OPENING);
  });

  it("says which marketplace it reached, and that reaching it went to the network", async () => {
    tempDir = await createTempDir();

    const { stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(
      stdout,
      "the row reported the cache directory it landed in and never the marketplace it reached",
    ).toContain(STEP_TEXT.DOCTOR_MARKETPLACE_DEFAULT_REACHED);
  });
});
