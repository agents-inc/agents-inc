import { mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  AFFECTED_FILES,
  changedSince,
  check,
  type CheckResult,
  INDEX_FILE,
  NO_FRONTMATTER,
  NO_INDEX,
  NO_ROOT_CAUSE_ENUM,
  ROOT_CAUSE_OUTSIDE_ENUM,
  TEMPLATE_FILE,
  type UndeclaredSymbol,
  UNTERMINATED_FRONTMATTER,
  type UnresolvedReference,
  witnessOf,
} from "./check-findings-frontmatter.js";
import { expectRefusal } from "./refusal-expectations.js";

const FINDING_FILE = "2026-01-01-a-finding.md";
const OTHER_FINDING_FILE = "2026-01-02-another-finding.md";
const NOT_MARKDOWN = "notes.txt";

const BODY = "\n## What Was Wrong\n\nSomething.\n";

const TEMPLATE = [
  "---",
  "type: anti-pattern | standard-gap | convention-drift | audit | missing-standard | architectural-drift",
  "root_cause: missing-rule | rule-not-visible | rule-not-specific-enough | convention-undocumented | enforcement-gap | scope-discipline-deferred",
  "status: open | partial | resolved | superseded",
  "---",
].join("\n");

const INVENTED_ROOT_CAUSE = "scope-boundary-preserved";

function finding(fields: Record<string, string>): string {
  return ["---", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "---"].join(
    "\n",
  );
}

const A_FILE = "src/cli/lib/installation/local-installer.ts";
const ANOTHER_FILE = "src/cli/lib/configuration/config-writer.ts";

function sameDayFiling(fields: Record<string, string> = {}): string {
  return [
    "---",
    "type: standard-gap",
    "status: partial",
    "root_cause: enforcement-gap",
    "date: 2026-04-21",
    "affected_files:",
    `  - ${A_FILE}`,
    ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`),
    "---",
  ].join("\n");
}

const PROSE_WITH_A_BARE_COLON = [
  "---",
  "type: anti-pattern",
  "status: resolved",
  "resolved_by: Closed today. Pending: nothing, the ratio is now 1:1.",
  "---",
].join("\n");

/** Wrapping alone is legal YAML; the colon-space on the continuation is what fails. */
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

const WRITTEN_WHOLE = `${PROSE_IN_DOUBLE_QUOTES}${BODY}`;

/** What a reader sees mid-write: the fence opened and not yet closed. */
const HALF_WRITTEN = `${WRITTEN_WHOLE.split("\n").slice(0, 2).join("\n")}\n`;

const NO_FRONTMATTER_AT_ALL = "# A finding written before the frontmatter convention\n";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

/** Every root points at the fixture, so no assertion depends on this repository's tree. */
function checkFixture(root: string, sourceRoot = root): CheckResult {
  return check({
    findingsDir: root,
    referenceRoots: [root],
    sourceRoots: [sourceRoot],
    repositoryRoot: root,
  });
}

/** Written by default: an absent INDEX is a refusal. */
function indexNaming(files: string[]): string {
  return [
    "---",
    "last_validated: 2026-01-01",
    "---",
    ...files.map((file) => `| \`${file}\` |`),
  ].join("\n");
}

function writeFindingsInto(dir: string, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });

  const withApparatus = {
    [TEMPLATE_FILE]: TEMPLATE,
    [INDEX_FILE]: indexNaming(Object.keys(files)),
    ...files,
  };

  for (const [file, content] of Object.entries(withApparatus)) {
    writeFileSync(path.join(dir, file), `${content}${content.endsWith("\n") ? "" : BODY}`);
  }
}

async function writeFixtureDir(files: Record<string, string>): Promise<string> {
  const root = await createTempDir("findings-frontmatter-");
  roots.push(root);
  writeFindingsInto(root, files);

  return root;
}

