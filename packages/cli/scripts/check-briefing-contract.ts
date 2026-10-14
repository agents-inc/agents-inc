/**
 * The rules an agent is handed stay reachable from the files an agent is told to open.
 *
 * A brief — the prompt an orchestrator hands a sub-agent — is not a tracked file, so no checker
 * can read one and nothing here judges what a brief SAYS. What it judges is the only half that is
 * on disk: whether the contract a brief is written under can still be found. `standards/briefing.md`
 * binds nobody once the two `CLAUDE.md` files stop linking it — the rules survive on disk, read as
 * adopted, and are handed to nobody.
 *
 * **The contract's own links are read, not only the links written to it.** It is judged as a source
 * of pointers alongside the two `CLAUDE.md` files and as a target of theirs, which are separate
 * populations for a reason — see `linkingDocuments`.
 *
 * **A missing input is a refusal rather than a clean run.** A binding document that is not there
 * produces zero findings from a reader that opened nothing, which is the answer a fully-reachable
 * tree gives.
 *
 * Nothing runs at module scope — the suite beside it is the enforcement, as with
 * `check-finding-citations.ts`, and the repository root is a parameter so it can be driven against
 * a fixture.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

/** Where the check reads from when no other root is given. */
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");

/** The two files every agent working in this repository is instructed to read. */
export const BINDING_DOCUMENTS = ["CLAUDE.md", "packages/cli/CLAUDE.md"];

export const BRIEFING_CONTRACT = "packages/cli/.ai-docs/standards/briefing.md";

export const NO_BINDING_DOCUMENT = "names a binding document that does not exist";

export const BROKEN_LINK = "links a path that is not on disk";
export const UNBOUND_CONTRACT = "does not link the briefing contract";

/** Why one pointer failed, phrased so the message names the repair rather than the rule. */
export type UnreachableReason = typeof BROKEN_LINK | typeof UNBOUND_CONTRACT;

/** `document` is where the repair is made and `target` is what it must reach. */
export type Unreachable = { document: string; target: string; reason: UnreachableReason };

/**
 * `examined` is the number of links read, because `unreachable: []` is the same answer whether
 * every pointer resolved or the reader matched nothing.
 */
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

/**
 * Whose links are followed: the two documents an agent is told to open, and the contract itself.
 *
 * The contract is in this population and NOT in the one `unbound()` is judged over, because the two
 * ask different questions. `unbound()` asks which documents must LINK the contract, and requiring
 * it to link itself asserts nothing and would fail on the first run. This asks whose pointers a
 * reader can follow — and left out of it, the document the whole check exists to protect reaches
 * the scan as a link TARGET and never as a source of one, free to point a reader anywhere.
 */
function linkingDocuments(bindingDocuments: readonly string[], briefingContract: string): string[] {
  return [...bindingDocuments, briefingContract];
}

/** A resolved pointer: where it was written, and the repository-relative path it claims exists. */
type Link = Unreachable & { reason: typeof BROKEN_LINK };

/**
 * Every link a document makes that claims something is on disk, resolved against that document's
 * own directory. A document that is not there is refused rather than read as linkless — the whole
 * point of the check is that these files bind, so an absent one is the loudest failure available
 * and must not present as a clean run. That holds hardest for the contract, whose absence would
 * otherwise present as two ordinary dangling pointers from the documents that link it.
 */
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

/** A markdown link's target, captured whatever the label holds. */
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g;

/** The targets a document claims are on disk here, each already stripped of its anchor. */
function localTargets(text: string): string[] {
  return [...text.matchAll(MARKDOWN_LINK)]
    .map((match) => (match[1] ?? "").trim())
    .filter(isClaimAboutThisRepository)
    .map(withoutFragment);
}

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * A URL is somebody else's promise and a bare fragment is a claim about the page it sits on, so
 * neither is judged here — reporting either would leave the scan permanently red over links that
 * are working exactly as written.
 */
function isClaimAboutThisRepository(target: string): boolean {
  return target !== "" && !URL_SCHEME.test(target) && !target.startsWith("#");
}

/** Links whose target is not on disk — the pointer a reader follows into nothing. */
function dangling(repositoryRoot: string, links: readonly Link[]): Unreachable[] {
  return links.filter((link) => !existsSync(path.join(repositoryRoot, link.target)));
}

/** An anchor names a section of the file the path already resolves; only the path is on disk. */
function withoutFragment(target: string): string {
  const [pathPart = ""] = target.split("#");
  return pathPart;
}

/** A binding document that links the contract nowhere, judged on resolution rather than on prose. */
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
