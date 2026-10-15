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

/**
 * The schema every fixture directory needs, because the enum is read from it rather than restated
 * here — a second copy of the six values in this file would agree with any list it grew.
 */
const TEMPLATE = [
  "---",
  "type: anti-pattern | standard-gap | convention-drift | audit | missing-standard | architectural-drift",
  "root_cause: missing-rule | rule-not-visible | rule-not-specific-enough | convention-undocumented | enforcement-gap | scope-discipline-deferred",
  "status: open | partial | resolved | superseded",
  "---",
].join("\n");

/** The value one finding actually carried, before the enum was widened rather than the value kept. */
const INVENTED_ROOT_CAUSE = "scope-boundary-preserved";

function finding(fields: Record<string, string>): string {
  return ["---", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "---"].join(
    "\n",
  );
}

const A_FILE = "src/cli/lib/installation/local-installer.ts";
const ANOTHER_FILE = "src/cli/lib/configuration/config-writer.ts";

/** Two findings filed the same day, over the same file, for the same reason — and unlinked. */
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

/** One readable finding exactly as `writeFixtureDir` lays it down, for a test to write by hand. */
const WRITTEN_WHOLE = `${PROSE_IN_DOUBLE_QUOTES}${BODY}`;

/**
 * The same finding as a writer mid-write leaves it on disk: the fence opened, and nothing has
 * closed it yet. Not a shape anyone authors — it is what a reader sees when it opens a file
 * another process is still filling, and it parses as `NO_FRONTMATTER` exactly like a finding
 * written before the convention existed.
 */
const HALF_WRITTEN = `${WRITTEN_WHOLE.split("\n").slice(0, 2).join("\n")}\n`;

const NO_FRONTMATTER_AT_ALL = "# A finding written before the frontmatter convention\n";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

/**
 * A fixture directory is judged against itself and against nothing else. Both scans that read
 * outside the frontmatter — file resolution and symbol declaration — take a root, and leaving
 * either at its default would have a fixture assertion depend on this repository's own tree.
 */
function checkFixture(root: string, sourceRoot = root): CheckResult {
  return check({
    findingsDir: root,
    referenceRoots: [root],
    sourceRoots: [sourceRoot],
    repositoryRoot: root,
  });
}

/**
 * The registry a fixture directory carries unless the test replaces it, naming every file the test
 * wrote. Written by default because an absent INDEX is a refusal rather than an empty answer, so a
 * fixture without one would fail every assertion in this file for a reason none of them is about.
 */
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

/**
 * The second scan the frontmatter-drift audit of this directory asked for. A finding that invents
 * a value is not a defect the author saw — `scope-boundary-preserved` was defensible and the enum
 * was widened for it — but a value in neither list is invisible to every rollup that groups by
 * `root_cause`, and nothing said so.
 */
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

/**
 * The third scan the same audit asked for, over the class it named "same-day overlapping
 * findings": two files covering the same work, with nothing cross-linking them. Reported rather
 * than refused, because the tuple names a PAIR and which half is wrong is not knowable from the
 * frontmatter — a stale `affected_files`, an absent cross-link, or one filing written twice.
 */
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
 * The hazard this checker's subject has that no other one's does: `.ai-docs/agent-findings/` is
 * written by the same multi-agent sessions that run the checker, so a scan can open a finding
 * another process is halfway through writing. It reddened for exactly that on 2026-08-19 and was
 * green the moment the write completed — and **nothing was wrong, which is the defect**. A red
 * meaning "someone is typing" reads identically to a red meaning "a finding is malformed", and the
 * documented response to the second is to re-derive a pin and edit it. Editing a pin on the
 * strength of the first writes a phantom into the record permanently.
 *
 * So the scan says which it is, from EVIDENCE rather than from a guess: it fingerprints every file
 * before it reads and again after, and a file whose bytes moved in between was written under the
 * scan. A torn read cannot happen without that fingerprint moving — for a read to be torn the write
 * must still be running when the read lands, so it necessarily continues past it — which is what
 * makes the in-flight report and the parse red arrive together rather than instead of each other.
 *
 * Driven at the two halves rather than through `check`, and that is forced rather than a shortcut:
 * the state under test is a write landing BETWEEN the witness and the verify, and `check` is
 * synchronous, so there is no moment inside one call for a test to write in. Every write below is a
 * real one against a real file in the real window.
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

  /**
   * The residual the fingerprint cannot reach, measured rather than assumed: a scan of this
   * repository takes a second or two, and a writer that opens a file, writes a chunk and STALLS
   * for longer than that leaves the same bytes at the witness and at the verify. Driven against a
   * real 20-second stall on a copy of the real directory, `inFlight` came back empty over a file
   * that was plainly cut off.
   *
   * So the shape of the cut is the second signal, and it needs no timing at all: a file that opens
   * a fence and never closes it has been TRUNCATED, where a file with no fence at all was written
   * before the convention. Evidence rather than proof — a fence someone deleted reads the same —
   * but it is the difference between a message a reader recognises and one they act on.
   */
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

