import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, utimes, writeFile } from "fs/promises";
import {
  createTempDir,
  cleanupTempDir,
  directoryExists,
  fileExists,
} from "../__tests__/test-fs-utils";
import { sanitizeSourceForCache } from "./source-fetcher";

let mockCacheDir: string;

vi.mock("../../utils/logger");

vi.mock("../../consts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../consts")>();
  return {
    ...actual,
    cacheRoot: () => mockCacheDir,
  };
});

vi.mock("giget", () => ({
  downloadTemplate: vi.fn(),
}));

import { fetchFromSource, fetchRecordPath } from "./source-fetcher";
import { downloadTemplate } from "giget";
import { verbose } from "../../utils/logger";

const mockDownloadTemplate = vi.mocked(downloadTemplate);

const SOURCE = "github:org/repo";
const SUBDIR = "skills";
const TARBALL = "https://api.github.com/repos/org/repo/tarball/main";
const CACHED_ETAG = 'W/"cached"';
const PUBLISHED_ETAG = 'W/"published"';
const GIGET_TOKEN = "ghp_test_token";

/** What giget's github provider names `github:org/repo`, and the tarball it saves under it. */
const GIGET_TEMPLATE = "org-repo";
const GIGET_VERSION = "main";
const GIGET_TARBALL = `${GIGET_VERSION}.tar.gz`;

const EARLIER_RUN = new Date("2026-01-01T00:00:00Z");

/** Reached by whatever hands the fetcher a source, a config read included. */
const PRIVATE_SOURCE = "http://127.0.0.1:8080/source.tar.gz";

function headResponse(etag?: string): Response {
  return new Response(null, { headers: etag === undefined ? {} : { etag } });
}

/** The messages a failed download is rewritten into, keyed by what giget's error said. */
const REPOSITORY_NOT_FOUND = [
  `Repository not found: ${SOURCE}`,
  "",
  "This could mean:",
  "  - The repository doesn't exist",
  "  - The repository is private and you need to set authentication",
  "  - There's a typo in the URL",
  "",
  "For private repositories, set the GIGET_AUTH environment variable:",
  "  export GIGET_AUTH=ghp_your_github_token",
].join("\n");

const AUTHENTICATION_REQUIRED = [
  `Authentication required for: ${SOURCE}`,
  "",
  "Set the GIGET_AUTH environment variable with a GitHub token:",
  "  export GIGET_AUTH=ghp_your_github_token",
  "",
  "Create a token at: https://github.com/settings/tokens",
  "Required scope: repo (for private repos) or public_repo (for public)",
].join("\n");

const ACCESS_DENIED = [
  `Access denied to: ${SOURCE}`,
  "",
  "Your token may not have sufficient permissions.",
  "Ensure your GIGET_AUTH token has the 'repo' scope for private repositories.",
].join("\n");

const NETWORK_ERROR = [
  `Network error fetching: ${SOURCE}`,
  "",
  "Please check your internet connection.",
  "If you're behind a corporate proxy, you may need to set:",
  "  export HTTPS_PROXY=http://your-proxy:port",
  "  export FORCE_NODE_FETCH=true  # Required for Node 20+",
].join("\n");

