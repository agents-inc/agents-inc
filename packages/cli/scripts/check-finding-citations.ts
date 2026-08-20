/**
 * Every finding named from outside `.ai-docs/` is a finding that still exists.
 *
 * It exists because every check guarding a findings citation was scoped to `.ai-docs/`. The
 * frontmatter scan reads `agent-findings/`. The reference scan beside it reads that directory's
 * own frontmatter. **`todo/` cites findings by basename too, and nothing looked there** — twelve
 * citations across six tracker and plan documents pointed at files a deletion batch had removed,
 * one of them inside the very row recording the previous batch's dangling citations.
 *
 * **What a past brief covered is not what this file reaches, and saying so here once hid a gap for
 * a fortnight.** The paragraph above used to add that the by-hand grep the deletion protocol
 * mandates "was briefed on `.ai-docs/`, `src/`, `e2e/` and `scripts/`" — true of the protocol, and
 * read by anyone checking whether `e2e/` was covered as though it were true of the checker. Two
 * specs cited a finding deleted in an old prune for exactly as long as that sentence stood. So
 * this docblock describes the {@link SCOPES} below and nothing else; the protocol's own reach
 * belongs in the protocol.
 *
 * **A dangling citation costs a tracker more than it costs a reference document.** In a reference
 * document it costs a reader one failed lookup. In a tracker row it costs the row its evidence: the
 * row survives, still reading as actionable, with the thing that justified it gone. One parked item
 * argues its whole case from a sibling finding that is not on disk, and reads exactly as it did
 * when the pointer resolved.
 *
 * **`changelogs/` is in scope for links and nothing else, which is `INDEX.md`'s ruling written
 * out.** A release note naming a finding records what that release closed — a dated statement about
 * a past version that stays true after the file goes, and rewriting one would falsify the record of
 * what the release said. A LINK is the exception, added 2026-08-19: keeping the words costs nothing
 * and preserves the record, while keeping the brackets offers a reader a pointer that resolves to
 * nothing. Twenty-seven such links across six changelogs were de-linked on that ruling.
 *
 * **The name is the unit, not the directory.** Any tracked file may cite a finding by basename, so
 * a scope is a row here rather than a second checker, and the three directories below are what is
 * covered TODAY rather than what could be. `.ai-docs/` is deliberately absent and is not an
 * oversight: `agent-findings/INDEX.md` names deleted findings on purpose — a row naming a file not
 * on disk is the only surviving record that the finding existed — so a scan over that tree reports
 * its own archive as the defect.
 *
 * **`src/` and `scripts/` are absent for a different reason, and a whole-tree row for either could
 * not go green.** Both hold names that are finding-shaped and are MEANT not to resolve, so the scan
 * cannot tell them from a citation and would report correct prose as the defect: the fixtures in
 * `check-finding-citations.test.ts` and `check-findings-frontmatter.test.ts` fabricate names to
 * drive the very scans that judge them, and `src/agents/meta/convention-keeper/output.md` carries
 * three inside an example block showing an agent what to write. A census of both trees on
 * 2026-08-19 found one real citation between them, in
 * `src/cli/lib/configuration/config-generator.test.ts`, and it resolves. Covering them needs a way
 * to mark a name as an example first; a row added before that is a row someone silences.
 *
 * Nothing runs at module scope — the suite beside it is the enforcement, as with
 * `check-findings-frontmatter.ts` and `check-enumeration-drift.ts`, and the repository root is a
 * parameter so it can be driven against a fixture.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

/** Where the check reads from when no other root is given. */
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

const MARKDOWN_EXTENSION = ".md";

export const TRACKERS = "todo";
export const CHANGELOGS = "packages/cli/changelogs";
export const SPECS = "packages/cli/e2e";

export const AGENT_FINDINGS = "packages/cli/.ai-docs/agent-findings";
export const AGENT_SUGGESTIONS = "packages/cli/.ai-docs/agent-suggestions";

