/**
 * Every finding cited from {@link SCOPES} still exists. `.ai-docs/` is out of scope because its
 * INDEX names deleted findings on purpose; `src/` and `scripts/` because their fixtures fabricate
 * finding-shaped names. Changelogs refuse dangling links only, since their prose is a historical
 * record.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

const MARKDOWN_EXTENSION = ".md";

export const TRACKERS = "todo";
export const CHANGELOGS = "packages/cli/changelogs";
export const SPECS = "packages/cli/e2e";

export const AGENT_FINDINGS = "packages/cli/.ai-docs/agent-findings";

export const FINDING_DIRECTORIES = [AGENT_FINDINGS];

/** Plans are named date-first, so a plan's name has a finding's shape; only the disk tells them apart. */
export const PLANS = `${TRACKERS}/plans`;

export const NO_SCOPE_DIRECTORY = "names a scope directory that does not exist";
export const NO_FINDING_DIRECTORY = "names a finding directory that does not exist";
export const NO_PLAN_DIRECTORY = "names a plan directory that does not exist";

export type CitationForm = "link" | "mention";

export type Citation = { document: string; name: string; form: CitationForm };

export type CitationScope = { directory: string; refuses: "every-citation" | "links-only" };

/** `examined` tells a clean tree from one the scan read nothing in; both report `dangling: []`. */
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
  const examined = scopes.flatMap((scope) => citationsUnder(repositoryRoot, scope));
  const onDisk = new Set([
    ...findingsOnDisk(repositoryRoot, findingDirectories),
    ...plansOnDisk(repositoryRoot),
  ]);
  const dangling = examined.filter((scoped) => isDangling(scoped, onDisk));

  return {
    clean: dangling.length === 0,
    examined: examined.length,
    dangling: dangling.map((scoped) => scoped.citation),
  };
}

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

function plansOnDisk(repositoryRoot: string): string[] {
  const plansPath = path.join(repositoryRoot, PLANS);
  if (!existsSync(plansPath)) throw refusal(NO_PLAN_DIRECTORY, PLANS);

  return readdirSync(plansPath, { recursive: true, withFileTypes: true }).map((entry) =>
    entry.isDirectory() ? entry.name : withoutExtension(entry.name),
  );
}

type ScopedCitation = { citation: Citation; scope: CitationScope };

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

const CITING_EXTENSIONS = [MARKDOWN_EXTENSION, ".ts", ".tsx", ".mjs"];

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

/** A date then a long slug; the lookbehind stops a date inside a longer filename matching. */
const FINDING_NAME = /(?<![\w-])(20\d{2}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]{10,})/g;

const MARKDOWN_LINK = /\[[^\]]*\]\([^)]*\)/g;

/** One per repair site: a link spelling the name in label and target counts once. */
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

/** Drops the extension and the trailing hyphen of a `<prefix>-…` abbreviation. */
function citedName(matched: string): string {
  return withoutExtension(matched).replace(/-+$/, "");
}

function withoutExtension(name: string): string {
  return name.endsWith(MARKDOWN_EXTENSION) ? name.slice(0, -MARKDOWN_EXTENSION.length) : name;
}

function refusal(problem: string, subject: string): Error {
  return new Error(`${problem}: ${subject}`);
}