describe("source-fetcher download", () => {
  const originalXdgCacheHome = process.env.XDG_CACHE_HOME;
  const originalGigetAuth = process.env.GIGET_AUTH;

  let tempDir: string;
  let cacheDir: string;
  let recordPath: string;
  let gigetDir: string;
  let gigetCacheHeldAtDownload: boolean | undefined;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-fetcher-download-");
    mockCacheDir = path.join(tempDir, "cache");
    cacheDir = path.join(mockCacheDir, "sources", sanitizeSourceForCache(SOURCE));
    recordPath = fetchRecordPath(cacheDir);
    process.env.XDG_CACHE_HOME = path.join(tempDir, "xdg");
    gigetDir = path.join(tempDir, "xdg", "giget", "github", GIGET_TEMPLATE);
    gigetCacheHeldAtDownload = undefined;
    delete process.env.GIGET_AUTH;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (originalXdgCacheHome === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = originalXdgCacheHome;
    if (originalGigetAuth === undefined) delete process.env.GIGET_AUTH;
    else process.env.GIGET_AUTH = originalGigetAuth;
    await cleanupTempDir(tempDir);
  });

  /**
   * A download, as giget's: it saves the tarball it fetched, then extracts it. Notes whether giget's
   * cache held anything when it ran. `withoutTarball` stands for a provider giget resolves no
   * tarball URL for.
   */
  function stubDownload({ withoutTarball = false } = {}): void {
    mockDownloadTemplate.mockImplementation(async (source, options) => {
      gigetCacheHeldAtDownload = await directoryExists(gigetDir);
      await mkdir(gigetDir, { recursive: true });
      await writeFile(path.join(gigetDir, GIGET_TARBALL), "tarball this download fetched");
      const dir = options?.dir ?? cacheDir;
      await mkdir(dir, { recursive: true });
      const template = { source, dir, name: GIGET_TEMPLATE, version: GIGET_VERSION };
      return withoutTarball ? template : { ...template, tar: TARBALL };
    });
  }

  async function seedCachedCopy(record: string): Promise<void> {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(recordPath, record);
  }

  /** Saved by an earlier run, so older than anything a download in this test writes. */
  async function seedGigetCache(): Promise<void> {
    await mkdir(gigetDir, { recursive: true });
    const tarball = path.join(gigetDir, GIGET_TARBALL);
    await writeFile(tarball, "tarball");
    await utimes(tarball, EARLIER_RUN, EARLIER_RUN);
  }

  it("downloads into the cache directory, forcing over a partial copy and never offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload();

    const result = await fetchFromSource(SOURCE);

    expect(mockDownloadTemplate).toHaveBeenCalledExactlyOnceWith(SOURCE, {
      dir: cacheDir,
      force: true,
      offline: false,
    });
    expect(result).toStrictEqual({
      path: cacheDir,
      fromCache: false,
      unreachable: false,
      source: SOURCE,
    });
  });

  it("downloads a subdirectory of the source and reports it as the source fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload();

    const result = await fetchFromSource(SOURCE, { subdir: SUBDIR });

    expect(mockDownloadTemplate).toHaveBeenCalledExactlyOnceWith(`${SOURCE}/${SUBDIR}`, {
      dir: cacheDir,
      force: true,
      offline: false,
    });
    expect(result.source).toBe(`${SOURCE}/${SUBDIR}`);
    expect(verbose).toHaveBeenCalledWith(`Fetching from remote: ${SOURCE}/${SUBDIR}`);
    expect(verbose).toHaveBeenCalledWith(`Cache directory: ${cacheDir}`);
    expect(verbose).toHaveBeenCalledWith(`Downloaded to: ${cacheDir}`);
  });

  it("says it is using the cached copy when the source still answers with its ETag", async () => {
    await seedCachedCopy(JSON.stringify({ tar: TARBALL, etag: CACHED_ETAG }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));

    await fetchFromSource(SOURCE);

    expect(verbose).toHaveBeenCalledWith(`Using cached marketplace: ${cacheDir}`);
  });

  it("asks without credentials when no token is set", async () => {
    await seedCachedCopy(JSON.stringify({ tar: TARBALL, etag: CACHED_ETAG }));
    const fetchMock = vi.fn().mockResolvedValue(headResponse(CACHED_ETAG));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromSource(SOURCE);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(TARBALL, {
      method: "HEAD",
      signal: expect.any(AbortSignal),
    });
  });

  it("carries the GIGET_AUTH token as a bearer credential when it asks", async () => {
    process.env.GIGET_AUTH = GIGET_TOKEN;
    await seedCachedCopy(JSON.stringify({ tar: TARBALL, etag: CACHED_ETAG }));
    const fetchMock = vi.fn().mockResolvedValue(headResponse(CACHED_ETAG));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromSource(SOURCE);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(TARBALL, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${GIGET_TOKEN}` },
      signal: expect.any(AbortSignal),
    });
  });

  it("keeps the cached copy when the source answers without an ETag, and says so", async () => {
    await seedCachedCopy(JSON.stringify({ tar: TARBALL, etag: CACHED_ETAG }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse()));

    const result = await fetchFromSource(SOURCE);

    expect(result).toStrictEqual({
      path: cacheDir,
      fromCache: true,
      unreachable: false,
      source: SOURCE,
    });
    expect(mockDownloadTemplate).not.toHaveBeenCalled();
    expect(verbose).toHaveBeenCalledWith(
      `${TARBALL} answered without an ETag — keeping the cached copy`,
    );
  });

  it("says no ETag was recorded when it keeps a copy without asking", async () => {
    await seedCachedCopy(JSON.stringify({ tar: TARBALL }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));

    await fetchFromSource(SOURCE);

    expect(verbose).toHaveBeenCalledWith(
      `No ETag was recorded for ${TARBALL} — keeping the cached copy`,
    );
  });

  it("names the reason it could not revalidate an unreachable source", async () => {
    await seedCachedCopy(JSON.stringify({ tar: TARBALL, etag: CACHED_ETAG }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    await fetchFromSource(SOURCE);

    expect(verbose).toHaveBeenCalledWith(`Could not revalidate ${TARBALL}: fetch failed`);
  });

  it.each([
    ["is not JSON", "not json {"],
    ["has no tarball URL", JSON.stringify({ tar: "" })],
  ])(
    "re-fetches a copy whose fetch record %s, and says the record was unusable",
    async (_, record) => {
      await seedCachedCopy(record);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      stubDownload();

      const result = await fetchFromSource(SOURCE);

      expect(result.fromCache).toBe(false);
      expect(mockDownloadTemplate).toHaveBeenCalledOnce();
      expect(verbose).toHaveBeenCalledWith(
        `Unusable fetch record at ${recordPath} — re-fetching the marketplace`,
      );
    },
  );

  it("calls a missing fetch record missing, not unusable", async () => {
    await mkdir(cacheDir, { recursive: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload();

    await fetchFromSource(SOURCE);

    expect(mockDownloadTemplate).toHaveBeenCalledOnce();
    expect(verbose).not.toHaveBeenCalledWith(
      `Unusable fetch record at ${recordPath} — re-fetching the marketplace`,
    );
  });

  it("records nothing when the download names no tarball, and says it cannot revalidate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload({ withoutTarball: true });

    await fetchFromSource(SOURCE);

    expect(await fileExists(recordPath)).toBe(false);
    expect(verbose).toHaveBeenCalledWith(
      "No tarball URL came back from the download — the copy cannot be revalidated",
    );
  });

  it("clears giget's own tarball cache before re-fetching a superseded copy", async () => {
    await seedCachedCopy(JSON.stringify({ tar: TARBALL, etag: CACHED_ETAG }));
    await seedGigetCache();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload();

    await fetchFromSource(SOURCE);

    expect(gigetCacheHeldAtDownload, "giget had nothing saved to fall back on").toBe(false);
    expect(verbose).toHaveBeenCalledWith(`Clearing giget cache: ${gigetDir}`);
  });

  it("says nothing about giget's cache when there is none to clear", async () => {
    await seedCachedCopy(JSON.stringify({ tar: TARBALL, etag: CACHED_ETAG }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload();

    await fetchFromSource(SOURCE);

    expect(verbose).not.toHaveBeenCalledWith(`Clearing giget cache: ${gigetDir}`);
  });

  /** The refusals beside "downloads into the cache directory, forcing over a partial copy". */
  it("refuses a private address before asking anything of it, downloading nothing", async () => {
    const asked = vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG));
    vi.stubGlobal("fetch", asked);
    stubDownload();

    await expect(fetchFromSource(PRIVATE_SOURCE)).rejects.toThrow(
      `The marketplace points to a private or reserved IP address: "${PRIVATE_SOURCE}"`,
    );
    expect(mockDownloadTemplate).not.toHaveBeenCalled();
    expect(asked).not.toHaveBeenCalled();
  });

  it("refuses a private address it holds a cached copy of, sending it no revalidation", async () => {
    const privateCacheDir = path.join(
      mockCacheDir,
      "sources",
      sanitizeSourceForCache(PRIVATE_SOURCE),
    );
    await mkdir(privateCacheDir, { recursive: true });
    await writeFile(
      fetchRecordPath(privateCacheDir),
      JSON.stringify({ tar: PRIVATE_SOURCE, etag: CACHED_ETAG }),
    );
    const asked = vi.fn().mockResolvedValue(headResponse(CACHED_ETAG));
    vi.stubGlobal("fetch", asked);

    await expect(fetchFromSource(PRIVATE_SOURCE)).rejects.toThrow(
      "points to a private or reserved IP address",
    );
    expect(asked).not.toHaveBeenCalled();
  });

  it("leaves giget's own cache alone on a first download", async () => {
    await seedGigetCache();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload();

    await fetchFromSource(SOURCE);

    expect(gigetCacheHeldAtDownload).toBe(true);
  });

  it.each([
    ["404", "404 Not Found", REPOSITORY_NOT_FOUND],
    ["404 by code", "Failed to download: 404", REPOSITORY_NOT_FOUND],
    ["404 by phrase", "Not Found", REPOSITORY_NOT_FOUND],
    ["401 by code", "status 401", AUTHENTICATION_REQUIRED],
    ["401 by phrase", "Unauthorized", AUTHENTICATION_REQUIRED],
    ["403 by code", "status 403", ACCESS_DENIED],
    ["403 by phrase", "Forbidden", ACCESS_DENIED],
    ["an unknown host", "getaddrinfo ENOTFOUND github.com", NETWORK_ERROR],
    ["a timeout", "connect ETIMEDOUT", NETWORK_ERROR],
    ["a network failure", "network request failed", NETWORK_ERROR],
    [
      "anything else",
      "connection reset by peer",
      `Failed to fetch ${SOURCE}: connection reset by peer`,
    ],
  ])("rewrites a download that failed with %s into its remedy", async (_, reason, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    mockDownloadTemplate.mockRejectedValue(new Error(reason));

    await expect(fetchFromSource(SOURCE)).rejects.toMatchObject({ message: expected });
  });
});
