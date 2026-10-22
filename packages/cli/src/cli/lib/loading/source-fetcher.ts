import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "crypto";
import { rename } from "fs/promises";
import { isRecord } from "../../utils/type-guards.js";
import { downloadTemplate, type DownloadTemplateResult } from "giget";
import os from "os";
import path from "path";
import type { z } from "zod";

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
  readFileOptional,
  readFileSafe,
  remove,
  writeFile,
} from "../../utils/fs";
import { log, verbose, warn } from "../../utils/logger";
import { sourceUnreachableUsingCache, STATUS_MESSAGES } from "../../utils/messages";
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

/** The marketplace answered a load that must reach it, but without the tarball. */
class TarballWithheldError extends Error {
  constructor({ status, statusText }: Response) {
    super(`the marketplace answered ${status} ${statusText}`.trimEnd());
    this.name = "TarballWithheldError";
  }
}

const marketplaceMustAnswer = new AsyncLocalStorage<true>();

/**
 * Loads in `body` ask each remote marketplace itself: one that does not answer, or answers without
 * its content, is refused rather than stood in for by its saved copy, which stays on disk for every
 * other load. A copy is read only when the marketplace answers with the ETag it was saved under.
 */
export function askingEachMarketplaceItself<T>(body: () => T): T {
  return marketplaceMustAnswer.run(true, body);
}

function mustAnswer(): boolean {
  return marketplaceMustAnswer.getStore() === true;
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

  const gigetCacheRoot = process.env.XDG_CACHE_HOME
    ? path.resolve(process.env.XDG_CACHE_HOME, "giget")
    : path.resolve(os.homedir(), ".cache", "giget");

  return path.join(gigetCacheRoot, providerName, templateName);
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
    if (verdict === "current" || verdict === "unreachable") {
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

  return mustAnswer()
    ? downloadAnsweredFor(cacheDir, source, fullSource)
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
    const result = await downloadTemplate(fullSource, {
      dir: cacheDir,
      force: true, // Always force when downloading to avoid "already exists" error
      offline: false,
    });

    verbose(`Downloaded to: ${result.dir}`);
    await recordFetchedCopy(cacheDir, result);
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

/** Beside the cache directory, as its fetch record is. */
const STAGED_DOWNLOAD_SUFFIX = ".download";

/**
 * giget extracts its own saved tarball when a download fails or is refused, so only the answer
 * after it shows the marketplace served one. Staged, so a refusal leaves the copy and its record.
 */
async function downloadAnsweredFor(
  cacheDir: string,
  source: string,
  fullSource: string,
): Promise<FetchResult> {
  const staged = `${cacheDir}${STAGED_DOWNLOAD_SUFFIX}`;
  await ensureDir(path.dirname(cacheDir));

  try {
    const result = await downloadTemplate(fullSource, {
      dir: staged,
      force: true,
      forceClean: true,
      offline: false,
    });
    const record = await askAfterTheDownload(result, source);
    await replaceCopy(cacheDir, staged, record);
    markCopyCurrentForThisRun(cacheDir);

    return { path: cacheDir, fromCache: false, unreachable: false, source: fullSource };
  } catch (error) {
    if (error instanceof MarketplaceUnreachableError) throw error;
    throw createDetailedFetchError(error, source);
  } finally {
    await remove(staged);
  }
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

/**
 * `unrecorded`: no fetch record beside the cache, so it is re-fetched once, quietly.
 * `unconfirmed`: a load that must reach the marketplace had no ETag pair to hold the copy to.
 */
type CacheVerdict = "current" | "superseded" | "unrecorded" | "unconfirmed" | "unreachable";

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

/** Silent for `unrecorded` and `unconfirmed`, which are housekeeping rather than news. */
function announceRefetch(verdict: Exclude<CacheVerdict, "current" | "unreachable">): void {
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
 * A copy this run just downloaded is current by construction, so later loads do not re-fetch it.
 */
function markCopyCurrentForThisRun(cacheDir: string): void {
  verdictsThisRun().set(cacheDir, Promise.resolve("current"));
}

/**
 * Warns about an unreachable source here, where the verdict is memoised: once per run. A load that
 * must reach the marketplace asks even with no ETag to compare, and an unanswered one throws.
 */
async function classifyCachedCopy(cacheDir: string, source: string): Promise<CacheVerdict> {
  const record = await readFetchRecord(cacheDir);
  if (!record) return "unrecorded";

  if (record.etag === undefined && !mustAnswer()) {
    verbose(`No ETag was recorded for ${record.tar} — keeping the cached copy`);
    return "current";
  }

  try {
    const live = await fetchEtag(record.tar);
    if (live !== undefined && record.etag !== undefined) {
      return live === record.etag ? "current" : "superseded";
    }
    if (mustAnswer()) return "unconfirmed";

    verbose(`${record.tar} answered without an ETag — keeping the cached copy`);
    return "current";
  } catch (error) {
    if (error instanceof TarballWithheldError) throw createDetailedFetchError(error, source);
    verbose(`Could not revalidate ${record.tar}: ${getErrorMessage(error)}`);
    if (mustAnswer()) throw new MarketplaceUnreachableError(source, getErrorMessage(error));
    warn(sourceUnreachableUsingCache(source));
    return "unreachable";
  }
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
  if (mustAnswer() && !response.ok) throw new TarballWithheldError(response);
  return response.headers.get("etag") ?? undefined;
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

/** The tarball URL is narrowed from giget's untyped result; without one, nothing is recorded. */
async function recordFetchedCopy(cacheDir: string, result: DownloadTemplateResult): Promise<void> {
  const tar = tarballOf(result);
  if (tar === undefined) {
    verbose("No tarball URL came back from the download — the copy cannot be revalidated");
    return;
  }

  const etag = await etagIfAnswered(tar);
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
