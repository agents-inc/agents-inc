/**
 * Contract for `scripts/check-findings-frontmatter.ts` — the scan that every finding's YAML
 * frontmatter is readable by a parser and not merely shaped like one.
 *
 * Two halves, like the cross-workspace checks beside it. The first drives the check against fixture
 * directories, because the shapes that matter (a bare `: ` inside a prose scalar, a plain scalar
 * wrapped onto a second line, the quoted and block-scalar forms that fix them) cannot all exist in
 * the real directory at once — the whole point of the second half is that none of them does. The
 * second runs it against this repository, which is the assertion that actually holds the rule.
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import { check, NO_FRONTMATTER } from "./check-findings-frontmatter.js";

const FINDING_FILE = "2026-01-01-a-finding.md";
const OTHER_FINDING_FILE = "2026-01-02-another-finding.md";
const NOT_MARKDOWN = "notes.txt";

const BODY = "\n## What Was Wrong\n\nSomething.\n";

/** The offender, in the field it always lands in: a bare colon-space inside an unquoted value. */
const PROSE_WITH_A_BARE_COLON = [
  "---",
  "type: anti-pattern",
  "status: resolved",
  "resolved_by: Closed today. Pending: nothing, the ratio is now 1:1.",
  "---",
].join("\n");

/**
 * The adjacent failure: a plain scalar wrapped onto a second line, with the colon-space on the
 * continuation rather than the first line. Wrapping alone is legal — this is a plain multi-line
 * scalar and YAML folds it — so the fixture has to carry the colon to fail, which is exactly the
 * shape two of the real ten had.
 */
const PROSE_WRAPPED_WITHOUT_A_BLOCK_SCALAR = [
  "---",
  "type: anti-pattern",
  "status: partial",
  "partial_note:",
  "  The docs landed and the code did not, which is the direction README.md documents.",
  "  Verified by rendering it through agent.liquid: one wrapper, opening straight onto content.",
  "---",
].join("\n");

const PROSE_IN_DOUBLE_QUOTES = [
  "---",
  "type: anti-pattern",
  "status: resolved",
  'resolved_by: "Closed today. Pending: nothing, the ratio is now 1:1."',
  "---",
].join("\n");

const PROSE_IN_A_BLOCK_SCALAR = [
  "---",
  "type: anti-pattern",
  "status: resolved",
  "resolved_by: >-",
  "  Closed today. Pending: nothing, the ratio is now 1:1, and a wrapped second line",
  "  carrying `key: value` quoted from source is fine in here too.",
  "---",
].join("\n");

const NO_FRONTMATTER_AT_ALL = "# A finding written before the frontmatter convention\n";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixtureDir(files: Record<string, string>): Promise<string> {
  const root = await createTempDir("findings-frontmatter-");
  roots.push(root);
  mkdirSync(root, { recursive: true });

  for (const [file, content] of Object.entries(files)) {
    writeFileSync(path.join(root, file), `${content}${content.endsWith("\n") ? "" : BODY}`);
  }

  return root;
}

describe("a finding whose frontmatter no parser can read", () => {
  it("is reported when a prose value carries a bare colon-space, and the check is not clean", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_WITH_A_BARE_COLON });

    const { clean, verdicts } = check({ findingsDir: root });

    expect(clean).toBe(false);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({ file: FINDING_FILE, outcome: "unreadable" });
  });

  it("is reported when a plain scalar wraps onto a second line", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_WRAPPED_WITHOUT_A_BLOCK_SCALAR });

    expect(check({ findingsDir: root }).clean).toBe(false);
  });

  it("names the file and the parser's own first line, so the fix is one edit away", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_WITH_A_BARE_COLON });

    const [verdict] = check({ findingsDir: root }).verdicts;

    expect(verdict?.outcome).toBe("unreadable");
    expect(
      verdict?.outcome === "unreadable" ? verdict.problem : "",
      "a scan that says only which file is wrong makes the reader re-derive the fault",
    ).not.toBe("");
  });

  it("is reported when the file opens with no frontmatter block", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: NO_FRONTMATTER_AT_ALL });

    expect(check({ findingsDir: root }).verdicts).toStrictEqual([
      { file: FINDING_FILE, outcome: "unreadable", problem: NO_FRONTMATTER },
    ]);
  });
});

describe("a finding whose prose is quoted or written as a block scalar", () => {
  it("is readable with the value in double quotes", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_IN_DOUBLE_QUOTES });

    expect(check({ findingsDir: root })).toStrictEqual({
      clean: true,
      verdicts: [{ file: FINDING_FILE, outcome: "readable" }],
    });
  });

  it("is readable with the value as a folded block scalar, colons and all", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_IN_A_BLOCK_SCALAR });

    expect(check({ findingsDir: root }).verdicts).toStrictEqual([
      { file: FINDING_FILE, outcome: "readable" },
    ]);
  });
});

describe("the scan", () => {
  it("judges every markdown file and nothing else", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: PROSE_IN_DOUBLE_QUOTES,
      [OTHER_FINDING_FILE]: PROSE_WITH_A_BARE_COLON,
      [NOT_MARKDOWN]: PROSE_WITH_A_BARE_COLON,
    });

    const { verdicts } = check({ findingsDir: root });

    expect(verdicts.map((verdict) => verdict.file)).toStrictEqual([
      FINDING_FILE,
      OTHER_FINDING_FILE,
    ]);
  });

  it("reports one unreadable file among readable siblings rather than stopping at the first", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: PROSE_WITH_A_BARE_COLON,
      [OTHER_FINDING_FILE]: PROSE_IN_A_BLOCK_SCALAR,
    });

    const { clean, verdicts } = check({ findingsDir: root });

    expect(clean).toBe(false);
    expect(verdicts.filter((verdict) => verdict.outcome === "readable")).toHaveLength(1);
  });
});

describe("this repository", () => {
  it("has no finding whose frontmatter a parser cannot read", () => {
    const { clean, verdicts } = check();

    expect(verdicts.length, "the scan must have something to scan").toBeGreaterThan(0);
    expect(
      verdicts.filter((verdict) => verdict.outcome === "unreadable"),
      "every status rollup and link scan over this directory is defined on parsed frontmatter — an unreadable file is skipped by all of them silently",
    ).toStrictEqual([]);
    expect(clean).toBe(true);
  });
});