describe("a finding whose frontmatter no parser can read", () => {
  it("is reported when a prose value carries a bare colon-space, and the check is not clean", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_WITH_A_BARE_COLON });

    const { clean, verdicts } = checkFixture(root);

    expect(clean).toBe(false);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({ file: FINDING_FILE, outcome: "unreadable" });
  });

  it("is reported when a plain scalar wraps onto a second line", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_WRAPPED_WITHOUT_A_BLOCK_SCALAR });

    expect(checkFixture(root).clean).toBe(false);
  });

  it("names the file and the parser's own first line, so the fix is one edit away", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_WITH_A_BARE_COLON });

    const [verdict] = checkFixture(root).verdicts;

    expect(verdict?.outcome).toBe("unreadable");
    expect(
      verdict?.outcome === "unreadable" ? verdict.problem : "",
      "a scan that says only which file is wrong makes the reader re-derive the fault",
    ).not.toBe("");
  });

  it("is reported when the file opens with no frontmatter block", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: NO_FRONTMATTER_AT_ALL });

    expect(checkFixture(root).verdicts).toStrictEqual([
      { file: FINDING_FILE, outcome: "unreadable", problem: NO_FRONTMATTER },
    ]);
  });
});

describe("a finding whose prose is quoted or written as a block scalar", () => {
  it("is readable with the value in double quotes", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_IN_DOUBLE_QUOTES });

    expect(checkFixture(root)).toStrictEqual({
      clean: true,
      duplicates: [],
      inFlight: [],
      undeclared: [],
      unlisted: [],
      unresolved: [],
      verdicts: [{ file: FINDING_FILE, outcome: "readable" }],
    });
  });

  it("is readable with the value as a folded block scalar, colons and all", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_IN_A_BLOCK_SCALAR });

    expect(checkFixture(root).verdicts).toStrictEqual([
      { file: FINDING_FILE, outcome: "readable" },
    ]);
  });
});

describe("a finding whose root_cause is not one TEMPLATE.md offers", () => {
  it("is reported, naming the value and the enum it is outside", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: finding({ status: "open", root_cause: INVENTED_ROOT_CAUSE }),
    });

    const { clean, verdicts } = checkFixture(root);

    expect(clean).toBe(false);
    expect(verdicts).toStrictEqual([
      {
        file: FINDING_FILE,
        outcome: "unreadable",
        problem: `${ROOT_CAUSE_OUTSIDE_ENUM}: ${INVENTED_ROOT_CAUSE}`,
      },
    ]);
  });

  it("accepts every value the template offers, so widening the enum widens the scan", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: finding({ status: "open", root_cause: "scope-discipline-deferred" }),
      [OTHER_FINDING_FILE]: finding({ status: "open", root_cause: "enforcement-gap" }),
    });

    expect(checkFixture(root).clean).toBe(true);
  });

  it("leaves a file that declares no root_cause alone, which is what README.md is", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: finding({ status: "open" }) });

    expect(checkFixture(root).verdicts).toStrictEqual([
      { file: FINDING_FILE, outcome: "readable" },
    ]);
  });

  it("judges no file against TEMPLATE.md itself, whose value IS the enum", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: finding({ status: "open" }) });

    expect(
      checkFixture(root).verdicts.map((verdict) => verdict.file),
      "the template's root_cause line is six values separated by pipes, and it is the schema",
    ).toStrictEqual([FINDING_FILE]);
  });

  it("throws when TEMPLATE.md states no root_cause enum, rather than accepting every value", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: finding({ status: "open" }) });
    writeFileSync(path.join(root, TEMPLATE_FILE), "---\nstatus: open\n---\n");

    expectRefusal(() => checkFixture(root), NO_ROOT_CAUSE_ENUM);
  });
});

describe("two findings filed over the same files, cause and day", () => {
  it("reports the pair, so neither reads as the only record of its claim", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: sameDayFiling(),
      [OTHER_FINDING_FILE]: sameDayFiling(),
    });

    expect(checkFixture(root).duplicates).toStrictEqual([
      {
        files: [FINDING_FILE, OTHER_FINDING_FILE],
        rootCause: "enforcement-gap",
        date: "2026-04-21",
      },
    ]);
  });

  it("reports nothing when the two name different files", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: sameDayFiling(),
      [OTHER_FINDING_FILE]: sameDayFiling().replace(A_FILE, ANOTHER_FILE),
    });

    expect(checkFixture(root).duplicates).toStrictEqual([]);
  });

  it("reports nothing when the two differ on the day, or on the cause", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: sameDayFiling(),
      [OTHER_FINDING_FILE]: sameDayFiling().replace("2026-04-21", "2026-04-22"),
      "2026-04-21-a-third.md": sameDayFiling().replace("enforcement-gap", "missing-rule"),
    });

    expect(checkFixture(root).duplicates).toStrictEqual([]);
  });

  it("reports nothing when one of them cross-links the other, which is the lineage shape", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: sameDayFiling({ superseded_by: OTHER_FINDING_FILE }),
      [OTHER_FINDING_FILE]: sameDayFiling({ supersedes: FINDING_FILE }),
    });

    expect(
      checkFixture(root).duplicates,
      "a discovery and its fix are two valid filings once the link says which is which",
    ).toStrictEqual([]);
  });
});

