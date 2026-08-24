import { describe, it, expect, afterEach } from "vitest";
import { STEP_TEXT } from "../pages/constants.js";
import { createTempDir, cleanupTempDir } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";

/**
 * The report `doctor` prints for a directory holding nothing — the state a first-time reader is in.
 *
 * Every leg starts from an empty directory and writes no configuration at all, which is what
 * separates this file from `doctor.e2e.test.ts` beside it: that one asks which ROWS a bare
 * directory gets, and every assertion in it is satisfied by a string appearing somewhere. Both
 * defects pinned here were invisible to that reading. `doctor` switched the shared `verbose()`
 * logger on for the whole run, so the loaders' own trace printed between the section headings and
 * the rows they head; and the row that reaches the marketplace reported the cache directory it
 * landed in while never saying which marketplace it had fetched, or that fetching it had gone to
 * the network at all.
 *
 * The reachability check is deliberately NOT stubbed out. With no configuration anywhere the
 * resolver falls back to the public catalogue and this command fetches it, which is the row doing
 * its job — `Marketplace Reachable` is its name — so a hermetic version of this file would be
 * asserting about a command nobody runs.
 */

/**
 * The `Content checks` section exactly as that directory gets it. Every line is fixed — no paths,
 * no counts — so it is asserted whole, and whole is what makes it an assertion about the report
 * rather than about a string in it: a line spliced anywhere inside this block breaks it.
 *
 * A rendered frame rather than a text constant, which is why it is spelled here and not assembled
 * from `pages/constants.ts`: the layout is part of what the report claims, and a spec that rebuilt
 * the padding from the product's own widths would agree with the padding moving.
 */
const EMPTY_CONTENT_SECTION = [
  "  Content checks",
  "    Config                  ✓  No configs to validate",
  "    Marketplaces            ✓  No marketplaces to validate",
  "                               - marketplace (github:agents-inc/skills) — skipped (remote)",
  "    Plugins                 ✓  No plugins to validate",
  "    Skills                  ✓  No skills to validate",
  "    Agents                  ✓  No agents to validate",
].join("\n");

/**
 * The `Operational checks` heading and the first row under it. Only the first row: every row below
 * it carries a temp path or a live skill count, and the claim here is about what sits between a
 * heading and the report it heads.
 */
const EMPTY_OPERATIONAL_OPENING = [
  "  Operational checks",
  "    Config Valid            ✗  .claude-src/config.ts not found",
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
      "the row reported the cache directory it landed in and never the marketplace it fetched",
    ).toContain(STEP_TEXT.DOCTOR_MARKETPLACE_DEFAULT_FETCHED);
  });
});
