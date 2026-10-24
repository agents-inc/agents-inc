import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { rename, stat } from "fs/promises";
import { isRecord } from "../../utils/type-guards.js";
import { downloadTemplate, type DownloadTemplateOptions, type DownloadTemplateResult } from "giget";
import os from "os";
import path from "path";
import { isDeepEqual } from "remeda";
import { z } from "zod";

import {
  cacheRoot,
  CACHE_HASH_LENGTH,
  CACHE_READABLE_PREFIX_LENGTH,
  MAX_MARKETPLACE_FILE_SIZE,
  MAX_JSON_NESTING_DEPTH,
  MAX_MARKETPLACE_PLUGINS,
  MARKETPLACE_JSON,
  marketplaceManifestPath,
} from "../../consts";
import { getErrorMessage } from "../../utils/errors";
import {
  ensureDir,
  directoryExists,
  fileExists,
  glob,
  readFileOptional,
  readFileSafe,
  remove,
  writeFile,
} from "../../utils/fs";
import { log, verbose, warn } from "../../utils/logger";
import {
  sourceRefusedUsingCache,
  sourceUnreachableUsingCache,
  STATUS_MESSAGES,
} from "../../utils/messages";
import {
  DEFAULT_SOURCE,
  isLocalSource,
  NAMED_MARKETPLACE,
  validateSourceFormat,
} from "../configuration";
import { validateLoadedMarketplaceName } from "../marketplace-generator";
import {
  formatZodIssues,
  marketplaceSchema,
  sourceRevalidationSchema,
  validateNestingDepth,
  warnUnknownFields,
} from "../schemas";
import type { Marketplace, MarketplaceFetchResult } from "../../types";

/** No shell metacharacters. */
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9@._/ -]+$/;
const MAX_NAME_LENGTH = 200;
const QUOTED_NAME_LENGTH = 50;

/** Matches giget's source protocol regex to extract provider name */
const SOURCE_PROTO_RE = /^([\w-.]+):/;