describe("the scan", () => {
  it("judges every markdown file and nothing else", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: PROSE_IN_DOUBLE_QUOTES,
      [OTHER_FINDING_FILE]: PROSE_WITH_A_BARE_COLON,
      [NOT_MARKDOWN]: PROSE_WITH_A_BARE_COLON,
    });

    const { verdicts } = checkFixture(root);

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

    const { clean, verdicts } = checkFixture(root);

    expect(clean).toBe(false);
    expect(verdicts.filter((verdict) => verdict.outcome === "readable")).toHaveLength(1);
  });
});

/**
 * Driven through `witnessOf` / `changedSince` rather than `check`: `check` is synchronous, so a test
 * has no moment inside one call to write in.
 */
describe("a finding written while the scan is reading the directory", () => {
  it("is reported in flight, so a red that means someone is typing says so", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: HALF_WRITTEN });
    const witnessed = witnessOf(root, [FINDING_FILE]);

    writeFileSync(path.join(root, FINDING_FILE), WRITTEN_WHOLE);

    expect(changedSince(root, witnessed)).toStrictEqual([FINDING_FILE]);
  });

  it("reddens the parse and the in-flight report over one file, never one without the other", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: HALF_WRITTEN });
    const witnessed = witnessOf(root, [FINDING_FILE]);
    const midWrite = checkFixture(root);

    writeFileSync(path.join(root, FINDING_FILE), WRITTEN_WHOLE);

    expect(
      midWrite.verdicts,
      "the torn read is what the reader would otherwise act on",
    ).toStrictEqual([
      { file: FINDING_FILE, outcome: "unreadable", problem: UNTERMINATED_FRONTMATTER },
    ]);
    expect(
      changedSince(root, witnessed),
      "the same run has to be able to say the file moved, or the verdict above is unattributable",
    ).toStrictEqual([FINDING_FILE]);
    expect(
      checkFixture(root).clean,
      "nothing was wrong with the finding, which is the whole reason the first red must not be acted on",
    ).toBe(true);
  });

  it("watches the INDEX and the TEMPLATE too, whose writes move every finding's verdict at once", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_IN_DOUBLE_QUOTES });
    const witnessed = witnessOf(root, [INDEX_FILE, TEMPLATE_FILE, FINDING_FILE]);

    writeFileSync(path.join(root, INDEX_FILE), indexNaming([]));

    expect(
      changedSince(root, witnessed),
      "a half-written INDEX reports every finding unlisted, and a half-written TEMPLATE refuses the run",
    ).toStrictEqual([INDEX_FILE]);
  });

  it("counts a file that disappears under the scan, which is a write like any other", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_IN_DOUBLE_QUOTES });
    const witnessed = witnessOf(root, [FINDING_FILE]);

    rmSync(path.join(root, FINDING_FILE));

    expect(changedSince(root, witnessed)).toStrictEqual([FINDING_FILE]);
  });

  /** A writer stalling longer than the scan leaves identical fingerprints, so the fence shape is the signal. */
  it("names an unterminated fence apart from an absent one, which is what a cut-off file looks like", async () => {
    const truncated = await writeFixtureDir({ [FINDING_FILE]: HALF_WRITTEN });
    const preConvention = await writeFixtureDir({ [FINDING_FILE]: NO_FRONTMATTER_AT_ALL });

    expect(checkFixture(truncated).verdicts).toStrictEqual([
      { file: FINDING_FILE, outcome: "unreadable", problem: UNTERMINATED_FRONTMATTER },
    ]);
    expect(
      checkFixture(preConvention).verdicts,
      "a file with no fence at all is an authoring defect, not a file someone is still writing",
    ).toStrictEqual([{ file: FINDING_FILE, outcome: "unreadable", problem: NO_FRONTMATTER }]);
  });

  it("reports nothing in flight for a directory nothing is writing into", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: PROSE_IN_DOUBLE_QUOTES });

    expect(
      checkFixture(root).inFlight,
      "a settled directory must answer empty, or the report says nothing by saying it about everything",
    ).toStrictEqual([]);
  });
});