/**
 * Both directories a cited name may resolve in. A suggestion is dated and named exactly like a
 * finding, so a scan reading only `agent-findings/` calls every citation of one dangling — which is
 * two of the fifteen the census first reported.
 */
export const FINDING_DIRECTORIES = [AGENT_FINDINGS, AGENT_SUGGESTIONS];

export const NO_SCOPE_DIRECTORY = "names a scope directory that does not exist";
export const NO_FINDING_DIRECTORY = "names a finding directory that does not exist";

/** Whether a citation is a pointer a reader can follow or a name standing in prose. */
export type CitationForm = "link" | "mention";

export type Citation = { document: string; name: string; form: CitationForm };

/**
 * A tree of documents that cite findings, and which forms of citation must resolve there.
 *
 * `every-citation` is the ordinary rule. `links-only` is the changelog carve-out: the prose stays
 * whatever happens to the file, and only the brackets have to keep their promise.
 */
export type CitationScope = { directory: string; refuses: "every-citation" | "links-only" };

/**
 * `examined` is how many citations the scan actually resolved, dangling or not, and it exists
 * because `dangling: []` is the same answer whether every citation resolved or the scan read
 * nothing at all. A caller asserting emptiness has to be able to tell those apart: the scope guard
 * below refuses a directory that is ABSENT, and a directory that is present, empty, full of
 * documents citing nothing, or read by an extraction that has stopped matching all pass it and all
 * report zero. Counting citations rather than documents is deliberate — it is the last step before
 * the dangling filter, so it is the only count a broken {@link FINDING_NAME} can falsify.
 */
export type CheckResult = { clean: boolean; examined: number; dangling: Citation[] };

export const SCOPES: CitationScope[] = [
  { directory: TRACKERS, refuses: "every-citation" },
  { directory: CHANGELOGS, refuses: "links-only" },
  { directory: SPECS, refuses: "every-citation" },
];

export function check({
  repositoryRoot = REPOSITORY_ROOT,
  scopes = SCOPES,
  findingDirectories = FINDING_DIRECTORIES,
}: {
  repositoryRoot?: string | undefined;
  scopes?: CitationScope[] | undefined;
  findingDirectories?: string[] | undefined;
} = {}): CheckResult {
  const onDisk = findingsOnDisk(repositoryRoot, findingDirectories);
  const examined = scopes.flatMap((scope) => citationsUnder(repositoryRoot, scope));
  const dangling = examined.filter((scoped) => isDangling(scoped, onDisk));

  return {
    clean: dangling.length === 0,
    examined: examined.length,
    dangling: dangling.map((scoped) => scoped.citation),
  };
}

/**
 * Every name a citation may resolve to, without its extension, which is how prose writes it. A
 * directory that is not there is refused rather than read as empty — a resolution set missing one
 * of its halves calls every citation of that half dangling.
 */
function findingsOnDisk(repositoryRoot: string, directories: string[]): Set<string> {
  return new Set(
    directories.flatMap((directory) => {
      const directoryPath = path.join(repositoryRoot, directory);
      if (!existsSync(directoryPath)) throw refusal(NO_FINDING_DIRECTORY, directory);

      return readdirSync(directoryPath)
        .filter((entry) => entry.endsWith(MARKDOWN_EXTENSION))
        .map(withoutExtension);
    }),
  );
}

/** A citation paired with the rule its scope applies, which judging it needs and reporting it does not. */
type ScopedCitation = { citation: Citation; scope: CitationScope };

/** Every citation a scope makes, before any judgement — the population `examined` counts. */
function citationsUnder(repositoryRoot: string, scope: CitationScope): ScopedCitation[] {
  const scopePath = path.join(repositoryRoot, scope.directory);
  if (!existsSync(scopePath)) throw refusal(NO_SCOPE_DIRECTORY, scope.directory);

  return citingFilesUnder(scopePath).flatMap((document) =>
    citationsIn(readFileSync(path.join(scopePath, document), "utf-8")).map((cited) => ({
      citation: { document: `${scope.directory}/${document}`, ...cited },
      scope,
    })),
  );
}

