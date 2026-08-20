/**
 * Contract for `scripts/check-finding-citations.ts` — the scan that a finding named outside
 * `.ai-docs/` is a finding that still exists.
 *
 * Two halves, like the checks beside it. The first drives it against fixture trees, because the
 * shapes that decide the answer — a link versus a mention, a name that is a substring of a longer
 * filename, a name truncated with an ellipsis — cannot all be present in the real tree at once. The
 * second runs it against this repository, which is the assertion that holds the rule.
 */
import { mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  AGENT_FINDINGS,
  AGENT_SUGGESTIONS,
  check,
  type Citation,
  type CitationScope,
  CHANGELOGS,
  FINDING_DIRECTORIES,
  NO_FINDING_DIRECTORY,
  NO_SCOPE_DIRECTORY,
  SCOPES,
  SPECS,
  TRACKERS,
} from "./check-finding-citations.js";

const A_LIVE_FINDING = "2026-08-19-a-finding-that-is-still-on-disk";
const A_DELETED_FINDING = "2026-08-19-a-finding-a-batch-removed";
const A_SUGGESTION = "2026-08-19-a-proposal-in-the-sibling-directory";

const TRACKER = "cli.md";
const RELEASE_NOTE = "0.99.0.md";

/** A spec cites in a comment, and its tree holds no markdown at all — hence the `.ts` suffix. */
const SPEC = "lifecycle/a-journey.e2e.test.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

/**
 * A tree with both finding directories and both scopes, written from one description so a test
 * states only the documents whose text it is about.
 */
async function writeFixtureTree(documents: Record<string, string>): Promise<string> {
  const root = await createTempDir("finding-citations-");
  roots.push(root);

  for (const directory of [...FINDING_DIRECTORIES, TRACKERS, CHANGELOGS, SPECS]) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  writeFileSync(path.join(root, AGENT_FINDINGS, `${A_LIVE_FINDING}.md`), "# on disk\n");
  writeFileSync(path.join(root, AGENT_SUGGESTIONS, `${A_SUGGESTION}.md`), "# a proposal\n");

  for (const [document, text] of Object.entries(documents)) {
    const documentPath = path.join(root, document);
    // A spec sits in a subdirectory of its scope, which no scope root above has created.
    mkdirSync(path.dirname(documentPath), { recursive: true });
    writeFileSync(documentPath, text);
  }

  return root;
}

function trackerCitations(root: string): Citation[] {
  return check({ repositoryRoot: root }).dangling;
}

describe("a tracker naming a finding", () => {
  it("reports the name when nothing on disk carries it", async () => {
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `Closes \`${A_DELETED_FINDING}.md\`.\n`,
    });

    expect(trackerCitations(root)).toStrictEqual([
      { document: `${TRACKERS}/${TRACKER}`, name: A_DELETED_FINDING, form: "mention" },
    ]);
  });

  it("says nothing when the finding is on disk", async () => {
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `The evidence is \`${A_LIVE_FINDING}.md\`.\n`,
    });

    expect(trackerCitations(root)).toStrictEqual([]);
  });

  it("resolves a name in the suggestions directory, which the shape cannot distinguish", async () => {
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `See \`${A_SUGGESTION}.md\`.\n`,
    });

    expect(
      trackerCitations(root),
      "a suggestion is dated and named exactly like a finding, and a scan reading one directory calls every one of them dangling",
    ).toStrictEqual([]);
  });

  it("reports a name whether it is written with the extension or without", async () => {
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `Both \`${A_DELETED_FINDING}.md\` and ${A_DELETED_FINDING} again.\n`,
    });

    expect(
      trackerCitations(root),
      "a name written twice in one document is two edits, and reporting it once under-reports the repair",
    ).toStrictEqual([
      { document: `${TRACKERS}/${TRACKER}`, name: A_DELETED_FINDING, form: "mention" },
      { document: `${TRACKERS}/${TRACKER}`, name: A_DELETED_FINDING, form: "mention" },
    ]);
  });

  it("does not read a finding-shaped tail of a longer filename as a citation", async () => {
    const plan = "custom-skills-2026-08-06-investigation";
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `The detail is in [\`todo/plans/${plan}.md\`](./plans/${plan}.md).\n`,
    });

    expect(
      trackerCitations(root),
      "a date in the middle of a plan filename is part of that name, not a reference to a finding",
    ).toStrictEqual([]);
  });

  it("reads a name truncated with an ellipsis as the name it abbreviates", async () => {
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `The finding (\`${A_DELETED_FINDING}-…\`) argues convention.\n`,
    });

    expect(
      trackerCitations(root),
      "an abbreviation is still a claim that the file exists, and the trailing hyphen is not part of any name",
    ).toStrictEqual([
      { document: `${TRACKERS}/${TRACKER}`, name: A_DELETED_FINDING, form: "mention" },
    ]);
  });

  it("reports each document that names a gone finding, not the name once", async () => {
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `Closes ${A_DELETED_FINDING}.\n`,
      [`${TRACKERS}/repo.md`]: `Also ${A_DELETED_FINDING}.\n`,
    });

    expect(
      trackerCitations(root).map((citation) => citation.document),
      "the repair is per row, and a row is in a document",
    ).toStrictEqual([`${TRACKERS}/${TRACKER}`, `${TRACKERS}/repo.md`]);
  });
});