const A_REAL_FILE = "src/cli/lib/exit-codes.ts";
const A_DELETED_FILE = "src/cli/lib/stacks/stack-installer.ts";

function findingWithFileList(key: string, values: string[]): string {
  return [
    "---",
    "type: standard-gap",
    "status: open",
    `${key}:`,
    ...values.map((value) => `  - ${value}`),
    "---",
  ].join("\n");
}

async function writeReferenceFixture(files: Record<string, string>): Promise<string> {
  const root = await writeFixtureDir(files);
  mkdirSync(path.join(root, path.dirname(A_REAL_FILE)), { recursive: true });
  writeFileSync(path.join(root, A_REAL_FILE), "export const EXIT_CODES = {};\n");

  return root;
}

describe("a frontmatter value that names a file", () => {
  it("is reported when a file list names a path that is not on disk", async () => {
    const root = await writeReferenceFixture({
      [FINDING_FILE]: findingWithFileList(AFFECTED_FILES, [A_REAL_FILE, A_DELETED_FILE]),
    });

    expect(checkFixture(root).unresolved).toStrictEqual([
      { file: FINDING_FILE, key: AFFECTED_FILES, value: A_DELETED_FILE },
    ]);
  });

  it("resolves a bare basename beside the finding, which is the cross-link shape", async () => {
    const root = await writeReferenceFixture({
      [FINDING_FILE]: finding({ status: "superseded", superseded_by: OTHER_FINDING_FILE }),
      [OTHER_FINDING_FILE]: finding({ status: "open" }),
    });

    expect(checkFixture(root).unresolved).toStrictEqual([]);
  });

  it("reports a cross-link whose target is gone, under whatever key carries it", async () => {
    const root = await writeReferenceFixture({
      [FINDING_FILE]: finding({ status: "open", blocked_by: OTHER_FINDING_FILE }),
    });

    expect(
      checkFixture(root).unresolved,
      "the scan names no keys, so a key added to TEMPLATE.md tomorrow is covered today",
    ).toStrictEqual([{ file: FINDING_FILE, key: "blocked_by", value: OTHER_FINDING_FILE }]);
  });

  it("reports a file list entry that is prose rather than a path", async () => {
    const summary = "plus ~20 more test files";
    const root = await writeReferenceFixture({
      [FINDING_FILE]: findingWithFileList(AFFECTED_FILES, [A_REAL_FILE, summary]),
    });

    expect(
      checkFixture(root).unresolved,
      "TEMPLATE.md rule 6 makes this list the grep's output pasted, so a reading of it is a defect",
    ).toStrictEqual([{ file: FINDING_FILE, key: AFFECTED_FILES, value: summary }]);
  });

  it("leaves a prose scalar alone even when it quotes a path inside a sentence", async () => {
    const root = await writeReferenceFixture({
      [FINDING_FILE]: finding({
        status: "partial",
        partial_note: '"The fix landed in src/cli/lib/nowhere.ts and nothing else."',
      }),
    });

    expect(
      checkFixture(root).unresolved,
      "a sentence is not a path, and judging one would report every note in the directory",
    ).toStrictEqual([]);
  });
});

/** Laid out like the real tree: a climb out of the repository only escapes from the root it was written from. */
const SIBLING_REPOSITORY_FILE = "../skills/src/skills/web-state-zustand/examples/core.md";
const GENERATED_FILE = "e2e/helpers/handrun.gen.mjs";

type Workspace = { repository: string; packageRoot: string; findingsDir: string };

