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
    cacheRoot: () => mockCacheDir,
  };
});

vi.mock("giget", () => ({
  downloadTemplate: vi.fn(),
}));

import {
  askingEachMarketplaceItself,
  fetchFromSource,
  MarketplaceUnreachableError,
} from "./source-fetcher";
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

function headResponse(etag?: string): Response {
  return new Response(null, { headers: etag === undefined ? {} : { etag } });
}

/**
 * Each answer that withholds the tarball, and how its message opens: anchored, so a message
 * wrapped twice fails. GitHub answers a repository gone or private this way, with no ETag; a
 * method refused is the content withheld too, since the question asked is a GET.
 */
const WITHHELD = [
  { status: 404, opens: `Repository not found: ${SOURCE}\n` },
  { status: 401, opens: `Authentication required for: ${SOURCE}\n` },
  { status: 403, opens: `Access denied to: ${SOURCE}\n` },
  { status: 503, opens: `Failed to fetch ${SOURCE}: the marketplace answered 503` },
  { status: 405, opens: `Failed to fetch ${SOURCE}: the marketplace answered 405` },
  { status: 501, opens: `Failed to fetch ${SOURCE}: the marketplace answered 501` },
] as const;

const NOT_FOUND = 404;

const HEAD_METHOD_REFUSED = 405;

function refusal(status: number): Response {
  return new Response(null, { status });
}

/** A host that refuses the HEAD method and serves the GET. */
function refusingOnlyHead(served: Response): (url: string, init?: RequestInit) => Response {
  return (_url, init) => (init?.method === "HEAD" ? refusal(HEAD_METHOD_REFUSED) : served);
}