/**
 * The reference scan's two clauses, driven against a fixture tree that carries one real file.
 *
 * Both halves are here because the property the check states has two: a member of a YAML SEQUENCE
 * is a path whatever it looks like, and a SCALAR is a path only when it reads as one. The first
 * clause is what makes a prose sentence sitting in `affected_files:` a defect rather than a value
 * the reader skips; the second is what keeps `partial_note:` out of the scan entirely.
 */
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

/**
 * The reference scan judges only what this repository would carry, so its answer cannot depend on
 * the machine running it. Laid out like the real tree, because a climbing reference written from the
 * repository root lands back inside the repository when resolved from the package or the findings
 * directory, and escapes it only from the root it was written from.
 */
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

/**
 * The symbol scan `2026-08-19-a-partial-note-claims-a-pending-fix-and-nothing-re-derives-it-against-source`
 * asked for, and the reason its own subject went unread for four months: a `partial_note` is prose
 * about code, and no scanner can evaluate the claim — but it CAN ask whether the names it pins the
 * claim to still exist. Deliberately weaker than re-deriving the claim, and mechanical.
 */
const A_DECLARED_SYMBOL = "writeScopedFromWizard";
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

  /**
   * The scan must answer about the REPOSITORY, not about the machine.
   *
   * It walks the filesystem, so any file lying in the tree contributes names — including files
   * git ignores. Three ignored locations in this repository (a `.cache/`, a generated `.gen.mjs`
   * and an ignored scratch directory) still declared two constants deleted on 2026-08-22, so the
   * scan answered 10 locally and 12 on a clean checkout: **CI was red on this assertion from the
   * 0.157.0 push through 0.158.0 while every local run passed.** A gate whose verdict depends on
   * what a machine happens to carry trains people to disbelieve it.
   *
   * `isIgnored` is injected rather than shelled out to in the test, deliberately: proving this
   * with a real `.gitignore` would mean creating a git repository from a test, and the predicate
   * is the whole of what the scan needs to know.
   */
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

  /** The control: the same symbol, the same file, counted when the repository does carry it. */
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

/**
 * The membership scan, in ONE direction. `INDEX.md` names findings by basename, and nothing on the
 * way in looks — a finding can join the directory and be invisible to every pass that groups it.
 *
 * The reverse direction is deliberately not asserted, and that is the whole design of these cases.
 * The INDEX's own header calls a row naming a file that is gone "the record working as intended —
 * the file is gone, the judgement is not", so a scan that failed on those would fight the protocol
 * rather than enforce it, and would report the 300-odd rows the grading pass exists to keep.
 */
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

/**
 * Every dangling frontmatter reference on disk, named rather than counted, and the worklist for
 * whoever repairs them. The repair is one line per row and belongs to the `.ai-docs/` owners; this
 * pin is what makes the set a fact rather than a claim, and it reddens on the next one added as well
 * as the next one fixed.
 *
 * A reference outside the repository, or onto a path git ignores, is never judged, so it never
 * belongs here: a red listing one is the scan depending on the machine, not a pin to re-derive.
 */
const UNRESOLVED_REFERENCES_ON_DISK: UnresolvedReference[] = [];

/**
 * Every name a lifecycle note pins its claim to that nothing in the repository declares. Each is a
 * note asserting something about code, in terms of a symbol a reader cannot find, which is the
 * rename half of the class and the half a scanner can see. Re-derive the population from the diff
 * this assertion prints rather than from a count written here, which rots on the next deletion.
 *
 * `writeScopedConfigs` is deliberately NOT in this list and is the reason the scan is written the
 * weaker way: a test-local shim still declares it, so a note naming it resolves. The scan catches
 * renames, not landed fixes — re-deriving the claim itself is a reader's job, and `TEMPLATE.md`
 * binds it to the act of editing a finding at all.
 */
const UNDECLARED_SYMBOLS_ON_DISK: UndeclaredSymbol[] = [];

/**
 * Read once for the whole block rather than per assertion. The symbol scan parses every module in
 * the repository to answer what the tree declares, which is a second of work — five re-derivations
 * of one census buy nothing, since no assertion below changes what the previous one read.
 */
describe("this repository", () => {
  const repository = check();

  /**
   * FIRST, and that placement is the point: every assertion below reads a directory this session
   * may be writing into, and a red here says the inputs moved under the scan. The response is to
   * RE-RUN — never to re-derive a pin, which is what every other red in this block asks for.
   */
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

  /**
   * Asserted EMPTY rather than pinned to a named worklist, unlike the two above. Those record
   * drift nobody is repairing, so naming it is the most a scan can do; a finding with no INDEX row
   * is repaired by writing the row, which is one line and is happening. A pin would go red the day
   * the rows land and read as a regression the repair caused.
   */
  it("has no finding the INDEX names nowhere", () => {
    expect(
      repository.unlisted,
      "a finding with no row is invisible to every pass that groups this directory, and deleting it erases it entirely",
    ).toStrictEqual([]);
  });
});
