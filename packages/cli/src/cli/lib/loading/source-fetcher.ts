import { createHash } from "crypto";
import { isRecord } from "../../utils/type-guards.js";
import { downloadTemplate } from "giget";
import os from "os";
import path from "path";

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
import { ensureDir, directoryExists, readFileSafe, remove } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { isLocalSource } from "../configuration";
import {
  formatZodIssues,
  marketplaceSchema,
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
  forceRefresh?: boolean;
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
  const { forceRefresh = false, subdir } = options;

  if (isLocalSource(source)) {
    return fetchFromLocalSource(source, subdir);
  }

  return fetchFromRemoteSource(source, { forceRefresh, subdir });
}

async function fetchFromLocalSource(source: string, subdir?: string): Promise<FetchResult> {
  const fullPath = subdir ? path.join(source, subdir) : source;
  const absolutePath = path.isAbsolute(fullPath) ? fullPath : path.resolve(process.cwd(), fullPath);

  if (!(await directoryExists(absolutePath))) {
    throw new Error(`Local source not found: '${absolutePath}'`);
  }

  verbose(`Using local source: ${absolutePath}`);

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

async function fetchFromRemoteSource(source: string, options: FetchOptions): Promise<FetchResult> {
  const { forceRefresh = false, subdir } = options;
  const cacheDir = getCacheDir(source);

  const fullSource = subdir ? `${source}/${subdir}` : source;

  verbose(`Fetching from remote: ${fullSource}`);
  verbose(`Cache directory: ${cacheDir}`);

  if (!forceRefresh && (await directoryExists(cacheDir))) {
    verbose(`Using cached source: ${cacheDir}`);
    return {
      path: cacheDir,
      fromCache: true,
      source: fullSource,
    };
  }

  if (forceRefresh) {
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

    return {
      path: result.dir,
      fromCache: false,
      source: fullSource,
    };
  } catch (error) {
    throw createDetailedFetchError(error, source);
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

export async function fetchMarketplace(
  source: string,
  options: FetchOptions = {},
): Promise<MarketplaceFetchResult> {
  const result = await fetchFromSource(source, {
    forceRefresh: options.forceRefresh,
    subdir: "", // Root of repo
  });

  const marketplacePath = marketplaceManifestPath(result.path);

  if (!(await directoryExists(path.dirname(marketplacePath)))) {
    throw new Error(
      `Marketplace not found for source: ${source}\n\n` +
        `The .claude-plugin/marketplace.json file is missing from this repository.\n\n` +
        `Possible causes:\n` +
        "  - The source URL may be incorrect\n" +
        "  - The repository may not have a marketplace configured\n\n" +
        "To create a marketplace, add a .claude-plugin/marketplace.json file to your source repository.",
    );
  }

  const content = await readFileSafe(marketplacePath, MAX_MARKETPLACE_FILE_SIZE);
  const parsed = JSON.parse(content);

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
    fromCache: result.fromCache ?? false,
  };
}