/**
 * The scope split `agent-findings/INDEX.md` states and the one exception it carries. A release note
 * naming a finding is a dated statement about a past version and stays true after the file goes;
 * rewriting one would falsify the record of what the release said. A LINK is different — it offers
 * a reader a pointer that resolves to nothing — and twenty-seven of them were de-linked for exactly
 * that reason.
 */
describe("a changelog naming a finding", () => {
  it("is left alone when the name is plain text", async () => {
    const root = await writeFixtureTree({
      [`${CHANGELOGS}/${RELEASE_NOTE}`]: `Closes ${A_DELETED_FINDING}.md.\n`,
    });

    expect(check({ repositoryRoot: root }).dangling).toStrictEqual([]);
  });

  it("is reported when the name is a link that resolves to nothing", async () => {
    const target = `../.ai-docs/agent-findings/${A_DELETED_FINDING}.md`;
    const root = await writeFixtureTree({
      [`${CHANGELOGS}/${RELEASE_NOTE}`]: `Closes [\`${A_DELETED_FINDING}.md\`](${target}).\n`,
    });

    expect(check({ repositoryRoot: root }).dangling).toStrictEqual([
      { document: `${CHANGELOGS}/${RELEASE_NOTE}`, name: A_DELETED_FINDING, form: "link" },
    ]);
  });

  it("is left alone when the link resolves", async () => {
    const target = `../.ai-docs/agent-findings/${A_LIVE_FINDING}.md`;
    const root = await writeFixtureTree({
      [`${CHANGELOGS}/${RELEASE_NOTE}`]: `Closes [\`${A_LIVE_FINDING}.md\`](${target}).\n`,
    });

    expect(check({ repositoryRoot: root }).dangling).toStrictEqual([]);
  });
});

describe("the scan", () => {
  it("refuses a scope whose directory is not there, rather than reading nothing", async () => {
    const root = await writeFixtureTree({});
    rmSync(path.join(root, TRACKERS), { recursive: true });

    expect(
      () => check({ repositoryRoot: root }),
      "a scope that quietly reads no documents reads exactly like a scope that passed",
    ).toThrow(NO_SCOPE_DIRECTORY);
  });

  it("refuses a finding directory that is not there, rather than resolving nothing", async () => {
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `See \`${A_SUGGESTION}.md\`.\n`,
    });
    rmSync(path.join(root, AGENT_SUGGESTIONS), { recursive: true });

    expect(
      () => check({ repositoryRoot: root }),
      "a resolution set missing one of its halves calls every citation of that half dangling",
    ).toThrow(NO_FINDING_DIRECTORY);
  });

  it("reads every scope it is given rather than stopping at the first defect", async () => {
    const link = `[\`${A_DELETED_FINDING}.md\`](./${A_DELETED_FINDING}.md)`;
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `Closes ${A_DELETED_FINDING}.\n`,
      [`${CHANGELOGS}/${RELEASE_NOTE}`]: `Closes ${link}.\n`,
    });

    expect(check({ repositoryRoot: root }).dangling.map((citation) => citation.form)).toStrictEqual(
      ["mention", "link"],
    );
  });

  it("counts the citations it resolved, so reading nothing is not the answer resolving everything gives", async () => {
    const readsNothing = await writeFixtureTree({});
    const resolvesEverything = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `The evidence is \`${A_LIVE_FINDING}.md\`.\n`,
    });

    expect(
      check({ repositoryRoot: readsNothing }).dangling,
      "a scope present but empty and a scope whose every citation resolves report the same list, which is why the list alone cannot carry an assertion",
    ).toStrictEqual(check({ repositoryRoot: resolvesEverything }).dangling);

    expect([
      check({ repositoryRoot: readsNothing }).examined,
      check({ repositoryRoot: resolvesEverything }).examined,
    ]).toStrictEqual([0, 1]);
  });

  it("counts a citation its scope does not refuse, which is the population the filter runs on", async () => {
    const root = await writeFixtureTree({
      [`${CHANGELOGS}/${RELEASE_NOTE}`]: `Closes ${A_DELETED_FINDING}.md.\n`,
    });
    const result = check({ repositoryRoot: root });

    expect(
      result.dangling,
      "a release note keeps its words, so this one is examined and cleared",
    ).toStrictEqual([]);
    expect(
      result.examined,
      "counting only what survives the refusal rule would make the changelog scope unguardable in exactly the way the count exists to prevent",
    ).toBe(1);
  });

  it("names every scope, so widening the scan is a row rather than a second file", () => {
    expect(SCOPES.map((scope) => scope.directory)).toStrictEqual([TRACKERS, CHANGELOGS, SPECS]);
  });
});

