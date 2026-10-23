import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { chmod, mkdir, rm, writeFile, readFile, readdir, utimes } from "fs/promises";
import { createTempDir, cleanupTempDir, fileExists } from "../__tests__/test-fs-utils";
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
  fetchRecordPath,
  MarketplaceUnreachableError,
} from "./source-fetcher";
import { downloadTemplate } from "giget";
import { marketplaceManifestPath } from "../../consts";
import { log, warn } from "../../utils/logger";
import { sourceUnreachableUsingCache, STATUS_MESSAGES } from "../../utils/messages";

const mockDownloadTemplate = vi.mocked(downloadTemplate);

const SOURCE = "github:org/repo";
const TARBALL = "https://api.github.com/repos/org/repo/tarball/main";
const CACHED_ETAG = 'W/"cached"';
const PUBLISHED_ETAG = 'W/"published"';
const ORPHAN_FILE = "orphan-skill.md";
const FRESH_FILE = "new-skill.md";
const FRESH_CONTENT = "content from this fetch";
const SAVED_FILE = "saved-skill.md";

/** What giget's github provider names `github:org/repo`: its cache keeps `main.tar.gz` under it. */
const GIGET_TEMPLATE = "org-repo";
const GIGET_VERSION = "main";

/** A ref as giget's github provider resolves it: `version` names the tarball it saves. */
type GigetRef = { source: string; tar: string; version: string };

const MAIN: GigetRef = { source: SOURCE, tar: TARBALL, version: GIGET_VERSION };

/** giget saves this branch's tarball a folder deeper than any other: `feature/x.tar.gz`. */
const SLASHED_BRANCH: GigetRef = {
  source: `${SOURCE}#feature/x`,
  tar: "https://api.github.com/repos/org/repo/tarball/feature/x",
  version: "feature/x",
};

/** Saved by an earlier run: older than anything a download in this test writes. */
const EARLIER_RUN = new Date("2026-01-01T00:00:00Z");

/** Mirrors `ONLY_A_SAVED_COPY_CAME_BACK`. */
const DOWNLOAD_FAILED = "the download failed and only a saved copy came back";

/** giget's own words for a download it could not answer from a saved tarball. */
const GIGET_DOWNLOAD_REFUSED = `Failed to download ${TARBALL}: 503 Service Unavailable`;

