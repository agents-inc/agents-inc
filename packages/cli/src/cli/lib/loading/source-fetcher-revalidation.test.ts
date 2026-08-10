import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, rm, writeFile, readFile, readdir } from "fs/promises";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { sanitizeSourceForCache } from "./source-fetcher";

let mockCacheDir: string;

vi.mock("../../utils/logger");

vi.mock("../../consts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../consts")>();
  return {
    ...actual,
    get CACHE_DIR() {
      return mockCacheDir;
    },
  };
});

vi.mock("giget", () => ({
  downloadTemplate: vi.fn(),
}));

import { fetchFromSource } from "./source-fetcher";
import { downloadTemplate } from "giget";
import { log, warn } from "../../utils/logger";
import { sourceUnreachableUsingCache, STATUS_MESSAGES } from "../../utils/messages";

const mockDownloadTemplate = vi.mocked(downloadTemplate);

const SOURCE = "github:org/repo";
const TARBALL = "https://api.github.com/repos/org/repo/tarball/main";
const CACHED_ETAG = 'W/"cached"';
const PUBLISHED_ETAG = 'W/"published"';
const ORPHAN_FILE = "orphan-skill.md";
const FRESH_FILE = "new-skill.md";

/** A HEAD response carrying `etag`, or none at all when the host sends none. */
function headResponse(etag?: string): Response {
  return new Response(null, { headers: etag === undefined ? {} : { etag } });
}

describe("source-fetcher revalidation", () => {
  let tempDir: string;
  let cacheDir: string;
  let recordPath: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-source-fetcher-revalidation-");
    mockCacheDir = path.join(tempDir, "cache");
    cacheDir = path.join(mockCacheDir, "sources", sanitizeSourceForCache(SOURCE));
    recordPath = `${cacheDir}.etag.json`;
    await mkdir(cacheDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanupTempDir(tempDir);
  });

  /** A cache directory as a previous run left it: content, plus what it was fetched from. */
  async function seedCachedCopy(record?: { tar: string; etag?: string }): Promise<void> {
    await writeFile(path.join(cacheDir, ORPHAN_FILE), "content from the previous fetch");
    if (record) await writeFile(recordPath, JSON.stringify(record));
  }

  /** A download that replaces the cache directory's content, as giget's extract does. */
  function stubDownload(): void {
    mockDownloadTemplate.mockImplementation(async (source, options) => {
      const dir = options?.dir ?? cacheDir;
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, FRESH_FILE), "content from this fetch");
      return { source, dir, tar: TARBALL };
    });
  }

  it("serves the cached copy when the source still answers with the recorded ETag", async () => {
    await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
    const fetchMock = vi.fn().mockResolvedValue(headResponse(CACHED_ETAG));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchFromSource(SOURCE);

    expect(result.fromCache).toBe(true);
    expect(result.path).toBe(cacheDir);
    expect(mockDownloadTemplate).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(TARBALL);
    expect(fetchMock.mock.calls[0]?.[1]).toStrictEqual(expect.objectContaining({ method: "HEAD" }));
  });

  it("re-fetches and announces the update when the ETag moved", async () => {
    await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload();

    const result = await fetchFromSource(SOURCE);

    expect(result.fromCache).toBe(false);
    expect(mockDownloadTemplate).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT);

    const files = await readdir(result.path);
    expect(files, "the previous copy's files do not survive the update").not.toContain(ORPHAN_FILE);
    expect(files).toContain(FRESH_FILE);
  });

  it("re-fetches a cache it has no record for, without claiming the source moved on", async () => {
    await seedCachedCopy();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload();

    const result = await fetchFromSource(SOURCE);

    expect(result.fromCache).toBe(false);
    expect(mockDownloadTemplate).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalledWith(STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT);
  });

  it("keeps the cached copy and names its staleness when the source cannot be reached", async () => {
    await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    const result = await fetchFromSource(SOURCE);

    expect(result.fromCache).toBe(true);
    expect(mockDownloadTemplate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(sourceUnreachableUsingCache(SOURCE));
  });

  it("keeps a copy whose record carries no ETag, and does not ask about it", async () => {
    await seedCachedCopy({ tar: TARBALL });
    const fetchMock = vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchFromSource(SOURCE);

    expect(result.fromCache).toBe(true);
    expect(fetchMock, "nothing was recorded to compare against").not.toHaveBeenCalled();
  });

  it("asks once however many times one run loads the same source", async () => {
    await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
    const fetchMock = vi.fn().mockResolvedValue(headResponse(CACHED_ETAG));
    vi.stubGlobal("fetch", fetchMock);

    await fetchFromSource(SOURCE);
    await fetchFromSource(SOURCE, { subdir: "" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mockDownloadTemplate, "an unchanged source transfers no body").not.toHaveBeenCalled();
  });

  it("re-fetches and announces an update once however many times one run loads it", async () => {
    await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload();

    await fetchFromSource(SOURCE);
    const second = await fetchFromSource(SOURCE, { subdir: "" });

    expect(
      mockDownloadTemplate,
      "the update is downloaded once, not once per load",
    ).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledExactlyOnceWith(STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT);
    expect(second.fromCache, "the copy this run just wrote is what the rest of it reads").toBe(
      true,
    );
  });

  it("names an unreachable source's staleness once however many times one run loads it", async () => {
    await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    await fetchFromSource(SOURCE);
    const second = await fetchFromSource(SOURCE, { subdir: "" });

    expect(warn).toHaveBeenCalledExactlyOnceWith(sourceUnreachableUsingCache(SOURCE));
    expect(second.fromCache).toBe(true);
    expect(mockDownloadTemplate).not.toHaveBeenCalled();
  });

  it("downloads a source it holds no copy of once, even when the source moves on mid-run", async () => {
    await rm(cacheDir, { recursive: true });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(headResponse(CACHED_ETAG))
        .mockResolvedValue(headResponse(PUBLISHED_ETAG)),
    );
    stubDownload();

    await fetchFromSource(SOURCE);
    await fetchFromSource(SOURCE, { subdir: "" });

    expect(mockDownloadTemplate, "a cold cache costs one download per run").toHaveBeenCalledOnce();
    expect(
      log,
      "a run cannot call the copy it just downloaded superseded",
    ).not.toHaveBeenCalledWith(STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT);
  });

  it("records the tarball and its ETag after a download, so the next load can ask", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubDownload();

    await fetchFromSource(SOURCE);

    expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
      tar: TARBALL,
      etag: PUBLISHED_ETAG,
    });
  });
});
