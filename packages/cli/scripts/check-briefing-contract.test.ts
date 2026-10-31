/** Drives the check against fixture trees, then asserts this repository is clean. */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import { expectRefusal } from "./refusal-expectations.js";

import {
  BINDING_DOCUMENTS,
  BRIEFING_CONTRACT,
  BROKEN_LINK,
  check,
  NO_BINDING_DOCUMENT,
  UNBOUND_CONTRACT,
  type Unreachable,
} from "./check-briefing-contract.js";

const ROOT_CLAUDE_MD = "CLAUDE.md";
const PACKAGE_CLAUDE_MD = "packages/cli/CLAUDE.md";

const A_PATH_NOTHING_HOLDS = "todo/plans/a-programme-that-never-ran.md";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

function linkFrom(document: string, target: string): string {
  return path.posix.relative(path.posix.dirname(document), target);
}

const BINDS_THE_CONTRACT: Record<string, string> = {
  [ROOT_CLAUDE_MD]: `See [briefing](./${BRIEFING_CONTRACT}).\n`,
  [PACKAGE_CLAUDE_MD]: `See [briefing](${linkFrom(PACKAGE_CLAUDE_MD, BRIEFING_CONTRACT)}).\n`,
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixtureTree(documents: Record<string, string> = {}): Promise<string> {
  const root = await createTempDir("briefing-contract-");
  roots.push(root);

  const tree: Record<string, string> = {
    ...BINDS_THE_CONTRACT,
    [BRIEFING_CONTRACT]: "# The briefing contract\n",
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
      [ROOT_CLAUDE_MD]: `[briefing](./${BRIEFING_CONTRACT}#the-rules)\n`,
    });

    expect(findingsFor(root)).toStrictEqual([]);
  });

  it("reports the document that does not link the contract at all", async () => {
    const root = await writeFixtureTree({
      [ROOT_CLAUDE_MD]: `Everything outstanding is in [the guide](./${PACKAGE_CLAUDE_MD}).\n`,
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
      [BRIEFING_CONTRACT]: `# The briefing contract\n\nThe tally lives in [the progress file](${linkFrom(BRIEFING_CONTRACT, A_PATH_NOTHING_HOLDS)}).\n`,
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

describe("this repository", () => {
  const repository = check();

  it("reads some links, since a reader that matched nothing reports what a reachable tree does", () => {
    expect(repository.examined).toBeGreaterThan(0);
  });

  it("keeps the contract below no CLAUDE.md but the root's, so reading it loads no other", () => {
    const directories = path.posix
      .dirname(BRIEFING_CONTRACT)
      .split("/")
      .map((_, depth, parts) => parts.slice(0, depth + 1).join("/"));

    expect(
      directories.filter((directory) =>
        existsSync(path.join(REPOSITORY_ROOT, directory, "CLAUDE.md")),
      ),
      "every lane reads the contract, and reading a file loads each CLAUDE.md above it, so one inside a workspace hands that workspace's guide to lanes working elsewhere",
    ).toStrictEqual([]);
  });

  it("has both CLAUDE.md files binding the briefing contract", () => {
    expect(
      repository.unreachable.filter((finding) => finding.reason === UNBOUND_CONTRACT),
      "a brief is not a tracked file, so the link from the two documents an agent opens is the whole of what makes the contract binding",
    ).toStrictEqual([]);
  });

  it("has no CLAUDE.md pointing an agent at a path that is not on disk", () => {
    expect(
      repository.unreachable.filter((finding) => finding.reason === BROKEN_LINK),
      `the ${BINDING_DOCUMENTS.length} binding documents are read before any work starts, so a dangling pointer there costs every session`,
    ).toStrictEqual([]);
  });
});
