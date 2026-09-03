import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  SPEC_DIRECTORIES,
  TO_TEST_MARKER,
  journeyNumbersIn,
  nonSpecNamesIn,
  readJourneyRows,
  readSpecNames,
  specDirectoriesIn,
  specsNamedBy,
  unlocatedSpecsIn,
} from "./journey-page.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const E2E_ROOT = path.join(CLI_ROOT, "e2e");

/** The spec tree a fixture page is read against, small enough to state and to reason about. */
const SPEC_NAMES = [
  "commands/init-from-agent-scope",
  "commands/init-from-shared-config",
  "lifecycle/install-mode-bulk",
];

/**
 * The same tree once `e2e/fixtures/` holds its first spec. Nothing else about it moves, which is
 * the whole point: the two lists differ by one member, and no name the page carries is about it.
 */
const SPEC_NAMES_WITH_A_FIXTURES_SPEC = [...SPEC_NAMES, "fixtures/init-from-a-seeded-store"];

/**
 * What journey 1 writes to name the helper driving its install — a module path, then a symbol
 * inside it. It is not a spec and never was, and it lives in a directory that holds none.
 */
const HELPER_AND_SYMBOL = "fixtures/dual-scope-helpers.initGlobalWithEject";

const HEADER = `| #   | Journey | From-scratch spec | Surfaces asserted | Status |
| --- | ------- | ----------------- | ----------------- | ------ |`;

/**
 * A numbered table that is not a journey table, written the same width as one so that nothing but
 * its heading cells can tell the two apart. The page carries such a table — the four assertion
 * surfaces, numbered 1 to 4 — and a reader discriminating by width would read its rows as journeys.
 */
const SURFACES_TABLE = [
  "| #   | Surface | What it is | Read it with | Notes |",
  "| --- | ------- | ---------- | ------------ | ----- |",
  "| 1   | Compiled agent files | what a run wrote | `readCompiledAgents` | none |",
].join("\n");