async function writeWorkspaceFixture(files: Record<string, string>): Promise<Workspace> {
  const machine = await createTempDir("findings-workspace-");
  roots.push(machine);
  const repository = path.join(machine, "cli");
  const packageRoot = path.join(repository, "packages", "cli");
  const findingsDir = path.join(packageRoot, ".ai-docs", "agent-findings");
  writeFindingsInto(findingsDir, files);

  return { repository, packageRoot, findingsDir };
}

function checkWorkspace(
  { repository, packageRoot, findingsDir }: Workspace,
  isIgnored: (file: string) => boolean,
): CheckResult {
  return check({
    findingsDir,
    referenceRoots: [packageRoot, repository],
    sourceRoots: [findingsDir],
    repositoryRoot: repository,
    isIgnored,
  });
}

function gitIgnoresOnly(file: string): (candidate: string) => boolean {
  return (candidate) => candidate === file;
}

function writeEmptyFile(file: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "");
}

describe("a frontmatter value naming a path this repository does not carry", () => {
  it("is not reported when it climbs out of the repository to a file that is absent", async () => {
    const workspace = await writeWorkspaceFixture({
      [FINDING_FILE]: findingWithFileList(AFFECTED_FILES, [SIBLING_REPOSITORY_FILE]),
    });

    expect(
      checkWorkspace(workspace, () => false).unresolved,
      "a sibling checkout CI never clones is not this repository's to judge",
    ).toStrictEqual([]);
  });

  it("is not reported when the file outside the repository is present either", async () => {
    const workspace = await writeWorkspaceFixture({
      [FINDING_FILE]: findingWithFileList(AFFECTED_FILES, [SIBLING_REPOSITORY_FILE]),
    });
    writeEmptyFile(path.join(workspace.repository, SIBLING_REPOSITORY_FILE));

    expect(
      checkWorkspace(workspace, () => false).unresolved,
      "the machine carrying the sibling checkout must get the answer CI gets",
    ).toStrictEqual([]);
  });

  it("is not reported when git ignores the path it names and nothing has generated it", async () => {
    const workspace = await writeWorkspaceFixture({
      [FINDING_FILE]: findingWithFileList(AFFECTED_FILES, [GENERATED_FILE]),
    });

    expect(
      checkWorkspace(workspace, gitIgnoresOnly(path.join(workspace.packageRoot, GENERATED_FILE)))
        .unresolved,
      "an ignored file exists only where someone generated it, so its absence is not a defect",
    ).toStrictEqual([]);
  });

  it("is still reported when it names an absent path inside the repository that git would carry", async () => {
    const workspace = await writeWorkspaceFixture({
      [FINDING_FILE]: findingWithFileList(AFFECTED_FILES, [A_DELETED_FILE]),
    });

    expect(
      checkWorkspace(workspace, gitIgnoresOnly(path.join(workspace.packageRoot, GENERATED_FILE)))
        .unresolved,
    ).toStrictEqual([{ file: FINDING_FILE, key: AFFECTED_FILES, value: A_DELETED_FILE }]);
  });

  it("is still reported when it is an absolute path, which names a machine rather than a repository", async () => {
    const workspace = await writeWorkspaceFixture({});
    const outsideTheRepository = path.join(path.dirname(workspace.repository), "notes.md");
    writeFindingsInto(workspace.findingsDir, {
      [FINDING_FILE]: findingWithFileList(AFFECTED_FILES, [outsideTheRepository]),
    });

    expect(
      checkWorkspace(workspace, () => false).unresolved,
      "a leading slash is read from each root rather than as a climb out of the repository",
    ).toStrictEqual([{ file: FINDING_FILE, key: AFFECTED_FILES, value: outsideTheRepository }]);
  });

  it("skips one reference at a time, so the same finding still reports its absent in-repository path", async () => {
    const workspace = await writeWorkspaceFixture({
      [FINDING_FILE]: findingWithFileList(AFFECTED_FILES, [
        SIBLING_REPOSITORY_FILE,
        GENERATED_FILE,
        A_DELETED_FILE,
      ]),
    });

    expect(
      checkWorkspace(workspace, gitIgnoresOnly(path.join(workspace.packageRoot, GENERATED_FILE)))
        .unresolved,
    ).toStrictEqual([{ file: FINDING_FILE, key: AFFECTED_FILES, value: A_DELETED_FILE }]);
  });
});

