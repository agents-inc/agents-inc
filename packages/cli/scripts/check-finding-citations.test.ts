import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import { BINDING_DOCUMENTS, BRIEFING_CONTRACT } from "./check-briefing-contract.js";
import {
  AGENT_FINDINGS,
  check,
  type Citation,
  type CitationScope,
  CHANGELOGS,
  FINDING_DIRECTORIES,
  NO_FINDING_DIRECTORY,
  NO_PLAN_DIRECTORY,
  NO_SCOPE_DIRECTORY,
  PLANS,
  SCOPES,
  SPECS,
  TRACKERS,
} from "./check-finding-citations.js";
import { expectRefusal } from "./refusal-expectations.js";

const A_LIVE_FINDING = "2026-08-19-a-finding-that-is-still-on-disk";
const A_DELETED_FINDING = "2026-08-19-a-finding-a-batch-removed";

const A_PLAN = "2026-08-19-a-plan-named-date-first";
const A_PLAN_NOBODY_WROTE = "2026-08-19-a-plan-nobody-ever-wrote";

const TRACKER = "cli.md";
const RELEASE_NOTE = "0.99.0.md";

const SPEC = "lifecycle/a-journey.e2e.test.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixtureTree(documents: Record<string, string>): Promise<string> {
  const root = await createTempDir("finding-citations-");
  roots.push(root);

  for (const directory of [...FINDING_DIRECTORIES, TRACKERS, PLANS, CHANGELOGS, SPECS]) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  writeFileSync(path.join(root, AGENT_FINDINGS, `${A_LIVE_FINDING}.md`), "# on disk\n");

  for (const [document, text] of Object.entries(documents)) {
    const documentPath = path.join(root, document);
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

describe("a tracker naming a dated plan", () => {
  it("says nothing when the name is a plan document on disk", async () => {
    const root = await writeFixtureTree({
      [`${PLANS}/${A_PLAN}.md`]: "# a plan\n",
      [`${TRACKERS}/${TRACKER}`]: `The detail is in [\`${A_PLAN}.md\`](./plans/${A_PLAN}.md).\n`,
    });

    expect(
      trackerCitations(root),
      "a plan named date-first is a plan, and reporting it names a finding that never existed",
    ).toStrictEqual([]);
  });

  it("says nothing when the name is a plan's lane folder on disk", async () => {
    const root = await writeFixtureTree({
      [`${PLANS}/${A_PLAN}/a-lane.md`]: "# one lane's evidence\n",
      [`${TRACKERS}/${TRACKER}`]: `One lane is in [a-lane.md](./plans/${A_PLAN}/a-lane.md).\n`,
    });

    expect(
      trackerCitations(root),
      "a folder carries the plan's name as surely as a document does",
    ).toStrictEqual([]);
  });

  it("still reports a dated name that nothing on disk carries, though its link points into the plans", async () => {
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `The detail is in [the plan](./plans/${A_PLAN_NOBODY_WROTE}.md).\n`,
    });

    expect(
      trackerCitations(root),
      "a plan is recognised by being on disk, so a path into the plans is no licence for a name that resolves to nothing",
    ).toStrictEqual([
      { document: `${TRACKERS}/${TRACKER}`, name: A_PLAN_NOBODY_WROTE, form: "link" },
    ]);
  });
});

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

    expectRefusal(
      () => check({ repositoryRoot: root }),
      NO_SCOPE_DIRECTORY,
      "a scope that quietly reads no documents reads exactly like a scope that passed",
    );
  });

  it("refuses a finding directory that is not there, rather than resolving nothing", async () => {
    const root = await writeFixtureTree({
      [`${TRACKERS}/${TRACKER}`]: `See \`${A_LIVE_FINDING}.md\`.\n`,
    });
    rmSync(path.join(root, AGENT_FINDINGS), { recursive: true });

    expectRefusal(
      () => check({ repositoryRoot: root }),
      NO_FINDING_DIRECTORY,
      "a resolution set missing its directory calls every citation dangling",
    );
  });

  it("refuses a plan directory that is not there, rather than calling every plan a gone finding", async () => {
    const root = await writeFixtureTree({});
    rmSync(path.join(root, PLANS), { recursive: true });

    expectRefusal(
      () => check({ repositoryRoot: root }),
      NO_PLAN_DIRECTORY,
      "a dated plan read against no plans is reported as a finding that is gone, which names the wrong thing",
    );
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

/** Each scope's population on its own; a spec-tree change here follows the citation, not the other way round. */
type ScopePopulation = "cites findings" | "cites none today";

const SCOPE_POPULATIONS: Record<string, ScopePopulation> = {
  [TRACKERS]: "cites findings",
  [CHANGELOGS]: "cites findings",
  [SPECS]: "cites none today",
};

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

/** `todo/` is outside every workspace, so the test task must hash it or a cached pass replays. */
const TURBO_CONFIG = "turbo.json";

const THIS_PACKAGE = "packages/cli/";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY_ROOT = path.resolve(PACKAGE_ROOT, "../..");

const turboConfigSchema = z.object({
  tasks: z.object({ test: z.object({ inputs: z.array(z.string()).optional() }) }),
});

function everyTreeTheGatesRead(): string[] {
  return [
    ...SCOPES.map((scope) => scope.directory),
    ...FINDING_DIRECTORIES,
    ...BINDING_DOCUMENTS,
    BRIEFING_CONTRACT,
  ];
}

function isOutsideThisPackage(repositoryPath: string): boolean {
  return !repositoryPath.startsWith(THIS_PACKAGE);
}

function turboInputFor(repositoryPath: string): string {
  const fromPackage = `../../${repositoryPath}`;
  return statSync(path.join(REPOSITORY_ROOT, repositoryPath)).isDirectory()
    ? `${fromPackage}/**`
    : fromPackage;
}

/** Parsed, not grepped: a comment mentioning an entry would satisfy a text search. */
function declaredTestInputs(): string[] {
  const configPath = path.join(PACKAGE_ROOT, TURBO_CONFIG);
  const { config, error } = ts.parseConfigFileTextToJson(
    configPath,
    readFileSync(configPath, "utf-8"),
  );
  if (error !== undefined) {
    throw new Error(
      `${TURBO_CONFIG} does not parse: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`,
    );
  }

  const parsed: unknown = config;
  return turboConfigSchema.parse(parsed).tasks.test.inputs ?? [];
}

function unhashedTreesTheGatesRead(): string[] {
  const declared = new Set(declaredTestInputs());

  const required = [...new Set(everyTreeTheGatesRead().filter(isOutsideThisPackage))]
    .map(turboInputFor)
    .sort();

  return required.filter((input) => !declared.has(input));
}

describe("the task that runs these scans", () => {
  it("reads gates that reach outside this package, so the derivation has a subject", () => {
    expect(
      everyTreeTheGatesRead().filter(isOutsideThisPackage).length,
      "with nothing outside the package the assertion below passes for free, and would keep passing after a scope row moved out of it",
    ).toBeGreaterThan(0);
  });

  it("hashes every tree they read, so a change confined to one cannot replay a cached pass", () => {
    expect(
      unhashedTreesTheGatesRead(),
      "turbo's default inputs stop at the package boundary, so a gate reading `todo/` or the root CLAUDE.md is answered from cache about a tree it never opened",
    ).toStrictEqual([]);
  });
});