const SAVED_TARBALL_CONTENT = "tarball an earlier download saved";
const FETCHED_TARBALL_CONTENT = "tarball this download fetched";
const PARTIAL_TARBALL_CONTENT = "the first half of a tarball";

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
  const originalXdgCacheHome = process.env.XDG_CACHE_HOME;

  let tempDir: string;
  let cacheDir: string;
  let recordPath: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-source-fetcher-revalidation-");
    mockCacheDir = path.join(tempDir, "cache");
    cacheDir = cacheDirOf(SOURCE);
    recordPath = `${cacheDir}.etag.json`;
    process.env.XDG_CACHE_HOME = path.join(tempDir, "xdg");
    await mkdir(cacheDir, { recursive: true });
    vi.clearAllMocks();
  });

  function cacheDirOf(source: string): string {
    return path.join(mockCacheDir, "sources", sanitizeSourceForCache(source));
  }

  function gigetTarballOf({ version }: GigetRef): string {
    return path.join(tempDir, "xdg", "giget", "github", GIGET_TEMPLATE, `${version}.tar.gz`);
  }

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (originalXdgCacheHome === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = originalXdgCacheHome;
    await cleanupTempDir(tempDir);
  });

  async function seedCachedCopy(record?: { tar: string; etag?: string }): Promise<void> {
    await writeFile(path.join(cacheDir, ORPHAN_FILE), "content from the previous fetch");
    if (record) await writeFile(recordPath, JSON.stringify(record));
  }

  /** The tarball giget saved on an earlier run, beside the record of the ETag it was saved under. */
  async function seedGigetTarball(etag?: string, ref: GigetRef = MAIN): Promise<void> {
    const tarball = gigetTarballOf(ref);
    await mkdir(path.dirname(tarball), { recursive: true });
    await writeFile(tarball, SAVED_TARBALL_CONTENT);
    await writeFile(`${tarball}.json`, JSON.stringify(etag === undefined ? {} : { etag }));
    await utimes(tarball, EARLIER_RUN, EARLIER_RUN);
  }

  type GigetAnswer = Parameters<typeof mockDownloadTemplate.mockImplementation>[0];
  type GigetOptions = Parameters<GigetAnswer>[1];

  /** Where giget extracts, emptied first when asked to, as giget's `forceClean` does. */
  async function extractionDir(options: GigetOptions): Promise<string> {
    const dir = options?.dir ?? cacheDir;
    if (options?.forceClean) await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * A download, as giget's: it saves the tarball it fetched and, once that completes, the record
   * beside it, then extracts the tarball over the directory.
   */
  function downloading(ref: GigetRef): GigetAnswer {
    return async (source, options) => {
      const tarball = gigetTarballOf(ref);
      await mkdir(path.dirname(tarball), { recursive: true });
      await writeFile(tarball, FETCHED_TARBALL_CONTENT);
      await writeFile(`${tarball}.json`, JSON.stringify({}));
      const dir = await extractionDir(options);
      await writeFile(path.join(dir, FRESH_FILE), FRESH_CONTENT);
      return { source, dir, tar: ref.tar, name: GIGET_TEMPLATE, version: ref.version };
    };
  }

  /**
   * giget's answer when its download fails, and when its own ETag check passes: the tarball it saved
   * earlier, extracted, with nothing written to its cache and nothing in the result to say so.
   */
  function extractingSaved(ref: GigetRef): GigetAnswer {
    return async (source, options) => {
      const dir = await extractionDir(options);
      await writeFile(path.join(dir, SAVED_FILE), "content from the tarball giget saved");
      return { source, dir, tar: ref.tar, name: GIGET_TEMPLATE, version: ref.version };
    };
  }

  /** A download giget could not answer from a saved tarball: it throws, extracting nothing. */
  const refusingTheDownload: GigetAnswer = async () => {
    throw new Error(GIGET_DOWNLOAD_REFUSED);
  };

  function stubDownload(ref: GigetRef = MAIN): void {
    mockDownloadTemplate.mockImplementation(downloading(ref));
  }

  function stubSavedTarballExtract(ref: GigetRef = MAIN): void {
    mockDownloadTemplate.mockImplementation(extractingSaved(ref));
  }

  /**
   * giget while the marketplace answers with the ETag its tarball was saved under: that tarball,
   * extracted, for as long as it is there; once it is gone, giget has to fetch, as `afterwards` does.
   */
  function stubGigetEtagCheckPassing(
    afterwards: GigetAnswer = downloading(MAIN),
    ref: GigetRef = MAIN,
  ): void {
    mockDownloadTemplate.mockImplementation(async (source, options) =>
      (await fileExists(gigetTarballOf(ref)))
        ? extractingSaved(ref)(source, options)
        : afterwards(source, options),
    );
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

  it("records the tarball giget saved under the ETag it was saved with, never the marketplace's new one", async () => {
    await rm(cacheDir, { recursive: true });
    await seedGigetTarball(CACHED_ETAG);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubSavedTarballExtract();

    const result = await fetchFromSource(SOURCE);

    expect(await readdir(result.path), "a load outside doctor may read it").toStrictEqual([
      SAVED_FILE,
    ]);
    expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
      tar: TARBALL,
      etag: CACHED_ETAG,
    });
  });

  it("records no ETag for a tarball giget saved without one", async () => {
    await rm(cacheDir, { recursive: true });
    await seedGigetTarball();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    stubSavedTarballExtract();

    await fetchFromSource(SOURCE);

    expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({ tar: TARBALL });
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

    it("downloads afresh over a copy the marketplace confirms current, never reading it", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));
      stubDownload();

      const result = await askingItself();

      expect(result.fromCache).toBe(false);
      expect(result.unreachable).toBe(false);
      expect(mockDownloadTemplate).toHaveBeenCalledOnce();
      expect(await readdir(cacheDir), "a matching ETag vouches for nothing").toStrictEqual([
        FRESH_FILE,
      ]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: CACHED_ETAG,
      });
      expect(log, "a copy the marketplace confirmed has not moved on").not.toHaveBeenCalledWith(
        STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT,
      );
    });

    it("downloads once however many times one run loads the marketplace", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));
      stubDownload();

      const second = await askingEachMarketplaceItself(async () => {
        await fetchFromSource(SOURCE);
        return fetchFromSource(SOURCE, { subdir: "" });
      });

      expect(mockDownloadTemplate, "one download per marketplace per run").toHaveBeenCalledOnce();
      expect(second.path).toBe(cacheDir);
      expect(
        second.fromCache,
        "the copy this run just downloaded is what the rest of it reads",
      ).toBe(true);
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
      await seedGigetTarball(CACHED_ETAG);
      stubSavedTarballExtract();

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
        await seedGigetTarball(CACHED_ETAG);
        stubSavedTarballExtract();

        await expect(askingItself()).rejects.toMatchObject({
          message: expect.stringMatching(opening(opens)),
        });

        expect(await readdir(path.dirname(cacheDir))).toStrictEqual([]);
      },
    );

    it("refuses the tarball giget saved when its download fails over a copy that moved on, keeping the copy and its record", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      await seedGigetTarball(CACHED_ETAG);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      stubSavedTarballExtract();

      await expect(askingItself()).rejects.toMatchObject({
        name: "MarketplaceUnreachableError",
        source: SOURCE,
        reason: DOWNLOAD_FAILED,
      });

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

    it("refuses the tarball giget saved when the marketplace answers with another ETag, keeping nothing", async () => {
      await rm(cacheDir, { recursive: true });
      await seedGigetTarball(CACHED_ETAG);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      stubSavedTarballExtract();

      await expect(askingItself()).rejects.toMatchObject({ reason: DOWNLOAD_FAILED });

      expect(await readdir(path.dirname(cacheDir))).toStrictEqual([]);
    });

    it("refuses the tarball giget saved without an ETag to hold it to", async () => {
      await rm(cacheDir, { recursive: true });
      await seedGigetTarball();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      stubSavedTarballExtract();

      await expect(askingItself()).rejects.toMatchObject({ reason: DOWNLOAD_FAILED });

      expect(await readdir(path.dirname(cacheDir))).toStrictEqual([]);
    });

    it("downloads past the tarball giget saved when the marketplace answers with the ETag it was saved under", async () => {
      await rm(cacheDir, { recursive: true });
      await seedGigetTarball(PUBLISHED_ETAG);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      stubGigetEtagCheckPassing();

      const result = await askingItself();

      expect(result.fromCache).toBe(false);
      expect(await readdir(result.path), "giget's saved tarball is a saved copy too").toStrictEqual(
        [FRESH_FILE],
      );
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: PUBLISHED_ETAG,
      });
      expect(await readFile(gigetTarballOf(MAIN), "utf-8")).toBe(FETCHED_TARBALL_CONTENT);
      expect(
        await readdir(path.dirname(gigetTarballOf(MAIN))),
        "nothing set aside is left beside the tarball the download saved",
      ).toStrictEqual([`${GIGET_VERSION}.tar.gz`, `${GIGET_VERSION}.tar.gz.json`]);
    });

    it("downloads past the tarball giget saved over a copy the marketplace confirms current", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: PUBLISHED_ETAG });
      await seedGigetTarball(PUBLISHED_ETAG);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      stubGigetEtagCheckPassing();

      const result = await askingItself();

      expect(mockDownloadTemplate).toHaveBeenCalledTimes(2);
      expect(await readdir(result.path)).toStrictEqual([FRESH_FILE]);
      expect(await readFile(gigetTarballOf(MAIN), "utf-8")).toBe(FETCHED_TARBALL_CONTENT);
    });

    it("leaves giget no record beside the tarball an unfinished download past its saved one is writing", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: PUBLISHED_ETAG });
      await seedGigetTarball(PUBLISHED_ETAG);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      let reachHalfway = () => {};
      const halfway = new Promise<void>((resolve) => {
        reachHalfway = resolve;
      });
      stubGigetEtagCheckPassing(async () => {
        await writeFile(gigetTarballOf(MAIN), PARTIAL_TARBALL_CONTENT);
        reachHalfway();
        return new Promise<never>(() => {});
      });

      void askingItself();
      await halfway;

      expect(
        await fileExists(`${gigetTarballOf(MAIN)}.json`),
        "giget extracts a tarball unfetched while its record names the marketplace's ETag",
      ).toBe(false);
    });

    it("keeps the tarball giget saved, the copy and its record when the download past that tarball fails", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: PUBLISHED_ETAG });
      await seedGigetTarball(PUBLISHED_ETAG);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      stubGigetEtagCheckPassing(refusingTheDownload);

      await expect(askingItself()).rejects.toThrow(
        `Failed to fetch ${SOURCE}: ${GIGET_DOWNLOAD_REFUSED}`,
      );

      expect(await readdir(cacheDir), "the copy stays for every other load").toStrictEqual([
        ORPHAN_FILE,
      ]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: PUBLISHED_ETAG,
      });
      expect(await readdir(path.dirname(cacheDir)), "nothing is left staged").toStrictEqual([
        path.basename(cacheDir),
        path.basename(recordPath),
      ]);
      expect(await readFile(gigetTarballOf(MAIN), "utf-8")).toBe(SAVED_TARBALL_CONTENT);
      expect(
        await readdir(path.dirname(gigetTarballOf(MAIN))),
        "giget's tarball is back where it was, beside its record",
      ).toStrictEqual([`${GIGET_VERSION}.tar.gz`, `${GIGET_VERSION}.tar.gz.json`]);
    });

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

    describe("telling which saved copies its download replaced, differing from it", () => {
      const replacedAskingItself = () =>
        askingEachMarketplaceItself(async (replaced) => {
          await fetchFromSource(SOURCE);
          return [...replaced];
        });

      const UNREADABLE_FILE = 0o000;

      /** The record, and the file `downloading` extracts, byte for byte. */
      async function seedCopyAsDownloaded(): Promise<void> {
        await writeFile(path.join(cacheDir, FRESH_FILE), FRESH_CONTENT);
        await writeFile(recordPath, JSON.stringify({ tar: TARBALL, etag: CACHED_ETAG }));
      }

      it("names a marketplace whose saved copy lacked a file the download holds", async () => {
        await writeFile(recordPath, JSON.stringify({ tar: TARBALL, etag: CACHED_ETAG }));
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));
        stubDownload();

        expect(await replacedAskingItself()).toStrictEqual([SOURCE]);
      });

      it("names a marketplace whose saved copy holds the download's files with other bytes", async () => {
        await seedCopyAsDownloaded();
        await writeFile(path.join(cacheDir, FRESH_FILE), "content edited on disk");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));
        stubDownload();

        expect(await replacedAskingItself()).toStrictEqual([SOURCE]);
      });

      it("names a marketplace whose saved copy holds a file the download does not", async () => {
        await seedCopyAsDownloaded();
        await writeFile(path.join(cacheDir, ORPHAN_FILE), "content from the previous fetch");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));
        stubDownload();

        expect(await replacedAskingItself()).toStrictEqual([SOURCE]);
      });

      it("names a marketplace whose saved copy holds a dot file the download does not", async () => {
        await seedCopyAsDownloaded();
        const manifest = marketplaceManifestPath(cacheDir);
        await mkdir(path.dirname(manifest));
        await writeFile(manifest, "{}");
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));
        stubDownload();

        expect(await replacedAskingItself()).toStrictEqual([SOURCE]);
      });

      it("names a marketplace whose saved copy holds a file it cannot read, and replaces that copy", async () => {
        await seedCopyAsDownloaded();
        await chmod(path.join(cacheDir, FRESH_FILE), UNREADABLE_FILE);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));
        stubDownload();

        expect(await replacedAskingItself()).toStrictEqual([SOURCE]);
        expect(await readFile(path.join(cacheDir, FRESH_FILE), "utf-8")).toBe(FRESH_CONTENT);
      });

      it("names a marketplace whose saved copy differed because the marketplace moved on", async () => {
        await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
        stubDownload();

        expect(await replacedAskingItself()).toStrictEqual([SOURCE]);
      });

      it("names none when the saved copy matched the download file for file", async () => {
        await seedCopyAsDownloaded();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));
        stubDownload();

        expect(await replacedAskingItself()).toStrictEqual([]);
        expect(mockDownloadTemplate, "it downloaded all the same").toHaveBeenCalledOnce();
      });

      it("names none when there was no saved copy to replace", async () => {
        await rm(cacheDir, { recursive: true });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
        stubDownload();

        expect(await replacedAskingItself()).toStrictEqual([]);
      });
    });
  });

  describe("a marketplace named by a branch whose name holds a slash", () => {
    const askingItself = () =>
      askingEachMarketplaceItself(() => fetchFromSource(SLASHED_BRANCH.source));

    beforeEach(async () => {
      await rm(cacheDir, { recursive: true });
      await seedGigetTarball(CACHED_ETAG, SLASHED_BRANCH);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
    });

    it("records the tarball giget saved a folder deeper under the ETag it was saved with", async () => {
      stubSavedTarballExtract(SLASHED_BRANCH);

      const result = await fetchFromSource(SLASHED_BRANCH.source);

      expect(await readdir(result.path), "a load outside doctor may read it").toStrictEqual([
        SAVED_FILE,
      ]);
      expect(
        JSON.parse(await readFile(fetchRecordPath(result.path), "utf-8")),
        "the marketplace's new ETag never vouches for the tarball giget saved",
      ).toStrictEqual({ tar: SLASHED_BRANCH.tar, etag: CACHED_ETAG });
    });

    it("refuses the tarball giget saved a folder deeper when the marketplace answers with another ETag, keeping nothing", async () => {
      stubSavedTarballExtract(SLASHED_BRANCH);

      await expect(askingItself()).rejects.toMatchObject({
        name: "MarketplaceUnreachableError",
        source: SLASHED_BRANCH.source,
        reason: DOWNLOAD_FAILED,
      });

      expect(await readdir(path.dirname(cacheDir))).toStrictEqual([]);
    });

    it("downloads past the tarball giget saved a folder deeper when the marketplace answers with its ETag", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));
      stubGigetEtagCheckPassing(downloading(SLASHED_BRANCH), SLASHED_BRANCH);

      const result = await askingItself();

      expect(await readdir(result.path)).toStrictEqual([FRESH_FILE]);
      expect(await readFile(gigetTarballOf(SLASHED_BRANCH), "utf-8")).toBe(FETCHED_TARBALL_CONTENT);
      expect(
        await readdir(path.dirname(gigetTarballOf(SLASHED_BRANCH))),
        "nothing set aside is left beside the tarball the download saved",
      ).toStrictEqual([
        path.basename(gigetTarballOf(SLASHED_BRANCH)),
        `${path.basename(gigetTarballOf(SLASHED_BRANCH))}.json`,
      ]);
    });

    it("keeps the tarball this download wrote over the one giget saved a folder deeper", async () => {
      stubDownload(SLASHED_BRANCH);

      const result = await askingItself();

      expect(result.fromCache).toBe(false);
      expect(await readdir(result.path)).toStrictEqual([FRESH_FILE]);
      expect(JSON.parse(await readFile(fetchRecordPath(result.path), "utf-8"))).toStrictEqual({
        tar: SLASHED_BRANCH.tar,
        etag: PUBLISHED_ETAG,
      });
    });
  });
});
