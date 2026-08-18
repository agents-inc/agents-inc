import { createHash } from "crypto";
import { isRecord } from "../../utils/type-guards.js";
import { downloadTemplate, type DownloadTemplateResult } from "giget";
import os from "os";
import path from "path";
import type { z } from "zod";

import {
  CACHE_DIR,
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
  readFileOptional,
  readFileSafe,
  remove,
  writeFile,
} from "../../utils/fs";
import { log, verbose, warn } from "../../utils/logger";
import { sourceUnreachableUsingCache, STATUS_MESSAGES } from "../../utils/messages";
import { DEFAULT_SOURCE, isLocalSource } from "../configuration";
import {
  formatZodIssues,
  marketplaceSchema,
  sourceRevalidationSchema,
  validateNestingDepth,
  warnUnknownFields,
} from "../schemas";
import type { MarketplaceFetchResult } from "../../types";

/** Safe name pattern: alphanumeric, hyphens, underscores, dots, spaces, @, / (no shell metacharacters) */
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9@._/ -]+$/;
const MAX_NAME_LENGTH = 200;

/** Matches giget's source protocol regex to extract provider name */
const SOURCE_PROTO_RE = /^([\w-.]+):/;

/**
 * Matches giget's input regex for git URI parsing.
 * Groups: repo (org/name), subdir (optional path), ref (optional #branch)
 */
const GIT_URI_RE = /^(?<repo>[\w.-]+\/[\w.-]+)(?<subdir>[^#]+)?(?<ref>#[\w./@-]+)?/;

export type FetchOptions = {
  subdir?: string;
};

export type FetchResult = {
  path: string;
  fromCache: boolean;
  source: string;
};

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
  return path.join(CACHE_DIR, "sources", sanitized);
}

export async function fetchFromSource(
  source: string,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const { subdir } = options;

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
    source,
  };
}

/**
 * Compute the giget tarball cache directory for a source.
 *
 * Replicates giget's internal cache path logic:
 *   `{cacheRoot}/{providerName}/{templateName}`
 *
 * where templateName is `repo.replace("/", "-")` sanitized to `[a-zA-Z0-9-]`.
 * Returns undefined if the source format doesn't match giget's git URI pattern.
 */
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

/**
 * Clear giget's tarball/ETag cache for a source so downloadTemplate()
 * performs a fresh fetch instead of short-circuiting with a stale ETag.
 */
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
    const cached: FetchResult = { path: cacheDir, fromCache: true, source: fullSource };

    if (verdict === "current" || verdict === "unreachable") {
      verbose(`Using cached marketplace: ${cacheDir}`);
      return cached;
    }

    announceRefetch(verdict);
    await clearGigetCache(source);
    await remove(cacheDir);
  }

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
      source: fullSource,
    };
  } catch (error) {
    throw createDetailedFetchError(error, source);
  }
}

/**
 * What a revalidation learned about the copy in the cache.
 *
 * `unrecorded` is a cache with no fetch record beside it — written before this
 * check existed, or by hand. Nothing can be asked about it, so it is re-fetched
 * once to establish a record, and that re-fetch is not a change to announce.
 */
type CacheVerdict = "current" | "superseded" | "unrecorded" | "unreachable";

type SourceRevalidation = z.infer<typeof sourceRevalidationSchema>;

/**
 * How long a revalidation may spend asking before the cached copy is used
 * instead. Against the default marketplace the question costs ~260ms, so five
 * seconds is around twenty times a healthy answer: a link slow enough to need
 * that much is still given the chance to answer, rather than being told its copy
 * may be stale when the source was reachable all along. Being unreachable is the
 * rare case, and a longer honest wait for it is cheaper than a wrong verdict on
 * a slow one. The bound still exists — the platform's own connect timeout is
 * ~10s, which is the wait no user with a dropped connection should sit through
 * for an answer their cache already holds.
 */
const REVALIDATION_TIMEOUT_MS = 5000;

/** Where a cache directory's fetch record sits: beside it, never inside it. */
const FETCH_RECORD_SUFFIX = ".etag.json";

/**
 * One question per source per process. A single command loads the same source
 * more than once — the matrix and the marketplace label are separate calls — and
 * the answer cannot change between them.
 */
const askedThisRun = new Map<string, Promise<CacheVerdict>>();

/**
 * The one line a re-fetch nobody asked for owes the user — and silence for
 * `unrecorded`, where the CLI cannot place the copy it holds and the re-fetch is
 * housekeeping rather than news.
 *
 * The parameter is the two verdicts that reach a download, not the whole union:
 * a new verdict that must not fall through to one fails here at the call site.
 */
function announceRefetch(verdict: Extract<CacheVerdict, "superseded" | "unrecorded">): void {
  if (verdict === "superseded") {
    log(STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT);
  }
}

function revalidateCachedCopy(cacheDir: string, source: string): Promise<CacheVerdict> {
  const asked = askedThisRun.get(cacheDir);
  if (asked) return asked;

  const verdict = classifyCachedCopy(cacheDir, source);
  askedThisRun.set(cacheDir, verdict);
  return verdict;
}

/**
 * The answer for a copy this run has just downloaded, without asking for it: the
 * record written beside it names the tarball the source served a moment ago, so
 * within this run the copy is current by construction. Without it, the later
 * loads of the same command re-read a `superseded` answer that was true when it
 * was given and has been acted on since — and download it all over again.
 */
function markCopyCurrentForThisRun(cacheDir: string): void {
  askedThisRun.set(cacheDir, Promise.resolve("current"));
}