/** giget's git URI regex. Groups: repo (org/name), subdir, ref (#branch). */
const GIT_URI_RE = /^(?<repo>[\w.-]+\/[\w.-]+)(?<subdir>[^#]+)?(?<ref>#[\w./@-]+)?/;

type FetchOptions = {
  subdir?: string;
};

type FetchResult = {
  path: string;
  fromCache: boolean;
  /** The source could not be asked, so a cached copy of unknown age stood in for it. */
  unreachable: boolean;
  source: string;
};

/** A remote marketplace a load inside `askingEachMarketplaceItself` could not ask. */
export class MarketplaceUnreachableError extends Error {
  constructor(
    readonly source: string,
    readonly reason: string,
  ) {
    super(`Could not reach ${source}: ${reason}`);
    this.name = "MarketplaceUnreachableError";
  }
}

/**
 * The marketplace answered without the tarball: a load that must reach it refuses every such
 * answer, and every other load takes it as `postureOn` says.
 */
class TarballWithheldError extends Error {
  readonly status: number;

  constructor({ status, statusText }: Response) {
    super(`the marketplace answered ${status} ${statusText}`.trimEnd());
    this.name = "TarballWithheldError";
    this.status = status;
  }
}

/** The marketplaces whose saved copy a download in the scope found differing, and replaced. */
const marketplaceMustAnswer = new AsyncLocalStorage<Set<string>>();

/**
 * Loads in `body` download each remote marketplace once, whatever ETag it answers with: one that does
 * not answer, answers without its content, or whose download fails, is refused rather than stood in
 * for by a saved copy. A saved copy, the CLI's or giget's tarball, is replaced only once that
 * download succeeds, and stays on disk for every other load. `body` is handed the sources whose saved
 * copy differed from that download.
 */
export function askingEachMarketplaceItself<T>(
  body: (differingCopiesReplaced: ReadonlySet<string>) => T,
): T {
  const differingCopiesReplaced = new Set<string>();
  return marketplaceMustAnswer.run(differingCopiesReplaced, () => body(differingCopiesReplaced));
}

function mustAnswer(): boolean {
  return marketplaceMustAnswer.getStore() !== undefined;
}

const refusalStopsTheLoad = new AsyncLocalStorage<true>();

/**
 * Loads in `body` stop on a refusal of the version check that every other load keeps the saved copy
 * over, as `postureOn` says. It shares the run's verdicts with every other load, so it wraps a run's
 * first load of the marketplace.
 */
export function stoppingOnARefusal<T>(body: () => T): T {
  return refusalStopsTheLoad.run(true, body);
}

function stopsOnARefusal(): boolean {
  return refusalStopsTheLoad.getStore() !== undefined;
}

const METHOD_NOT_ALLOWED = 405;

/**
 * `stop`: the load fails with the refusal. `keep`: the saved copy stands in, and the run says so.
 * `pass over`: the saved copy stands in, and the refusal goes unsaid.
 */
type RefusalPosture = "stop" | "keep" | "pass over";

/**
 * How this load takes a refusal. A load that must reach the marketplace stops on every one. Owner
 * rulings, 2026-10-24, for the rest: a 5xx, or a 405 refusing the HEAD the check asks with, keeps the
 * copy; any other 4xx stops a load in `stoppingOnARefusal` and is passed over by every other. Any
 * other status is no refusal they name.
 */
function postureOn(status: number): RefusalPosture | undefined {
  if (mustAnswer()) return "stop";
  if (status === METHOD_NOT_ALLOWED || isServerError(status)) return "keep";
  if (!isClientError(status)) return undefined;
  return stopsOnARefusal() ? "stop" : "pass over";
}

const FIRST_CLIENT_ERROR = 400;
const FIRST_SERVER_ERROR = 500;
const PAST_THE_SERVER_ERRORS = 600;

function isClientError(status: number): boolean {
  return status >= FIRST_CLIENT_ERROR && status < FIRST_SERVER_ERROR;
}

function isServerError(status: number): boolean {
  return status >= FIRST_SERVER_ERROR && status < PAST_THE_SERVER_ERRORS;
}

export function sanitizeSourceForCache(source: string): string {
  const hash = createHash("sha256").update(source).digest("hex").slice(0, CACHE_HASH_LENGTH);

  const readable = source
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, CACHE_READABLE_PREFIX_LENGTH);

  return readable ? `${readable}-${hash}` : hash;
}

function getCacheDir(source: string): string {
  const sanitized = sanitizeSourceForCache(source) || "unknown";
  return path.join(cacheRoot(), "sources", sanitized);
}

/** Every fetch passes the check `resolveSource` applies, whoever chose the source. */
export async function fetchFromSource(
  source: string,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const { subdir } = options;
  validateSourceFormat(source, NAMED_MARKETPLACE);

  if (isLocalSource(source)) {
    return fetchFromLocalSource(source, subdir);
  }

  return fetchFromRemoteSource(source, subdir);
}

async function fetchFromLocalSource(source: string, subdir?: string): Promise<FetchResult> {
  const fullPath = subdir ? path.join(source, subdir) : source;
  const absolutePath = path.isAbsolute(fullPath) ? fullPath : path.resolve(process.cwd(), fullPath);

  if (!(await directoryExists(absolutePath))) {
    throw new Error(
      `Local marketplace not found: '${absolutePath}'\n\n` +
        `Nothing is at that path, and a local marketplace must be a directory holding skills.\n\n` +
        `Check it for a typo, or name a marketplace that exists:\n` +
        `  --marketplace ${DEFAULT_SOURCE}`,
    );
  }

  verbose(`Using local marketplace: ${absolutePath}`);

  return {
    path: absolutePath,
    fromCache: false,
    unreachable: false,
    source,
  };
}

/** Replicates giget's cache path, `{root}/{provider}/{repo}`; undefined for a non-git source. */
export function getGigetCacheDir(source: string): string | undefined {
  const protoMatch = source.match(SOURCE_PROTO_RE);

  // http/https providers use the full URL, not parseable as git URI
  if (protoMatch && (protoMatch[1] === "http" || protoMatch[1] === "https")) {
    return undefined;
  }

  const providerName = protoMatch?.[1] ?? "github";
  const rawSource = protoMatch ? source.slice(protoMatch[0].length) : source;

  const uriMatch = rawSource.match(GIT_URI_RE);
  if (!uriMatch?.groups?.repo) {
    return undefined;
  }

  // Replicate giget's template.name sanitization
  const templateName = uriMatch.groups.repo.replace("/", "-").replace(/[^\da-z-]/gi, "-");

  return path.join(gigetCacheRoot(), providerName, templateName);
}

/** Replicates giget's `cacheDirectory()`. */
function gigetCacheRoot(): string {
  return process.env.XDG_CACHE_HOME
    ? path.resolve(process.env.XDG_CACHE_HOME, "giget")
    : path.resolve(os.homedir(), ".cache", "giget");
}

/** Clears giget's tarball/ETag cache so downloadTemplate() fetches fresh. */
async function clearGigetCache(source: string): Promise<void> {
  const gigetDir = getGigetCacheDir(source);
  if (!gigetDir) return;

  if (await directoryExists(gigetDir)) {
    verbose(`Clearing giget cache: ${gigetDir}`);
    await remove(gigetDir);
  }
}

async function fetchFromRemoteSource(source: string, subdir?: string): Promise<FetchResult> {
  const cacheDir = getCacheDir(source);
  const fullSource = subdir ? `${source}/${subdir}` : source;

  verbose(`Fetching from remote: ${fullSource}`);
  verbose(`Cache directory: ${cacheDir}`);

  if (await directoryExists(cacheDir)) {
    const verdict = await revalidateCachedCopy(cacheDir, source);
    if (keepsTheCopy(verdict)) {
      verbose(`Using cached marketplace: ${cacheDir}`);
      return {
        path: cacheDir,
        fromCache: true,
        unreachable: verdict === "unreachable",
        source: fullSource,
      };
    }

    announceRefetch(verdict);
    if (!mustAnswer()) await discardCachedCopy(cacheDir, source);
  }

  const differingCopiesReplaced = marketplaceMustAnswer.getStore();
  return differingCopiesReplaced
    ? downloadAnsweredFor(cacheDir, source, fullSource, differingCopiesReplaced)
    : downloadFreshCopy(cacheDir, source, fullSource);
}

async function discardCachedCopy(cacheDir: string, source: string): Promise<void> {
  await clearGigetCache(source);
  await remove(cacheDir);
}

async function downloadFreshCopy(
  cacheDir: string,
  source: string,
  fullSource: string,
): Promise<FetchResult> {
  await ensureDir(path.dirname(cacheDir));

  try {
    const { result, savedTarball } = await gigetDownload(source, fullSource, {
      dir: cacheDir,
      force: true, // Always force when downloading to avoid "already exists" error
      offline: false,
    });

    verbose(`Downloaded to: ${result.dir}`);
    if (savedTarball) await askBeforeKeepingTheSavedTarball(cacheDir, result, source);
    await recordFetchedCopy(cacheDir, result, savedTarball);
    markCopyCurrentForThisRun(cacheDir);

    return {
      path: result.dir,
      fromCache: false,
      unreachable: false,
      source: fullSource,
    };
  } catch (error) {
    throw createDetailedFetchError(error, source);
  }
}

/**
 * giget answers a failed download with the tarball it saved, saying nothing, so the marketplace is
 * asked before that tarball is kept: a refusal that stops the load keeps nothing giget extracted, and
 * the tarball stands in for any other, or for no answer, said as it is for the saved copy.
 */
async function askBeforeKeepingTheSavedTarball(
  cacheDir: string,
  result: DownloadTemplateResult,
  source: string,
): Promise<void> {
  const tar = tarballOf(result);
  if (tar === undefined) return;

  const answer = await answerAbout(tar);
  if (answer === "answered") return;
  if (answer === "unreachable") {
    warn(sourceUnreachableUsingCache(source));
    return;
  }
  if (stopsTheLoad(answer)) {
    await remove(cacheDir);
    throw answer;
  }
  announceTheCopyKept(answer, source);
}

/** The refusal itself where the marketplace answered with one. */
async function answerAbout(
  tar: string,
): Promise<"answered" | "unreachable" | TarballWithheldError> {
  try {
    await fetchEtag(tar);
    return "answered";
  } catch (error) {
    if (error instanceof TarballWithheldError) return error;
    verbose(`Could not ask ${tar} about the tarball giget saved: ${getErrorMessage(error)}`);
    return "unreachable";
  }
}

/** Beside the cache directory, as its fetch record is. */
const STAGED_DOWNLOAD_SUFFIX = ".download";

/** Doctor prints it under "Could not reach <source>". */
const ONLY_A_SAVED_COPY_CAME_BACK = "the download failed and only a saved copy came back";

/** Beside giget's tarball and its record, which its glob for tarballs matches neither of. */
const SET_ASIDE_SUFFIX = ".set-aside";

/**
 * Staged, so a refusal leaves the copy, its record and giget's tarball. The marketplace is asked
 * after the download, which keeps only what it fetched, never a tarball giget saved.
 */
async function downloadAnsweredFor(
  cacheDir: string,
  source: string,
  fullSource: string,
  differingCopiesReplaced: Set<string>,
): Promise<FetchResult> {
  const staged = `${cacheDir}${STAGED_DOWNLOAD_SUFFIX}`;
  const downloadStaged = () =>
    gigetDownload(source, fullSource, {
      dir: staged,
      force: true,
      forceClean: true,
      offline: false,
    });
  await ensureDir(path.dirname(cacheDir));

  try {
    const { result, savedTarball } = await downloadStaged();
    const record = await askAfterTheDownload(result, source);
    if (savedTarball) await downloadPast(savedTarball, record, downloadStaged, source);
    const differed = await savedCopyDiffers(cacheDir, staged);
    await replaceCopy(cacheDir, staged, record);
    if (differed) differingCopiesReplaced.add(source);
    markCopyCurrentForThisRun(cacheDir);

    return { path: cacheDir, fromCache: false, unreachable: false, source: fullSource };
  } catch (error) {
    if (error instanceof MarketplaceUnreachableError) throw error;
    throw createDetailedFetchError(error, source);
  } finally {
    await remove(staged);
  }
}

/**
 * giget extracts the tarball it saved, saying nothing, when its download fails and when the
 * marketplace answers with the ETag that tarball was saved under. Under any other ETag the download
 * failed; under that one giget never fetched, so it is made to.
 */
async function downloadPast(
  savedTarball: SavedTarball,
  record: SourceRevalidation,
  download: () => Promise<GigetDownload>,
  source: string,
): Promise<void> {
  if (!savedUnder(savedTarball, record)) {
    throw new MarketplaceUnreachableError(source, ONLY_A_SAVED_COPY_CAME_BACK);
  }

  await withTarballSetAside(savedTarball.path, download);
}

/**
 * giget extracts a tarball without fetching while its record names the ETag the marketplace answers
 * with, and writes that record only once a download completes. So the record is first aside and last
 * back: a download interrupted at any point leaves a tarball no record vouches for, and the next one
 * fetches over it. Both return if the download fails.
 */
async function withTarballSetAside(
  tarball: string,
  download: () => Promise<GigetDownload>,
): Promise<void> {
  const record = gigetRecordOf(tarball);
  await rename(record, setAsideOf(record));
  await rename(tarball, setAsideOf(tarball));
  try {
    await download();
  } catch (error) {
    await rename(setAsideOf(tarball), tarball);
    await rename(setAsideOf(record), record);
    throw error;
  }
  await Promise.all([remove(setAsideOf(tarball)), remove(setAsideOf(record))]);
}

function setAsideOf(file: string): string {
  return `${file}${SET_ASIDE_SUFFIX}`;
}

/** No saved copy differs from nothing; one that cannot be read is damaged, so it differs. */
async function savedCopyDiffers(cacheDir: string, downloaded: string): Promise<boolean> {
  if (!(await directoryExists(cacheDir))) return false;
  try {
    return !(await holdSameFiles(cacheDir, downloaded));
  } catch (error) {
    verbose(`Could not read the saved copy at ${cacheDir}: ${getErrorMessage(error)}`);
    return true;
  }
}

/** By path and bytes. */
async function holdSameFiles(left: string, right: string): Promise<boolean> {
  const [leftFiles, rightFiles] = await Promise.all([everyFileIn(left), everyFileIn(right)]);
  return (
    isDeepEqual(leftFiles, rightFiles) && leftFiles.every((file) => sameBytesAt(file, left, right))
  );
}

const EVERY_FILE = "**/*";

/** Dot files too: a marketplace's manifest is under `.claude-plugin/`. */
function everyFileIn(dir: string): Promise<string[]> {
  return glob(EVERY_FILE, dir, { dot: true });
}

/**
 * Synchronous: a marketplace holds thousands of small files, and an asynchronous read costs each
 * one a round trip that takes ten times the read itself.
 */
function sameBytesAt(file: string, left: string, right: string): boolean {
  return readFileSync(path.join(left, file)).equals(readFileSync(path.join(right, file)));
}

async function replaceCopy(
  cacheDir: string,
  staged: string,
  record: SourceRevalidation,
): Promise<void> {
  await remove(cacheDir);
  await rename(staged, cacheDir);
  await writeFile(fetchRecordPath(cacheDir), JSON.stringify(record));
}

/** Present when giget extracted the tarball it saved on an earlier run, rather than one it fetched. */
type SavedTarball = { path: string; etag: string | undefined };

type GigetDownload = { result: DownloadTemplateResult; savedTarball?: SavedTarball };

/**
 * giget saves a tarball as `{provider}/{name}/{version || name}.tar.gz`. A git provider's version is
 * the ref, which may hold a slash: `#feature/x` is saved a folder deeper, as `feature/x.tar.gz`.
 */
const GIGET_TARBALLS = "**/*.tar.gz";

/** giget's record of the ETag it saved a tarball under, beside it as `{tarball}.json`. */
const gigetTarballRecordSchema = z.object({ etag: z.string().min(1).optional() });

/**
 * giget answers a failed download with the tarball it saved earlier, and its own ETag match the
 * same way: it extracts the saved tarball, writes nothing to its cache and says nothing. So a
 * tarball this download did not write is the saved one, carrying the ETag giget saved it under.
 */
async function gigetDownload(
  source: string,
  fullSource: string,
  options: DownloadTemplateOptions,
): Promise<GigetDownload> {
  const providerDir = gigetProviderDir(source);
  const timesBefore = await tarballTimes(providerDir);
  const result = await downloadTemplate(fullSource, options);

  const tarball = path.join(providerDir, gigetTarballOf(result));
  const writtenByThisDownload = timesBefore.get(tarball) !== (await modifiedAt(tarball));
  if (writtenByThisDownload) return { result };

  verbose(`giget extracted the tarball it saved earlier, not a download: ${tarball}`);
  return { result, savedTarball: { path: tarball, etag: await etagSavedWith(tarball) } };
}

/** Every remote source names its provider: `validateSourceFormat` refuses one that does not. */
function gigetProviderDir(source: string): string {
  const provider = SOURCE_PROTO_RE.exec(source)?.[1];
  if (provider === undefined) throw new Error(`No provider named in '${source}'`);
  return path.join(gigetCacheRoot(), provider);
}

/** Keyed by path, as `gigetTarballOf` locates the one a download extracted. */
async function tarballTimes(providerDir: string): Promise<ReadonlyMap<string, number | undefined>> {
  const tarballs = await glob(GIGET_TARBALLS, providerDir);
  const paths = tarballs.map((tarball) => path.join(providerDir, tarball));
  return new Map(await Promise.all(paths.map(async (at) => [at, await modifiedAt(at)] as const)));
}

async function modifiedAt(file: string): Promise<number | undefined> {
  return (await fileExists(file)) ? (await stat(file)).mtimeMs : undefined;
}

/** Narrowed from giget's untyped result, as `downloadTemplate` names the tarball it extracts. */
function gigetTarballOf(result: DownloadTemplateResult): string {
  const name: unknown = result.name;
  const version: unknown = result.version;
  if (typeof name !== "string") throw new Error("the download named no template");

  const stem = typeof version === "string" && version !== "" ? version : name;
  return path.join(name, `${stem}.tar.gz`);
}

function gigetRecordOf(tarball: string): string {
  return `${tarball}.json`;
}

async function etagSavedWith(tarballPath: string): Promise<string | undefined> {
  const raw = await readFileOptional(gigetRecordOf(tarballPath));
  const parsed = gigetTarballRecordSchema.safeParse(parseJsonOrUndefined(raw));
  return parsed.success ? parsed.data.etag : undefined;
}

/** The marketplace answered with the ETag giget saved its tarball under: that version's content. */
function savedUnder(savedTarball: SavedTarball, record: SourceRevalidation): boolean {
  return savedTarball.etag !== undefined && savedTarball.etag === record.etag;
}

/**
 * `unrecorded`: no fetch record beside the cache, so it is re-fetched once, quietly.
 * `answered`: a load that must reach the marketplace downloads it whatever ETag it answered with.
 * `refused`: the marketplace refused the version check, and `postureOn` keeps or passes it over.
 */
type CacheVerdict =
  "current" | "superseded" | "unrecorded" | "answered" | "unreachable" | "refused";

/** The verdicts a load reads its saved copy under. */
type CopyKept = Extract<CacheVerdict, "current" | "unreachable" | "refused">;

function keepsTheCopy(verdict: CacheVerdict): verdict is CopyKept {
  return verdict === "current" || verdict === "unreachable" || verdict === "refused";
}

type SourceRevalidation = z.infer<typeof sourceRevalidationSchema>;

/** About twenty times a healthy answer, and half the platform's ~10s connect timeout. */
const REVALIDATION_TIMEOUT_MS = 5000;

/** Where a cache directory's fetch record sits: beside it, never inside it. */
const FETCH_RECORD_SUFFIX = ".etag.json";

/** One question per source per process: a command loads the same source more than once. */
const askedThisRun = new Map<string, Promise<CacheVerdict>>();

/** Kept apart: a verdict reached without asking must not answer a load that has to ask. */
const askedItselfThisRun = new Map<string, Promise<CacheVerdict>>();

function verdictsThisRun(): Map<string, Promise<CacheVerdict>> {
  return mustAnswer() ? askedItselfThisRun : askedThisRun;
}

/** Silent for `unrecorded` and `answered`, which are housekeeping rather than news. */
function announceRefetch(verdict: Exclude<CacheVerdict, CopyKept>): void {
  if (verdict === "superseded") {
    log(STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT);
  }
}

function revalidateCachedCopy(cacheDir: string, source: string): Promise<CacheVerdict> {
  const verdicts = verdictsThisRun();
  const asked = verdicts.get(cacheDir);
  if (asked) return asked;

  const verdict = classifyCachedCopy(cacheDir, source);
  verdicts.set(cacheDir, verdict);
  return verdict;
}

/**
 * A copy this run just downloaded is current by construction, so later loads do not re-fetch it: a
 * load that must reach the marketplace downloads it once a run.
 */
function markCopyCurrentForThisRun(cacheDir: string): void {
  verdictsThisRun().set(cacheDir, Promise.resolve("current"));
}

/**
 * Warns about an unreachable source, or a refusal kept over, here, where the verdict is memoised:
 * once per run. A load that must reach the marketplace asks even with no ETag to compare, and an
 * unanswered one throws.
 */
async function classifyCachedCopy(cacheDir: string, source: string): Promise<CacheVerdict> {
  const record = await readFetchRecord(cacheDir);
  if (!record) return "unrecorded";

  if (record.etag === undefined && !mustAnswer()) {
    verbose(`No ETag was recorded for ${record.tar} — keeping the cached copy`);
    return "current";
  }

  try {
    return judgeAnswer(record, await fetchEtag(record.tar));
  } catch (error) {
    if (error instanceof TarballWithheldError) return stopOrKeepTheCopy(error, source);
    verbose(`Could not revalidate ${record.tar}: ${getErrorMessage(error)}`);
    if (mustAnswer()) throw new MarketplaceUnreachableError(source, getErrorMessage(error));
    warn(sourceUnreachableUsingCache(source));
    return "unreachable";
  }
}

function stopOrKeepTheCopy(refusal: TarballWithheldError, source: string): "refused" {
  if (stopsTheLoad(refusal)) throw createDetailedFetchError(refusal, source);
  announceTheCopyKept(refusal, source);
  return "refused";
}

/** A load that must reach the marketplace downloads it whatever else it answers; others keep it. */
function judgeAnswer(record: SourceRevalidation, live: string | undefined): CacheVerdict {
  if (movedOn(record, live)) return "superseded";
  if (mustAnswer()) return "answered";

  if (live === undefined) {
    verbose(`${record.tar} answered without an ETag — keeping the cached copy`);
  }
  return "current";
}

/** Both sides named a version, and not the same one. */
function movedOn(record: SourceRevalidation, live: string | undefined): boolean {
  return live !== undefined && record.etag !== undefined && live !== record.etag;
}

/**
 * From the same runtime as giget, so the two agree; the token is never stored. A load that must
 * reach the marketplace asks for the tarball itself, its body left unread, since a HEAD refused
 * says nothing of the content; an answer withholding it is refused.
 */
async function fetchEtag(tar: string): Promise<string | undefined> {
  const auth = process.env.GIGET_AUTH;
  const response = await fetch(tar, {
    method: mustAnswer() ? "GET" : "HEAD",
    ...(auth && { headers: { Authorization: `Bearer ${auth}` } }),
    signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
  });
  await response.body?.cancel();
  if (withheld(response)) throw new TarballWithheldError(response);
  return response.headers.get("etag") ?? undefined;
}

function withheld({ ok, status }: Response): boolean {
  return !ok && postureOn(status) !== undefined;
}

function stopsTheLoad(refusal: TarballWithheldError): boolean {
  return postureOn(refusal.status) === "stop";
}

/** Silent for a refusal passed over, which the ruling leaves unsaid; `verbose` still names it. */
function announceTheCopyKept(refusal: TarballWithheldError, source: string): void {
  if (postureOn(refusal.status) === "keep") {
    warn(sourceRefusedUsingCache(source, refusal.status));
    return;
  }
  verbose(`Keeping the saved copy of ${source} over its refusal: ${refusal.message}`);
}

/** Exported: `e2e/fixtures/default-source-cache.ts` seeds a cache and writes its record here. */
export function fetchRecordPath(cacheDir: string): string {
  return `${cacheDir}${FETCH_RECORD_SUFFIX}`;
}

async function readFetchRecord(cacheDir: string): Promise<SourceRevalidation | undefined> {
  const raw = await readFileOptional(fetchRecordPath(cacheDir));
  if (!raw) return undefined;

  const parsed = sourceRevalidationSchema.safeParse(parseJsonOrUndefined(raw));
  if (!parsed.success) {
    verbose(`Unusable fetch record at ${fetchRecordPath(cacheDir)} — re-fetching the marketplace`);
    return undefined;
  }

  return parsed.data;
}

/**
 * The tarball URL is narrowed from giget's untyped result; without one, nothing is recorded. A
 * tarball giget saved earlier is recorded under the ETag it was saved with, never the live one.
 */
async function recordFetchedCopy(
  cacheDir: string,
  result: DownloadTemplateResult,
  savedTarball: SavedTarball | undefined,
): Promise<void> {
  const tar = tarballOf(result);
  if (tar === undefined) {
    verbose("No tarball URL came back from the download — the copy cannot be revalidated");
    return;
  }

  const etag = savedTarball ? savedTarball.etag : await etagIfAnswered(tar);
  await writeFile(fetchRecordPath(cacheDir), JSON.stringify(fetchRecord(tar, etag)));
}

/** Outside the scope an unanswered question records no ETag, and the copy is kept as it is. */
async function etagIfAnswered(tar: string): Promise<string | undefined> {
  try {
    return await fetchEtag(tar);
  } catch (error) {
    verbose(`Could not ask ${tar} after the download: ${getErrorMessage(error)}`);
    return undefined;
  }
}

/** A withheld tarball is detailed by `downloadAnsweredFor`, as a failed download is. */
async function askAfterTheDownload(
  result: DownloadTemplateResult,
  source: string,
): Promise<SourceRevalidation> {
  const tar = tarballOf(result);
  if (tar === undefined) {
    throw new Error("the download named no tarball to ask the marketplace about");
  }

  try {
    return fetchRecord(tar, await fetchEtag(tar));
  } catch (error) {
    if (error instanceof TarballWithheldError) throw error;
    throw new MarketplaceUnreachableError(source, getErrorMessage(error));
  }
}

function tarballOf(result: DownloadTemplateResult): string | undefined {
  const tar: unknown = result.tar;
  return typeof tar === "string" ? tar : undefined;
}

function fetchRecord(tar: string, etag: string | undefined): SourceRevalidation {
  return { tar, ...(etag !== undefined && { etag }) };
}

function parseJsonOrUndefined(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function createDetailedFetchError(error: unknown, source: string): Error {
  const message = getErrorMessage(error);

  if (message.includes("404") || message.includes("Not Found")) {
    return new Error(
      `Repository not found: ${source}\n\n` +
        `This could mean:\n` +
        `  - The repository doesn't exist\n` +
        `  - The repository is private and you need to set authentication\n` +
        `  - There's a typo in the URL\n\n` +
        `For private repositories, set the GIGET_AUTH environment variable:\n` +
        `  export GIGET_AUTH=ghp_your_github_token`,
    );
  }

  if (message.includes("401") || message.includes("Unauthorized")) {
    return new Error(
      `Authentication required for: ${source}\n\n` +
        `Set the GIGET_AUTH environment variable with a GitHub token:\n` +
        `  export GIGET_AUTH=ghp_your_github_token\n\n` +
        `Create a token at: https://github.com/settings/tokens\n` +
        `Required scope: repo (for private repos) or public_repo (for public)`,
    );
  }

  if (message.includes("403") || message.includes("Forbidden")) {
    return new Error(
      `Access denied to: ${source}\n\n` +
        `Your token may not have sufficient permissions.\n` +
        `Ensure your GIGET_AUTH token has the 'repo' scope for private repositories.`,
    );
  }

  if (
    message.includes("ENOTFOUND") ||
    message.includes("ETIMEDOUT") ||
    message.includes("network")
  ) {
    return new Error(
      `Network error fetching: ${source}\n\n` +
        `Please check your internet connection.\n` +
        `If you're behind a corporate proxy, you may need to set:\n` +
        `  export HTTPS_PROXY=http://your-proxy:port\n` +
        `  export FORCE_NODE_FETCH=true  # Required for Node 20+`,
    );
  }

  return new Error(`Failed to fetch ${source}: ${message}`);
}

/** Absent and unreadable have different remedies, so absence gets its own type. */
export class MarketplaceManifestAbsentError extends Error {}

/** A name Claude Code will not register plugins under: it loads but installs nothing. */
export class MarketplaceNameRefusedError extends Error {}

/** Typed against `Marketplace`, so a rename fails here rather than silencing the refusal. */
const MANIFEST_NAME_FIELD: keyof Marketplace = "name";

/** Worded as the schema's own name refusal: the manifest is the file the reader can change. */
const LOADED_NAME_WAY_OUT = "rename the marketplace in this manifest";

/** Read off the issue path, not its text, which gets rewritten. */
function refusesTheName(issues: readonly z.ZodIssue[]): boolean {
  return issues.some((issue) => issue.path.length === 1 && issue.path[0] === MANIFEST_NAME_FIELD);
}

/** The same sentence either way; the error type carries the remedy. */
function manifestRefusal(marketplacePath: string, issues: readonly z.ZodIssue[]): Error {
  const message =
    `Invalid ${MARKETPLACE_JSON} at: ${marketplacePath}\n\n` +
    `Validation errors: ${formatZodIssues([...issues])}`;

  return refusesTheName(issues) ? new MarketplaceNameRefusedError(message) : new Error(message);
}

export async function fetchMarketplace(source: string): Promise<MarketplaceFetchResult> {
  const { path: sourcePath, fromCache } = await fetchFromSource(source, { subdir: "" });
  const marketplacePath = marketplaceManifestPath(sourcePath);

  await refuseAbsentManifest(marketplacePath, source);
  const parsed = await readManifestJson(marketplacePath);
  const marketplace = validateManifest(parsed, marketplacePath);
  warnAboutUnknownManifestFields(parsed);
  refuseTooManyPlugins(marketplace, marketplacePath);
  warnAboutPluginNames(marketplace);

  verbose(`Loaded marketplace: ${marketplace.name} v${marketplace.version}`);
  return { marketplace, sourcePath, fromCache };
}

/** The file, not its directory: a plugin repo ships `.claude-plugin/` with no marketplace in it. */
async function refuseAbsentManifest(marketplacePath: string, source: string): Promise<void> {
  if (await fileExists(marketplacePath)) return;

  throw new MarketplaceManifestAbsentError(
    `Marketplace not found at: ${source}\n\n` +
      `The .claude-plugin/marketplace.json file is missing from this repository.\n\n` +
      `Possible causes:\n` +
      "  - The marketplace URL may be incorrect\n" +
      "  - The repository may not have a marketplace configured\n\n" +
      "To create a marketplace, add a .claude-plugin/marketplace.json file to your marketplace repository.",
  );
}

async function readManifestJson(marketplacePath: string): Promise<unknown> {
  const content = await readFileSafe(marketplacePath, MAX_MARKETPLACE_FILE_SIZE);
  const parsed: unknown = JSON.parse(content);

  if (!validateNestingDepth(parsed, MAX_JSON_NESTING_DEPTH)) {
    throw new Error(
      `Invalid marketplace.json at: ${marketplacePath}\n\n` +
        `JSON structure exceeds maximum nesting depth of ${MAX_JSON_NESTING_DEPTH}.`,
    );
  }
  return parsed;
}

/** The schema first, then the reserved names the schema cannot know. */
function validateManifest(parsed: unknown, marketplacePath: string): Marketplace {
  const validation = marketplaceSchema.safeParse(parsed);
  if (!validation.success) {
    throw manifestRefusal(marketplacePath, validation.error.issues);
  }

  const marketplace = validation.data;
  const reservedName = validateLoadedMarketplaceName(marketplace.name, LOADED_NAME_WAY_OUT);
  if (reservedName) {
    throw new MarketplaceNameRefusedError(
      `Invalid ${MARKETPLACE_JSON} at: ${marketplacePath}\n\n${reservedName}`,
    );
  }
  return marketplace;
}

const EXPECTED_MARKETPLACE_KEYS = [
  "$schema",
  "name",
  "version",
  "description",
  "owner",
  "metadata",
  "plugins",
] as const;

function warnAboutUnknownManifestFields(parsed: unknown): void {
  if (isRecord(parsed)) {
    warnUnknownFields(parsed, EXPECTED_MARKETPLACE_KEYS, MARKETPLACE_JSON);
  }
}

function refuseTooManyPlugins(marketplace: Marketplace, marketplacePath: string): void {
  if (marketplace.plugins.length <= MAX_MARKETPLACE_PLUGINS) return;

  throw new Error(
    `Invalid marketplace.json at: ${marketplacePath}\n\n` +
      `Too many plugins: ${marketplace.plugins.length} (limit: ${MAX_MARKETPLACE_PLUGINS}).`,
  );
}

function warnAboutPluginNames(marketplace: Marketplace): void {
  for (const plugin of marketplace.plugins) {
    if (plugin.name.length > MAX_NAME_LENGTH) {
      warn(
        `Marketplace plugin name too long (${plugin.name.length} chars): '${plugin.name.slice(0, QUOTED_NAME_LENGTH)}...'`,
      );
    }
    if (!SAFE_NAME_PATTERN.test(plugin.name)) {
      warn(
        `Marketplace plugin name contains unsafe characters: '${plugin.name.slice(0, QUOTED_NAME_LENGTH)}'`,
      );
    }
  }
}
