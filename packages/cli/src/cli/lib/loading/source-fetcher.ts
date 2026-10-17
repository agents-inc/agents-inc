import { createHash } from "crypto";
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
import { DEFAULT_SOURCE, isLocalSource } from "../configuration";
import { validateLoadedMarketplaceName } from "../marketplace-generator";
import {
  formatZodIssues,
  marketplaceSchema,
  sourceRevalidationSchema,
  validateNestingDepth,
  warnUnknownFields,
} from "../schemas";
import type { Marketplace, MarketplaceFetchResult } from "../../types";

/** Safe name pattern: alphanumeric, hyphens, underscores, dots, spaces, @, / (no shell metacharacters) */
const SAFE_NAME_PATTERN = /^[a-zA-Z0-9@._/ -]+$/;
const MAX_NAME_LENGTH = 200;

/** Matches giget's source protocol regex to extract provider name */
const SOURCE_PROTO_RE = /^([\w-.]+):/;

/** giget's git URI regex. Groups: repo (org/name), subdir, ref (#branch). */
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
  return path.join(cacheRoot(), "sources", sanitized);
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

/** `unrecorded`: no fetch record beside the cache, so it is re-fetched once, quietly. */
type CacheVerdict = "current" | "superseded" | "unrecorded" | "unreachable";

type SourceRevalidation = z.infer<typeof sourceRevalidationSchema>;

/** About twenty times a healthy answer, and half the platform's ~10s connect timeout. */
const REVALIDATION_TIMEOUT_MS = 5000;

/** Where a cache directory's fetch record sits: beside it, never inside it. */
const FETCH_RECORD_SUFFIX = ".etag.json";

/** One question per source per process: a command loads the same source more than once. */
const askedThisRun = new Map<string, Promise<CacheVerdict>>();

/** Silent for `unrecorded`, which is housekeeping rather than news. */
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
 * A copy this run just downloaded is current by construction, so later loads do not re-fetch it.
 */
function markCopyCurrentForThisRun(cacheDir: string): void {
  askedThisRun.set(cacheDir, Promise.resolve("current"));
}

/** Warns about an unreachable source here, where the verdict is memoised: once per run. */
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

/** A HEAD from the same runtime as giget, so the two agree; the token is never stored. */
async function fetchEtag(tar: string): Promise<string | undefined> {
  const auth = process.env.GIGET_AUTH;
  const response = await fetch(tar, {
    method: "HEAD",
    ...(auth && { headers: { Authorization: `Bearer ${auth}` } }),
    signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
  });
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
  const result = await fetchFromSource(source, {
    subdir: "", // Root of repo
  });

  const marketplacePath = marketplaceManifestPath(result.path);

  // The file, not its directory: a plugin repo ships `.claude-plugin/` with no marketplace in it.
  if (!(await fileExists(marketplacePath))) {
    throw new MarketplaceManifestAbsentError(
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
    throw manifestRefusal(marketplacePath, validation.error.issues);
  }

  const marketplace = validation.data;

  const reservedName = validateLoadedMarketplaceName(marketplace.name, LOADED_NAME_WAY_OUT);
  if (reservedName) {
    throw new MarketplaceNameRefusedError(
      `Invalid ${MARKETPLACE_JSON} at: ${marketplacePath}\n\n${reservedName}`,
    );
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