const A_DECLARED_SYMBOL = "writeConfigByScope";
const A_DELETED_SYMBOL = "writeScopedConfigs";

async function writeSymbolFixture(files: Record<string, string>): Promise<string> {
  const root = await writeFixtureDir(files);
  const sourceRoot = path.join(root, "source");
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(
    path.join(sourceRoot, "config-writer.ts"),
    `export function ${A_DECLARED_SYMBOL}(): void {}\n`,
  );

  return root;
}

describe("a backticked symbol inside a lifecycle note", () => {
  it("is reported when the tree declares no such name", async () => {
    const root = await writeSymbolFixture({
      [FINDING_FILE]: finding({
        status: "partial",
        partial_note: `"Option A at the \`${A_DELETED_SYMBOL}\` call sites is pending."`,
      }),
    });

    expect(checkFixture(root, path.join(root, "source")).undeclared).toStrictEqual([
      { file: FINDING_FILE, key: "partial_note", symbol: A_DELETED_SYMBOL },
    ]);
  });

  it("is left alone when the tree declares it, wherever in the tree that is", async () => {
    const root = await writeSymbolFixture({
      [FINDING_FILE]: finding({
        status: "partial",
        partial_note: `"Option A at the \`${A_DECLARED_SYMBOL}\` call sites is pending."`,
      }),
    });

    expect(checkFixture(root, path.join(root, "source")).undeclared).toStrictEqual([]);
  });

  /** A git-ignored file must not declare names, or the verdict depends on the machine. */
  it("ignores a name declared only in a file the repository does not carry", async () => {
    const root = await writeSymbolFixture({
      [FINDING_FILE]: finding({
        status: "partial",
        partial_note: `"Option A at the \`${A_DECLARED_SYMBOL}\` call sites is pending."`,
      }),
    });
    const sourceRoot = path.join(root, "source");
    const debris = path.join(sourceRoot, "config-writer.ts");

    const asRepository = check({
      findingsDir: root,
      referenceRoots: [root],
      sourceRoots: [sourceRoot],
      isIgnored: (file) => file === debris,
    });

    expect(
      asRepository.undeclared,
      "the only file declaring it is one git ignores, so the repository declares it nowhere",
    ).toStrictEqual([{ file: FINDING_FILE, key: "partial_note", symbol: A_DECLARED_SYMBOL }]);
  });

  it("counts a name from a file the repository does carry", async () => {
    const root = await writeSymbolFixture({
      [FINDING_FILE]: finding({
        status: "partial",
        partial_note: `"Option A at the \`${A_DECLARED_SYMBOL}\` call sites is pending."`,
      }),
    });

    const asRepository = check({
      findingsDir: root,
      referenceRoots: [root],
      sourceRoots: [path.join(root, "source")],
      isIgnored: () => false,
    });

    expect(asRepository.undeclared).toStrictEqual([]);
  });

  it("reads a backticked span only when the whole span is one identifier", async () => {
    const root = await writeSymbolFixture({
      [FINDING_FILE]: finding({
        status: "resolved",
        resolved_by:
          '"Quoted from source: `status: superseded`, and `--verbose` was never a name."',
      }),
    });

    expect(
      checkFixture(root, path.join(root, "source")).undeclared,
      "a quoted YAML line and a CLI flag are backticked prose, not claims about a symbol",
    ).toStrictEqual([]);
  });
});

/** One direction only: an INDEX row naming a deleted finding is the record working as intended. */
const FINDING_NAME = FINDING_FILE.replace(/\.md$/, "");
const A_DELETED_FINDING = "2026-01-03-a-finding-that-has-been-deleted";
const README = "README.md";