/**
 * The one question a run asks about a cached copy, and everything that answer
 * owes the user.
 *
 * An unreachable source's staleness is named here rather than at the call site
 * because the verdict is memoised and the line is owed once per source per run:
 * left outside, every later load of the same run repeats a warning about a
 * question that was only asked once.
 */
async function classifyCachedCopy(cacheDir: string, source: string): Promise<CacheVerdict> {
  const record = await readFetchRecord(cacheDir);
  if (!record) return "unrecorded";

  if (record.etag === undefined) {
    verbose(`No ETag was recorded for ${record.tar} — keeping the cached copy`);
    return "current";
  }

  try {
    const live = await fetchEtag(record.tar);
    if (live === undefined) {
      verbose(`${record.tar} answered without an ETag — keeping the cached copy`);
      return "current";
    }
    return live === record.etag ? "current" : "superseded";
  } catch (error) {
    verbose(`Could not revalidate ${record.tar}: ${getErrorMessage(error)}`);
    warn(sourceUnreachableUsingCache(source));
    return "unreachable";
  }
}

/**
 * The tarball's ETag as the host reports it now, asked for the same way giget
 * asks — a HEAD, from the same runtime — so the two agree on what the value for
 * a given source is. A private repository needs the token giget uses; it is read
 * from the environment per request and never written into the record.
 */
async function fetchEtag(tar: string): Promise<string | undefined> {
  const auth = process.env.GIGET_AUTH;
  const response = await fetch(tar, {
    method: "HEAD",
    ...(auth && { headers: { Authorization: `Bearer ${auth}` } }),
    signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
  });
  return response.headers.get("etag") ?? undefined;
}

function fetchRecordPath(cacheDir: string): string {
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
 * Records what would prove this copy current, so the next load can ask in one
 * request.
 *
 * The tarball URL is read off giget's own result rather than rebuilt here, which
 * is what keeps this provider-agnostic — it is whatever giget resolved for the
 * source. giget's result type erases its fields to an index signature, so the
 * value arrives untyped and is narrowed rather than trusted; without one there
 * is nothing to ask about and the copy stays unrecorded.
 */
async function recordFetchedCopy(cacheDir: string, result: DownloadTemplateResult): Promise<void> {
  const tar: unknown = result.tar;
  if (typeof tar !== "string") {
    verbose("No tarball URL came back from the download — the copy cannot be revalidated");
    return;
  }

  const etag = await fetchEtag(tar).catch(() => undefined);
  const record: SourceRevalidation = { tar, ...(etag !== undefined && { etag }) };
  await writeFile(fetchRecordPath(cacheDir), JSON.stringify(record));
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

export async function fetchMarketplace(source: string): Promise<MarketplaceFetchResult> {
  const result = await fetchFromSource(source, {
    subdir: "", // Root of repo
  });

  const marketplacePath = marketplaceManifestPath(result.path);

  if (!(await directoryExists(path.dirname(marketplacePath)))) {
    throw new Error(
      `Marketplace not found at: ${source}\n\n` +
        `The .claude-plugin/marketplace.json file is missing from this repository.\n\n` +
        `Possible causes:\n` +
        "  - The marketplace URL may be incorrect\n" +
        "  - The repository may not have a marketplace configured\n\n" +
        "To create a marketplace, add a .claude-plugin/marketplace.json file to your marketplace repository.",
    );
  }

  const content = await readFileSafe(marketplacePath, MAX_MARKETPLACE_FILE_SIZE);
  const parsed: unknown = JSON.parse(content);

  if (!validateNestingDepth(parsed, MAX_JSON_NESTING_DEPTH)) {
    throw new Error(
      `Invalid marketplace.json at: ${marketplacePath}\n\n` +
        `JSON structure exceeds maximum nesting depth of ${MAX_JSON_NESTING_DEPTH}.`,
    );
  }

  const validation = marketplaceSchema.safeParse(parsed);

  if (!validation.success) {
    throw new Error(
      `Invalid marketplace.json at: ${marketplacePath}\n\n` +
        `Validation errors: ${formatZodIssues(validation.error.issues)}`,
    );
  }

  const marketplace = validation.data;

  const EXPECTED_MARKETPLACE_KEYS = [
    "$schema",
    "name",
    "version",
    "description",
    "owner",
    "metadata",
    "plugins",
  ] as const;
  if (isRecord(parsed)) {
    warnUnknownFields(parsed, EXPECTED_MARKETPLACE_KEYS, MARKETPLACE_JSON);
  }

  if (marketplace.plugins.length > MAX_MARKETPLACE_PLUGINS) {
    throw new Error(
      `Invalid marketplace.json at: ${marketplacePath}\n\n` +
        `Too many plugins: ${marketplace.plugins.length} (limit: ${MAX_MARKETPLACE_PLUGINS}).`,
    );
  }

  for (const plugin of marketplace.plugins) {
    if (plugin.name.length > MAX_NAME_LENGTH) {
      warn(
        `Marketplace plugin name too long (${plugin.name.length} chars): '${plugin.name.slice(0, 50)}...'`,
      );
    }
    if (!SAFE_NAME_PATTERN.test(plugin.name)) {
      warn(`Marketplace plugin name contains unsafe characters: '${plugin.name.slice(0, 50)}'`);
    }
  }

  verbose(`Loaded marketplace: ${marketplace.name} v${marketplace.version}`);

  return {
    marketplace,
    sourcePath: result.path,
    fromCache: result.fromCache,
  };
}