function opening(text: string): RegExp {
  return new RegExp(`^${text}`);
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
    expect(result.unreachable, "the source answered, so the copy is known to be current").toBe(
      false,
    );
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
    expect(result.unreachable, "the copy stood in for a source nobody could ask").toBe(true);
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
    expect(second.unreachable, "every load this run reads the same stand-in").toBe(true);
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

  describe("asked by a load that must reach the marketplace itself", () => {
    const askingItself = () => askingEachMarketplaceItself(() => fetchFromSource(SOURCE));

    it("refuses the saved copy when the marketplace does not answer, and leaves it on disk", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

      await expect(askingItself()).rejects.toBeInstanceOf(MarketplaceUnreachableError);

      expect(mockDownloadTemplate).not.toHaveBeenCalled();
      expect(warn, "no copy stood in, so none is announced").not.toHaveBeenCalled();
      expect(await readdir(cacheDir), "the copy stays for every other load").toStrictEqual([
        ORPHAN_FILE,
      ]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: CACHED_ETAG,
      });
    });

    it("leaves a load outside it free to read the copy it refused", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

      await expect(askingItself()).rejects.toBeInstanceOf(MarketplaceUnreachableError);
      const outside = await fetchFromSource(SOURCE);

      expect(outside.fromCache).toBe(true);
      expect(outside.unreachable, "outside, the copy stands in as before").toBe(true);
      expect(warn).toHaveBeenCalledWith(sourceUnreachableUsingCache(SOURCE));
    });

    it("reads the copy the marketplace confirms current", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));

      const result = await askingItself();

      expect(result.fromCache).toBe(true);
      expect(result.unreachable).toBe(false);
      expect(mockDownloadTemplate).not.toHaveBeenCalled();
    });

    it("asks about a copy whose record carries no ETag, and refuses it unanswered", async () => {
      await seedCachedCopy({ tar: TARBALL });
      const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
      vi.stubGlobal("fetch", fetchMock);

      await expect(askingItself()).rejects.toBeInstanceOf(MarketplaceUnreachableError);

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0]?.[0]).toBe(TARBALL);
      expect(await readdir(cacheDir)).toStrictEqual([ORPHAN_FILE]);
    });

    it("refuses a download the marketplace did not answer for, leaving no copy or record behind", async () => {
      await rm(cacheDir, { recursive: true });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
      // giget extracts its own saved tarball when the network fails, so the download "succeeds".
      stubDownload();

      await expect(askingItself()).rejects.toBeInstanceOf(MarketplaceUnreachableError);

      expect(
        await readdir(path.dirname(cacheDir)),
        "nothing giget extracted is kept for a later load to read as current",
      ).toStrictEqual([]);
    });

    it("downloads afresh over a copy whose record carries no ETag, never reading it", async () => {
      await seedCachedCopy({ tar: TARBALL });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      stubDownload();

      const result = await askingItself();

      expect(result.fromCache).toBe(false);
      expect(result.path).toBe(cacheDir);
      expect(await readdir(cacheDir), "no fingerprint vouched for the copy").toStrictEqual([
        FRESH_FILE,
      ]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: PUBLISHED_ETAG,
      });
      expect(
        log,
        "a copy nothing could compare is not known to have moved on",
      ).not.toHaveBeenCalledWith(STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT);
    });

    it("downloads afresh when the marketplace answers without an ETag", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse()));
      stubDownload();

      const result = await askingItself();

      expect(result.fromCache).toBe(false);
      expect(await readdir(cacheDir)).toStrictEqual([FRESH_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({ tar: TARBALL });
    });

    it("asks for the content itself, so a host refusing only the HEAD method still says its copy moved on", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn(refusingOnlyHead(headResponse(PUBLISHED_ETAG))));
      stubDownload();

      const result = await askingItself();

      expect(result.fromCache).toBe(false);
      expect(await readdir(cacheDir)).toStrictEqual([FRESH_FILE]);
      expect(log).toHaveBeenCalledWith(STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT);
    });

    it("replaces a copy that moved on, leaving nothing staged beside it", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      stubDownload();

      const result = await askingItself();

      expect(result.fromCache).toBe(false);
      expect(await readdir(cacheDir)).toStrictEqual([FRESH_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: PUBLISHED_ETAG,
      });
      expect(await readdir(path.dirname(cacheDir))).toStrictEqual([
        path.basename(cacheDir),
        path.basename(recordPath),
      ]);
    });

    it("keeps the copy and its record when the download replacing it goes unanswered", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(headResponse(PUBLISHED_ETAG))
          .mockRejectedValue(new Error("fetch failed")),
      );
      stubDownload();

      await expect(askingItself()).rejects.toBeInstanceOf(MarketplaceUnreachableError);

      expect(await readdir(cacheDir), "the copy stays for every other load").toStrictEqual([
        ORPHAN_FILE,
      ]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: CACHED_ETAG,
      });
      expect(await readdir(path.dirname(cacheDir))).toStrictEqual([
        path.basename(cacheDir),
        path.basename(recordPath),
      ]);
    });

    it("leaves a load outside it free to keep the same unanswered download", async () => {
      await rm(cacheDir, { recursive: true });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
      stubDownload();

      const outside = await fetchFromSource(SOURCE);

      expect(outside.fromCache).toBe(false);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({ tar: TARBALL });
    });

    it.each(WITHHELD)(
      "refuses the saved copy when the marketplace answers $status instead of its content, and leaves it on disk",
      async ({ status, opens }) => {
        await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(status)));

        await expect(askingItself()).rejects.toMatchObject({
          message: expect.stringMatching(opening(opens)),
        });

        expect(mockDownloadTemplate).not.toHaveBeenCalled();
        expect(warn, "no copy stood in, so none is announced").not.toHaveBeenCalled();
        expect(await readdir(cacheDir), "the copy stays for every other load").toStrictEqual([
          ORPHAN_FILE,
        ]);
        expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
          tar: TARBALL,
          etag: CACHED_ETAG,
        });
      },
    );

    it("leaves a load outside it free to keep the copy a refusing marketplace withholds", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(NOT_FOUND)));

      await expect(askingItself()).rejects.toThrow(`Repository not found: ${SOURCE}`);
      const outside = await fetchFromSource(SOURCE);

      expect(outside.fromCache).toBe(true);
      expect(outside.path).toBe(cacheDir);
      expect(mockDownloadTemplate).not.toHaveBeenCalled();
    });

    it.each(WITHHELD)(
      "refuses a download the marketplace answers $status for, keeping nothing giget extracted anyway",
      async ({ status, opens }) => {
        await rm(cacheDir, { recursive: true });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(status)));
        // giget extracts its own saved tarball when the download is refused, too.
        stubDownload();

        await expect(askingItself()).rejects.toMatchObject({
          message: expect.stringMatching(opening(opens)),
        });

        expect(await readdir(path.dirname(cacheDir))).toStrictEqual([]);
      },
    );

    it("keeps a download the marketplace serves though it refuses the HEAD method", async () => {
      await rm(cacheDir, { recursive: true });
      vi.stubGlobal("fetch", vi.fn(refusingOnlyHead(headResponse(PUBLISHED_ETAG))));
      stubDownload();

      const result = await askingItself();

      expect(result.fromCache).toBe(false);
      expect(await readdir(result.path)).toStrictEqual([FRESH_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: PUBLISHED_ETAG,
      });
    });

    it("names the marketplace it could not reach", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

      await expect(askingItself()).rejects.toMatchObject({ source: SOURCE });
    });
  });
});