function isDangling({ citation, scope }: ScopedCitation, onDisk: Set<string>): boolean {
  return !onDisk.has(citation.name) && isRefused(scope, citation.form);
}

function isRefused(scope: CitationScope, form: CitationForm): boolean {
  return scope.refuses === "every-citation" || form === "link";
}

/**
 * What a citation can be written in — prose and code alike, because the NAME is the unit and a
 * reader who greps one does not know or care which they land in. Stated here rather than per scope:
 * a scope declaring its own extensions can under-declare them, and a scope that reads none of the
 * files it walks reports a clean tree without ever opening one. That is the failure this list was
 * widened for — `e2e/` holds 274 specs and no markdown at all, so a markdown-only reader answered
 * for it in silence.
 */
const CITING_EXTENSIONS = [MARKDOWN_EXTENSION, ".ts", ".tsx", ".mjs"];

/** Every file under a scope that could carry a citation, deepest last, as paths relative to it. */
function citingFilesUnder(directoryPath: string, prefix = ""): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      return citingFilesUnder(path.join(directoryPath, entry.name), relativePath);
    }

    return CITING_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
      ? [relativePath]
      : [];
  });
}

/**
 * A finding basename: a date, then a slug long enough that no ordinary hyphenated phrase reaches
 * it. The lookbehind is what stops a date INSIDE a longer filename reading as a citation —
 * `custom-skills-2026-08-06-investigation.md` is a plan, and a `\b` anchor matches after its
 * hyphen and reports the tail of its own name.
 */
const FINDING_NAME = /(?<![\w-])(20\d{2}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{10,})/g;

/** A markdown link, whose whole span — label and target alike — is a pointer a reader follows. */
const MARKDOWN_LINK = /\[[^\]]*\]\([^)]*\)/g;

/**
 * Every citation a document makes, one per repair site.
 *
 * A name written twice in prose is two edits and reports twice. A link is ONE edit however many
 * times it spells the name, and the usual form spells it in both halves — `` [`<name>.md`](<path to
 * the same file>) `` — so the two occurrences inside one span collapse to the pointer they are.
 */
type CitedName = { name: string; form: CitationForm };

function citationsIn(text: string): CitedName[] {
  const linkSpans = [...text.matchAll(MARKDOWN_LINK)].map(spanOf);
  const seenInLink = new Set<string>();

  return [...text.matchAll(FINDING_NAME)].flatMap((match): CitedName[] => {
    const name = citedName(match[1] ?? "");
    if (name === "") return [];

    const enclosing = linkSpans.findIndex((span) => encloses(span, match.index));
    if (enclosing === -1) return [{ name, form: "mention" }];

    const site = `${String(enclosing)} ${name}`;
    if (seenInLink.has(site)) return [];
    seenInLink.add(site);

    return [{ name, form: "link" }];
  });
}

function spanOf(match: RegExpExecArray): { from: number; to: number } {
  return { from: match.index, to: match.index + match[0].length };
}

function encloses(span: { from: number; to: number }, index: number): boolean {
  return index >= span.from && index < span.to;
}

/**
 * The name a citation asserts exists: its extension dropped, and any trailing hyphen with it. A
 * tracker abbreviates a long finding as `<prefix>-…`, and the hyphen belongs to the ellipsis rather
 * than to any filename — an abbreviation is still a claim that the file is there.
 */
function citedName(matched: string): string {
  return withoutExtension(matched).replace(/-+$/, "");
}

function withoutExtension(name: string): string {
  return name.endsWith(MARKDOWN_EXTENSION) ? name.slice(0, -MARKDOWN_EXTENSION.length) : name;
}

/** Named so the scope to repair is the one the failure prints, rather than a fault with no address. */
function refusal(problem: string, subject: string): Error {
  return new Error(`${problem}: ${subject}`);
}
