/**
 * Contract for `scripts/check-briefing-contract.ts` — the scan that the rules an agent is handed
 * stay reachable from the files an agent is told to open.
 *
 * Two halves, like the checks beside it. The first drives it against fixture trees, because the
 * shapes that decide the answer — a link that resolves, a URL that is nobody's promise here, a
 * directory row standing for eight files — cannot all be present in the real tree at once. The
 * second runs it against this repository, which is the assertion that holds the rule.
 */
import { mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import { expectRefusal } from "./refusal-expectations.js";

import {
  BINDING_DOCUMENTS,
  BRIEFING_CONTRACT,
  BROKEN_LINK,
  check,
  DOCUMENTATION_MAP,
  NO_BINDING_DOCUMENT,
  NO_DOCUMENTATION_MAP,
  NO_STANDARDS_DIRECTORY,
  STANDARDS_DIRECTORY,
  UNBOUND_CONTRACT,
  UNINDEXED_STANDARD,
  type Unreachable,
} from "./check-briefing-contract.js";

const ROOT_CLAUDE_MD = "CLAUDE.md";
const PACKAGE_CLAUDE_MD = "packages/cli/CLAUDE.md";

const A_SUBDIRECTORY_STANDARD = "standards/e2e/assertions.md";
const A_STANDARD_NOTHING_INDEXES = "standards/a-rule-set-nobody-can-find.md";
const A_PATH_NOTHING_HOLDS = "todo/plans/a-programme-that-never-ran.md";

/** What each `CLAUDE.md` says when the tree is exactly as the rule wants it. */
const BINDS_THE_CONTRACT: Record<string, string> = {
  [ROOT_CLAUDE_MD]: `See [briefing](./${BRIEFING_CONTRACT}) and [the map](./${DOCUMENTATION_MAP}).\n`,
  [PACKAGE_CLAUDE_MD]: `See [briefing](./.ai-docs/standards/briefing.md).\n`,
};

/** A map naming every standard the fixture writes, one row apiece plus the directory row. */
const INDEXES_EVERYTHING = `# Map\n\n| \`standards/briefing.md\` |\n| \`standards/e2e/\` |\n`;

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

/**
 * A tree with both binding documents, a map and a standards directory, written from one description
 * so a test states only the documents whose text it is about.
 */
async function writeFixtureTree(documents: Record<string, string> = {}): Promise<string> {
  const root = await createTempDir("briefing-contract-");
  roots.push(root);

  const tree: Record<string, string> = {
    ...BINDS_THE_CONTRACT,
    [DOCUMENTATION_MAP]: INDEXES_EVERYTHING,
    [`${STANDARDS_DIRECTORY}/briefing.md`]: "# The briefing contract\n",
    [`${STANDARDS_DIRECTORY}/e2e/assertions.md`]: "# Assertions\n",
    ...documents,
  };

  for (const [document, text] of Object.entries(tree)) {
    const documentPath = path.join(root, document);
    mkdirSync(path.dirname(documentPath), { recursive: true });
    writeFileSync(documentPath, text);
  }

  return root;
}

function findingsFor(root: string): Unreachable[] {
  return check({ repositoryRoot: root }).unreachable;
}

describe("a binding document", () => {
  it("says nothing when every link it makes is on disk", async () => {
    const root = await writeFixtureTree();

    expect(findingsFor(root)).toStrictEqual([]);
  });

  it("reports a link to a path that is not there", async () => {
    const root = await writeFixtureTree({
      [PACKAGE_CLAUDE_MD]: `${BINDS_THE_CONTRACT[PACKAGE_CLAUDE_MD] ?? ""}Read [the bible](./.ai-docs/standards/a-bible-that-was-deleted.md).\n`,
    });

    expect(findingsFor(root)).toStrictEqual([
      {
        document: PACKAGE_CLAUDE_MD,
        target: "packages/cli/.ai-docs/standards/a-bible-that-was-deleted.md",
        reason: BROKEN_LINK,
      },
    ]);
  });

  it("does not judge a URL or a bare anchor", async () => {
    const root = await writeFixtureTree({
      [ROOT_CLAUDE_MD]: `${BINDS_THE_CONTRACT[ROOT_CLAUDE_MD] ?? ""}[docs](https://example.invalid/x) and [above](#how-work-gets-briefed)\n`,
    });

    expect(
      findingsFor(root),
      "a URL is somebody else's promise and an anchor is a claim about the page it sits on; reporting either leaves the scan red over links that work",
    ).toStrictEqual([]);
  });

  it("follows a link past its anchor to the file the path names", async () => {
    const root = await writeFixtureTree({
      [ROOT_CLAUDE_MD]: `[briefing](./${BRIEFING_CONTRACT}#the-rules) and [the map](./${DOCUMENTATION_MAP})\n`,
    });

    expect(findingsFor(root)).toStrictEqual([]);
  });

  it("reports the document that does not link the contract at all", async () => {
    const root = await writeFixtureTree({
      [ROOT_CLAUDE_MD]: `Everything outstanding is in [the map](./${DOCUMENTATION_MAP}).\n`,
    });

    expect(
      findingsFor(root),
      "the rules survive on disk when a CLAUDE.md stops linking them, read as adopted, and are handed to nobody",
    ).toStrictEqual([
      { document: ROOT_CLAUDE_MD, target: BRIEFING_CONTRACT, reason: UNBOUND_CONTRACT },
    ]);
  });

  it("refuses a tree where it is not on disk rather than reading it as linkless", async () => {
    const root = await writeFixtureTree();
    rmSync(path.join(root, PACKAGE_CLAUDE_MD));

    expectRefusal(() => check({ repositoryRoot: root }), NO_BINDING_DOCUMENT);
  });
});

describe("the briefing contract", () => {
  it("has the links it writes read, not only the ones written to it", async () => {
    const root = await writeFixtureTree({
      [BRIEFING_CONTRACT]: `# The briefing contract\n\nThe tally lives in [the progress file](../../../../${A_PATH_NOTHING_HOLDS}).\n`,
    });

    expect(
      findingsFor(root),
      "the document the whole check exists to protect is otherwise a link TARGET and never a source of links, so it may point a reader anywhere and stay green",
    ).toStrictEqual([
      {
        document: BRIEFING_CONTRACT,
        target: A_PATH_NOTHING_HOLDS,
        reason: BROKEN_LINK,
      },
    ]);
  });

  it("refuses a tree where it is not on disk rather than reporting its two bindings as dangling", async () => {
    const root = await writeFixtureTree();
    rmSync(path.join(root, BRIEFING_CONTRACT));

    expectRefusal(
      () => check({ repositoryRoot: root }),
      NO_BINDING_DOCUMENT,
      "a contract that is not there is the loudest failure the check has, not two links that happen to miss",
    );
  });
});

describe("a standard", () => {
  it("reports one the map names nowhere", async () => {
    const root = await writeFixtureTree({
      [`packages/cli/.ai-docs/${A_STANDARD_NOTHING_INDEXES}`]: "# A rule set\n",
    });

    expect(findingsFor(root)).toStrictEqual([
      {
        document: DOCUMENTATION_MAP,
        target: A_STANDARD_NOTHING_INDEXES,
        reason: UNINDEXED_STANDARD,
      },
    ]);
  });

  it("accepts a subdirectory row standing for the files under it", async () => {
    const root = await writeFixtureTree();

    expect(
      check({ repositoryRoot: root }).unreachable.filter(
        (finding) => finding.target === A_SUBDIRECTORY_STANDARD,
      ),
      "`standards/e2e/` is one row for eight files, which is the map working as intended",
    ).toStrictEqual([]);
  });

  it("does not let a bare mention of the standards root answer for the tree", async () => {
    const root = await writeFixtureTree({
      [DOCUMENTATION_MAP]: "# Map\n\nConventions: `standards/`.\n",
    });

    expect(
      findingsFor(root).map((finding) => finding.target),
      "the map's own prose contains that string, so accepting it would make the check vacuous",
    ).toStrictEqual(["standards/briefing.md", A_SUBDIRECTORY_STANDARD]);
  });

  it("refuses a tree with no standards directory rather than reporting none", async () => {
    const root = await writeFixtureTree();
    rmSync(path.join(root, STANDARDS_DIRECTORY), { recursive: true });

    expectRefusal(() => check({ repositoryRoot: root }), NO_STANDARDS_DIRECTORY);
  });

  it("refuses a tree with no documentation map rather than reporting every standard", async () => {
    const root = await writeFixtureTree();
    rmSync(path.join(root, DOCUMENTATION_MAP));

    expectRefusal(() => check({ repositoryRoot: root }), NO_DOCUMENTATION_MAP);
  });
});

/** What each surface must be reading here, so neither one's silence hides behind the other's work. */
const SURFACE_POPULATIONS = { links: "reads some", standards: "reads some" };

function populationOf(examined: number): string {
  return examined > 0 ? "reads some" : "reads none";
}

describe("this repository", () => {
  const repository = check();

  it("reads both surfaces rather than letting one answer for the other", () => {
    const populations = {
      links: populationOf(repository.examined.links),
      standards: populationOf(repository.examined.standards),
    };

    expect(
      populations,
      "a reader that matched nothing reports exactly what a fully-reachable tree reports",
    ).toStrictEqual(SURFACE_POPULATIONS);
  });

  it("has both CLAUDE.md files binding the briefing contract", () => {
    expect(
      repository.unreachable.filter((finding) => finding.reason === UNBOUND_CONTRACT),
      "a brief is not a tracked file, so the link from the two documents an agent opens is the whole of what makes the contract binding",
    ).toStrictEqual([]);
  });

  it("has no standard the documentation map fails to name", () => {
    expect(
      repository.unreachable.filter((finding) => finding.reason === UNINDEXED_STANDARD),
      "a standard absent from the map is a document no loading instruction reaches",
    ).toStrictEqual([]);
  });

  it("has no CLAUDE.md pointing an agent at a path that is not on disk", () => {
    expect(
      repository.unreachable.filter((finding) => finding.reason === BROKEN_LINK),
      `the ${BINDING_DOCUMENTS.length} binding documents are read before any work starts, so a dangling pointer there costs every session`,
    ).toStrictEqual([]);
  });
});