/**
 * The spec scope, and the one thing about it that is not shared with the two above: its tree holds
 * no markdown. A scope reader that judged documents by a `.md` suffix would walk 274 specs, read
 * none of them, and report a clean tree — which is the vacuous pass this file's `examined` count
 * exists to make impossible, arriving one level lower where that count cannot see it.
 */
describe("a spec citing a finding", () => {
  it("is read at all, though the citation is in TypeScript rather than markdown", async () => {
    const root = await writeFixtureTree({
      [`${SPECS}/${SPEC}`]: `// The refusal this pins is ${A_DELETED_FINDING}.md.\n`,
    });

    expect(
      check({ repositoryRoot: root }).examined,
      "a scope that reads only markdown reports every spec tree clean by never opening one",
    ).toBe(1);
  });

  it("is reported when the finding it names is gone", async () => {
    const root = await writeFixtureTree({
      [`${SPECS}/${SPEC}`]: `// The refusal this pins is ${A_DELETED_FINDING}.md.\n`,
    });

    expect(trackerCitations(root)).toStrictEqual([
      { document: `${SPECS}/${SPEC}`, name: A_DELETED_FINDING, form: "mention" },
    ]);
  });

  it("is left alone when the finding is on disk", async () => {
    const root = await writeFixtureTree({
      [`${SPECS}/${SPEC}`]: `// The refusal this pins is ${A_LIVE_FINDING}.md.\n`,
    });

    expect(trackerCitations(root)).toStrictEqual([]);
  });
});

/**
 * What each scope cites today, which is the thing one repository-wide `examined > 0` could not say.
 * The trackers and the changelogs satisfied that count between them, so `packages/cli/e2e` could
 * read nothing at all while the `it` filtering dangling citations to it asserted over an empty list
 * and passed.
 *
 * The spec scope's zero is stated rather than assumed, and it is recent: four specs cited two
 * findings an old prune had removed, and repairing them deleted the four sentences rather than
 * repointing them. The row stays because that tree is where those citations lived — and the day a
 * spec cites a finding again, this line reddens and the value moves to `cites findings`.
 */
type ScopePopulation = "cites findings" | "cites none today";

const SCOPE_POPULATIONS: Record<string, ScopePopulation> = {
  [TRACKERS]: "cites findings",
  [CHANGELOGS]: "cites findings",
  [SPECS]: "cites none today",
};

/** One scope read on its own, so no scope's silence can be covered by another's population. */
function populationOf(scope: CitationScope): ScopePopulation {
  return check({ scopes: [scope] }).examined > 0 ? "cites findings" : "cites none today";
}

describe("this repository", () => {
  const repository = check();

  it("reads each scope's own citations rather than letting one answer for all three", () => {
    const populations = Object.fromEntries(
      SCOPES.map((scope) => [scope.directory, populationOf(scope)]),
    );

    expect(
      populations,
      "a scope that read nothing reports exactly what a scope whose every citation resolves reports",
    ).toStrictEqual(SCOPE_POPULATIONS);
  });

  it("has no changelog offering a link to a finding that is gone", () => {
    expect(
      repository.dangling.filter((citation) => citation.form === "link"),
      "a release note keeps its words after the file goes; the brackets are what stop resolving",
    ).toStrictEqual([]);
  });

  it("has no tracker naming a finding that is gone", () => {
    expect(
      repository.dangling.filter((citation) => citation.document.startsWith(`${TRACKERS}/`)),
      "the twelve this scan was written for spanned six tracker and plan documents, and repairing every one retired it",
    ).toStrictEqual([]);
  });

  it("has no spec citing a finding that is gone", () => {
    expect(
      repository.dangling.filter((citation) => citation.document.startsWith(`${SPECS}/`)),
      "a spec's comment is where a reader goes for why an assertion exists, and a finding is that why — the population pinned above is what says whether this list is empty because nothing cites or because nothing was read",
    ).toStrictEqual([]);
  });
});