describe("a finding the INDEX names nowhere", () => {
  it("is reported, so a filing cannot join the directory invisibly", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: finding({ status: "open" }),
      [INDEX_FILE]: indexNaming([]),
    });

    expect(
      checkFixture(root).unlisted,
      "a finding with no row is skipped by every rollup that groups this directory",
    ).toStrictEqual([FINDING_FILE]);
  });

  it("is satisfied by a row naming it with the .md suffix, or without it", async () => {
    const withSuffix = await writeFixtureDir({
      [FINDING_FILE]: finding({ status: "open" }),
      [INDEX_FILE]: indexNaming([FINDING_FILE]),
    });
    const withoutSuffix = await writeFixtureDir({
      [FINDING_FILE]: finding({ status: "open" }),
      [INDEX_FILE]: indexNaming([FINDING_NAME]),
    });

    expect(checkFixture(withSuffix).unlisted).toStrictEqual([]);
    expect(
      checkFixture(withoutSuffix).unlisted,
      "the INDEX writes 418 of its rows bare and 9 with the suffix, so both are how it names one",
    ).toStrictEqual([]);
  });

  it("leaves a row naming a file that is gone alone, which is the record working as intended", async () => {
    const root = await writeFixtureDir({
      [FINDING_FILE]: finding({ status: "open" }),
      [INDEX_FILE]: indexNaming([FINDING_NAME, A_DELETED_FINDING]),
    });

    expect(
      checkFixture(root).unlisted,
      "the INDEX keeps the judgement after the file goes, so the other direction is not a defect",
    ).toStrictEqual([]);
  });

  it("asks for no row for the directory's own apparatus, which files no claim", async () => {
    const root = await writeFixtureDir({
      [README]: "# How this directory works\n",
      [INDEX_FILE]: indexNaming([]),
    });

    expect(
      checkFixture(root).unlisted,
      "README.md, INDEX.md and TEMPLATE.md carry the apparatus rather than a finding",
    ).toStrictEqual([]);
  });

  it("throws when the directory holds no INDEX at all, rather than reporting every finding", async () => {
    const root = await writeFixtureDir({ [FINDING_FILE]: finding({ status: "open" }) });
    rmSync(path.join(root, INDEX_FILE));

    expectRefusal(() => checkFixture(root), NO_INDEX);
  });
});

/** Named, not counted. References outside the repository or git-ignored are never judged, so never belong here. */
const UNRESOLVED_REFERENCES_ON_DISK: UnresolvedReference[] = [];

/** Re-derive from the diff this assertion prints, not from a count. */
const UNDECLARED_SYMBOLS_ON_DISK: UndeclaredSymbol[] = [];

/** Read once: the symbol scan parses every module in the repository. */
describe("this repository", () => {
  const repository = check();

  /** First: a red here means re-run, never re-derive a pin. */
  it("was not written into while this scan read it", () => {
    expect(
      repository.inFlight,
      "a file moved under this scan, so every assertion below it is provisional — re-run before believing one, and never edit a pin on the strength of a red sitting beside this",
    ).toStrictEqual([]);
  });

  it("has no finding whose frontmatter a parser cannot read", () => {
    expect(repository.verdicts.length, "the scan must have something to scan").toBeGreaterThan(0);
    expect(
      repository.verdicts.filter((verdict) => verdict.outcome === "unreadable"),
      "every status rollup and link scan over this directory is defined on parsed frontmatter — an unreadable file is skipped by all of them silently",
    ).toStrictEqual([]);
    expect(repository.clean).toBe(true);
  });

  it("has no finding whose root_cause is outside the enum TEMPLATE.md states", () => {
    expect(
      repository.verdicts.filter(
        (verdict) =>
          verdict.outcome === "unreadable" && verdict.problem.startsWith(ROOT_CAUSE_OUTSIDE_ENUM),
      ),
      "a value in neither list is invisible to every rollup that groups by root_cause",
    ).toStrictEqual([]);
  });

  it("has no piece of work filed twice over the same files, cause and day", () => {
    expect(
      repository.duplicates,
      "the pair this scan was written for was two stale file lists, and repairing both retired it",
    ).toStrictEqual([]);
  });

  it("holds its dangling frontmatter references to the ones already reported", () => {
    expect(repository.unresolved).toStrictEqual(UNRESOLVED_REFERENCES_ON_DISK);
  });

  it("holds its undeclared lifecycle symbols to the ones already reported", () => {
    expect(repository.undeclared).toStrictEqual(UNDECLARED_SYMBOLS_ON_DISK);
  });

  /** Empty rather than pinned: a missing row is repaired by writing it. */
  it("has no finding the INDEX names nowhere", () => {
    expect(
      repository.unlisted,
      "a finding with no row is invisible to every pass that groups this directory, and deleting it erases it entirely",
    ).toStrictEqual([]);
  });
});
