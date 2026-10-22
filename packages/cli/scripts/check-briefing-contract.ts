/**
 * Refuses a dangling link in the two CLAUDE.md files or the briefing contract, and a CLAUDE.md that
 * does not link the contract. A missing input is a refusal, not a clean run.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

/** The two files every agent working in this repository is instructed to read. */
export const BINDING_DOCUMENTS = ["CLAUDE.md", "packages/cli/CLAUDE.md"];

export const BRIEFING_CONTRACT = "packages/cli/.ai-docs/standards/briefing.md";

export const NO_BINDING_DOCUMENT = "names a binding document that does not exist";

export const BROKEN_LINK = "links a path that is not on disk";
export const UNBOUND_CONTRACT = "does not link the briefing contract";

type UnreachableReason = typeof BROKEN_LINK | typeof UNBOUND_CONTRACT;

/** `document` is where the repair is made and `target` is what it must reach. */
export type Unreachable = { document: string; target: string; reason: UnreachableReason };

/** `examined` tells "every link resolved" apart from "no link matched". */
export type CheckResult = { clean: boolean; examined: number; unreachable: Unreachable[] };

export type CheckOptions = {
  repositoryRoot?: string | undefined;
  bindingDocuments?: readonly string[] | undefined;
  briefingContract?: string | undefined;
};

export function check({
  repositoryRoot = REPOSITORY_ROOT,
  bindingDocuments = BINDING_DOCUMENTS,
  briefingContract = BRIEFING_CONTRACT,
}: CheckOptions = {}): CheckResult {
  const links = linkingDocuments(bindingDocuments, briefingContract).flatMap((document) =>
    linksOf(repositoryRoot, document),
  );

  const unreachable = [
    ...dangling(repositoryRoot, links),
    ...unbound(bindingDocuments, links, briefingContract),
  ];

  return { clean: unreachable.length === 0, examined: links.length, unreachable };
}

/** The contract's own links are followed too, but it is not required to link itself. */
function linkingDocuments(bindingDocuments: readonly string[], briefingContract: string): string[] {
  return [...bindingDocuments, briefingContract];
}

type Link = Unreachable & { reason: typeof BROKEN_LINK };

/** Resolved against the document's own directory; an absent document is refused. */
function linksOf(repositoryRoot: string, document: string): Link[] {
  const documentPath = path.join(repositoryRoot, document);
  if (!existsSync(documentPath)) throw refusal(NO_BINDING_DOCUMENT, document);

  const directory = path.posix.dirname(toPosix(document));

  return localTargets(readFileSync(documentPath, "utf-8")).map((target) => ({
    document,
    target: path.posix.normalize(path.posix.join(directory, target)),
    reason: BROKEN_LINK,
  }));
}

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g;

function localTargets(text: string): string[] {
  return [...text.matchAll(MARKDOWN_LINK)]
    .map((match) => (match[1] ?? "").trim())
    .filter(isClaimAboutThisRepository)
    .map(withoutFragment);
}

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** URLs and bare fragments are not claims about this repository's files. */
function isClaimAboutThisRepository(target: string): boolean {
  return target !== "" && !URL_SCHEME.test(target) && !target.startsWith("#");
}

function dangling(repositoryRoot: string, links: readonly Link[]): Unreachable[] {
  return links.filter((link) => !existsSync(path.join(repositoryRoot, link.target)));
}

function withoutFragment(target: string): string {
  const [pathPart = ""] = target.split("#");
  return pathPart;
}

function unbound(
  bindingDocuments: readonly string[],
  links: readonly Link[],
  briefingContract: string,
): Unreachable[] {
  const contract = path.posix.normalize(toPosix(briefingContract));
  const binds = (document: string): boolean =>
    links.some((link) => link.document === document && link.target === contract);

  return bindingDocuments
    .filter((document) => !binds(document))
    .map((document) => ({ document, target: briefingContract, reason: UNBOUND_CONTRACT }));
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function refusal(reason: string, subject: string): Error {
  return new Error(`check-briefing-contract ${reason} — ${subject}`);
}