function page(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("readJourneyRows", () => {
  it("reads a row's number, its journey, its named specs and its coverage marker", () => {
    const [row] = readJourneyRows(
      page(
        "| 13 | `init --from` installs | `commands/init-from-shared-config` | 1, 2 | **COVERED** — all of it |",
      ),
      SPEC_NAMES,
    );

    expect(row).toStrictEqual({
      number: "13",
      journey: "`init --from` installs",
      references: [{ name: "commands/init-from-shared-config", kind: "spec" }],
      marker: "COVERED",
    });
  });

  it("takes the whole Status cell as the marker when the page bolds nothing in it", () => {
    const [row] = readJourneyRows(
      page("| 4 | Something | `lifecycle/install-mode-bulk` | 2 | TO TEST |"),
      SPEC_NAMES,
    );

    expect(row?.marker).toBe(TO_TEST_MARKER);
  });

  it("reads every row of a multi-row table, including a lettered number", () => {
    const rows = readJourneyRows(
      page(
        "| 13 | One | `commands/init-from-shared-config` | 1 | **COVERED** |",
        "| 13b | Two | `commands/init-from-agent-scope` | 1 | **PARTIAL** |",
      ),
      SPEC_NAMES,
    );

    expect(rows.map((row) => row.number)).toStrictEqual(["13", "13b"]);
  });

  it("passes over a table row that is not a journey row", () => {
    const rows = readJourneyRows(
      page(
        "| 13 | Real | `commands/init-from-shared-config` | 1 | **COVERED** |",
        "| Note | a three-column aside | on the same page |",
        "| n/a | a five-column row whose # is not a number | `commands/init-from-agent-scope` | 1 | **COVERED** |",
      ),
      SPEC_NAMES,
    );

    expect(rows.map((row) => row.number)).toStrictEqual(["13"]);
  });
});

/**
 * The two guards that make the reader's silence mean something. Without the first, a page whose
 * table shape moved reads exactly like a page with nothing to answer for, and every judgement over
 * it holds vacuously. Without the second, a row is proved by a spec that does not exist.
 */
describe("the reader refuses to judge nothing", () => {
  it("throws when no journey row parses at all", () => {
    expect(() => readJourneyRows("# A page with prose and no table\n", SPEC_NAMES)).toThrow(
      /no journey row parsed/,
    );
  });

  it("throws when a name inside a spec directory answers to no file", () => {
    expect(() =>
      readJourneyRows(page("| 9 | Gone | `commands/deleted-spec` | 1 | **COVERED** |"), SPEC_NAMES),
    ).toThrow(/commands\/deleted-spec/);
  });
});

/**
 * Every backticked name is classified, because the two ways one can fail to be a spec reference are
 * NOT the same: a bare `init-from-agent-scope` is a spec the page named without saying where it
 * lives, and `skipIf` is a code symbol that was never a spec. A reader that skipped both identically
 * left six entries unjudged while the page read as fully checked.
 */
describe("every backticked name is classified rather than skipped", () => {
  it("names where a spec lives when the page named it without its directory", () => {
    const rows = readJourneyRows(
      page("| 13 | Bare | `init-from-agent-scope` | 1 | **PARTIAL** |"),
      SPEC_NAMES,
    );

    expect(rows[0]?.references).toStrictEqual([
      {
        name: "init-from-agent-scope",
        kind: "unlocated-spec",
        livesAt: "commands/init-from-agent-scope",
      },
    ]);
    expect(unlocatedSpecsIn(rows)).toStrictEqual(["init-from-agent-scope"]);
    expect(specsNamedBy(rows[0]!)).toStrictEqual([]);
  });

  it("records a name no spec answers to, so a gate can require it to be a known one", () => {
    const rows = readJourneyRows(
      page(
        "| 17 | Blocked | `lifecycle/install-mode-bulk` (`skipIf`) | 2 | **TO TEST (blocked)** |",
      ),
      SPEC_NAMES,
    );

    expect(nonSpecNamesIn(rows)).toStrictEqual(["skipIf"]);
    expect(specsNamedBy(rows[0]!)).toStrictEqual(["lifecycle/install-mode-bulk"]);
    expect(rows[0]?.marker).toBe("TO TEST (blocked)");
  });
});

/**
 * A name's kind is a fact about the name, not about what happens to sit beside it in the tree.
 *
 * The reader used to decide whether the page MEANT a spec by asking whether the name's first
 * segment was a directory that currently holds one — so `e2e/fixtures/` counted as helper-land
 * purely because no spec had ever been written there. Put the first one there and journey 1's
 * `fixtures/dual-scope-helpers.initGlobalWithEject` became a spec reference answering to no file,
 * the reader threw, and every gate in `spec-gates.test.ts` that walks row → spec went red naming a
 * journey row and a helper that had not moved. It has happened once already, which is the whole
 * reason the two lists below differ by a single member no assertion here mentions.
 */
describe("a name's kind does not move when the tree around it does", () => {
  const NAMING_A_HELPER = page(
    `| 1 | Global install from nothing | \`lifecycle/install-mode-bulk\`; \`${HELPER_AND_SYMBOL}\` drives it | 1, 2 | **COVERED** |`,
  );

  it("reads a helper as a helper whether or not its directory has gained a spec", () => {
    const before = readJourneyRows(NAMING_A_HELPER, SPEC_NAMES);
    const after = readJourneyRows(NAMING_A_HELPER, SPEC_NAMES_WITH_A_FIXTURES_SPEC);

    // The subject guard for the claim beside it: a page whose helper went unread would leave both
    // sides empty and agreeing, which is the vacuous form of this whole comparison.
    expect(nonSpecNamesIn(before)).toStrictEqual([HELPER_AND_SYMBOL]);
    expect(nonSpecNamesIn(after)).toStrictEqual([HELPER_AND_SYMBOL]);
  });

  it("leaves the specs a row names alone when its directory has gained a spec", () => {
    const [before] = readJourneyRows(NAMING_A_HELPER, SPEC_NAMES);
    const [after] = readJourneyRows(NAMING_A_HELPER, SPEC_NAMES_WITH_A_FIXTURES_SPEC);

    expect(specsNamedBy(before!)).toStrictEqual(["lifecycle/install-mode-bulk"]);
    expect(specsNamedBy(after!)).toStrictEqual(["lifecycle/install-mode-bulk"]);
  });
});

/**
 * The row-level half of that same totality, which for a while was the half nothing held. A name
 * that fails to resolve is classified; a ROW that failed to parse was passed over, and one
 * unescaped `|` inside a code span is all it takes — markdown makes an extra cell of it, the reader
 * skips the row, and every gate walking row → spec skips it in silence with the page still reading
 * as fully checked.
 */
describe("a row the reader cannot read is numbered all the same", () => {
  it("numbers a row whose cells came out wrong, so a gate can see the reader pass over it", () => {
    const dropped = page(
      "| 13 | Read | `commands/init-from-shared-config` | 1 | **COVERED** |",
      "| 14 | Split in two | `commands/init-from-agent-scope` | 1 | **COVERED** — emits `A | B` |",
    );

    expect(readJourneyRows(dropped, SPEC_NAMES).map((row) => row.number)).toStrictEqual(["13"]);
    expect(journeyNumbersIn(dropped)).toStrictEqual(["13", "14"]);
  });

  it("reads an escaped pipe as part of its cell rather than as the end of one", () => {
    const [row] = readJourneyRows(
      page("| 14 | A union of `X \\| Y` | `commands/init-from-agent-scope` | 1 | **COVERED** |"),
      SPEC_NAMES,
    );

    expect(row?.journey).toBe("A union of `X | Y`");
    expect(row?.marker).toBe("COVERED");
  });

  it("reads and numbers the journey tables alone, not every numbered table on the page", () => {
    const both = `${SURFACES_TABLE}\n\n${page("| 13 | Read | `commands/init-from-shared-config` | 1 | **COVERED** |")}`;

    expect(readJourneyRows(both, SPEC_NAMES).map((row) => row.number)).toStrictEqual(["13"]);
    expect(journeyNumbersIn(both)).toStrictEqual(["13"]);
  });
});

/**
 * The reader's only contact with the filesystem, kept apart from the parsing so the rest of it is
 * pure. Read against the real tree rather than a fixture: what it has to get right is the shape
 * this repository's specs are actually named in.
 */
describe("readSpecNames", () => {
  it("names every e2e spec the way the page names one — directory, basename, no suffix", () => {
    const specNames = readSpecNames(E2E_ROOT);

    expect(
      specNames.length,
      "the e2e tree holds no specs — the glob has stopped matching",
    ).toBeGreaterThan(0);
    expect(specNames).toContain("commands/init-from-shared-config");
    expect(specNames.filter((name) => name.endsWith(".ts"))).toStrictEqual([]);
  });
});

/**
 * What keeps `SPEC_DIRECTORIES` honest, and the reason stating it is not a return to the
 * hand-maintained list this reader once declined to judge six entries behind.
 *
 * The old list said nothing when the tree moved out from under it. This one reddens here — by
 * MEMBERS, so the message names the directory and the side it is missing from. A count would say
 * only that something changed, and could not tell a directory gained from one swapped for another.
 * Watched red by dropping `pages` from the constant: this assertion, and only this assertion.
 */
describe("the stated spec directories are the directories the tree holds", () => {
  it("names every e2e directory that holds a spec, and none that holds none", () => {
    expect(
      specDirectoriesIn(readSpecNames(E2E_ROOT)),
      "the e2e tree's spec directories have moved — state the new one in SPEC_DIRECTORIES, or drop the one that no longer holds a spec. Until it is stated, a name under it that answers to no file is read as a helper rather than reported as a spec that has gone",
    ).toStrictEqual(SPEC_DIRECTORIES);
  });

  it("folds a directory named by many specs into one member, in a stable order", () => {
    expect(specDirectoriesIn(SPEC_NAMES_WITH_A_FIXTURES_SPEC)).toStrictEqual([
      "commands",
      "fixtures",
      "lifecycle",
    ]);
  });
});
