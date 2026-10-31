import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { spawnSync } from "child_process";
import path from "path";
import { chmod, mkdir, rm, writeFile, readFile, readdir, utimes } from "fs/promises";
import { createTempDir, cleanupTempDir, fileExists } from "../__tests__/test-fs-utils";
import { delay } from "../__tests__/test-constants";
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
  stoppingOnARefusal,
} from "./source-fetcher";
import { downloadTemplate } from "giget";
import type { z } from "zod";
import { marketplaceManifestPath } from "../../consts";
import type { sourceRevalidationSchema } from "../schemas";
import { matchedAsWritten } from "../__tests__/helpers/matched-as-written";
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

/**
 * A ref as a giget provider resolves it: `template` names the folder its tarballs are saved in,
 * `version` the tarball, or, where it is empty, `template` does.
 */
type GigetRef = {
  source: string;
  tar: string;
  provider: string;
  template: string;
  version: string;
};

const MAIN: GigetRef = {
  source: SOURCE,
  tar: TARBALL,
  provider: "github",
  template: GIGET_TEMPLATE,
  version: GIGET_VERSION,
};

/** giget saves this branch's tarball a folder deeper than any other: `feature/x.tar.gz`. */
const SLASHED_BRANCH: GigetRef = {
  source: `${SOURCE}#feature/x`,
  tar: "https://api.github.com/repos/org/repo/tarball/feature/x",
  provider: "github",
  template: GIGET_TEMPLATE,
  version: "feature/x",
};

/** Another marketplace under the same provider, so giget saves its tarball beside MAIN's folder. */
const OTHER_MARKETPLACE: GigetRef = {
  source: "github:org/other",
  tar: "https://api.github.com/repos/org/other/tarball/main",
  provider: "github",
  template: "org-other",
  version: GIGET_VERSION,
};

/** A marketplace named by its URL, as giget's http provider resolves it: no version. */
const BY_URL: GigetRef = {
  source: "https://example.com/source.tar.gz",
  tar: "https://example.com/source.tar.gz",
  provider: "https",
  template: "source-tar-gz-https---",
  version: "",
};

/** The two kinds of remote marketplace: giget keeps a tarball of each, under its provider. */
const MARKETPLACE_KINDS = [
  { kind: "on GitHub", ref: MAIN },
  { kind: "by its URL", ref: BY_URL },
] as const;

/** Saved by an earlier run: older than anything a download in this test writes. */
const EARLIER_RUN = new Date("2026-01-01T00:00:00Z");

/** Mirrors `ONLY_A_SAVED_COPY_CAME_BACK`. */
const DOWNLOAD_FAILED = "the download failed and only a saved copy came back";

/** giget's own words for a download it could not answer from a saved tarball. */
const GIGET_DOWNLOAD_REFUSED = `Failed to download ${TARBALL}: 503 Service Unavailable`;

const SAVED_CONTENT = "content from the tarball giget saved";
const SAVED_TARBALL_CONTENT = "tarball an earlier download saved";
const FETCHED_TARBALL_CONTENT = "tarball this download fetched";
const PARTIAL_TARBALL_CONTENT = "the first half of a tarball";

/** A fetch record as the fetcher writes it beside a saved copy. */
type SourceRecord = z.infer<typeof sourceRevalidationSchema>;

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

/**
 * A load that stops on a refusal stops on every 4xx but 405, and how each refusal opens. Sampled
 * across the range, ends included, so a list of statuses standing in for the range fails.
 */
const STOPPING = [
  { status: 400, opens: `Failed to fetch ${SOURCE}: the marketplace answered 400` },
  { status: 401, opens: `Authentication required for: ${SOURCE}\n` },
  { status: 403, opens: `Access denied to: ${SOURCE}\n` },
  { status: 404, opens: `Repository not found: ${SOURCE}\n` },
  { status: 407, opens: `Failed to fetch ${SOURCE}: the marketplace answered 407` },
  { status: 410, opens: `Failed to fetch ${SOURCE}: the marketplace answered 410` },
  { status: 429, opens: `Failed to fetch ${SOURCE}: the marketplace answered 429` },
  { status: 451, opens: `Failed to fetch ${SOURCE}: the marketplace answered 451` },
  { status: 499, opens: `Failed to fetch ${SOURCE}: the marketplace answered 499` },
] as const;

/** A server failing, or a host refusing the HEAD the check asks with: such a load keeps the copy. */
const KEPT_OVER = [405, 500, 501, 502, 503, 504, 599] as const;

const SERVICE_UNAVAILABLE = 503;

/** Mirrors `sourceRefusedUsingCache`. */
function refusedWarning(status: number, source: string = SOURCE): string {
  return `${source} refused the request (${status}) — using the cached copy, which may be out of date.`;
}

/** What a load says when the marketplace announced newer content and the download of it failed. */
function updateNotFetchedWarning(source: string): string {
  return `Could not fetch the update from ${source} — using the cached copy, which is out of date.`;
}

const HEAD_METHOD_REFUSED = 405;

/** Mirrors `GIGET_FOLDER_LOCK`. */
const GIGET_FOLDER_LOCK = "agents-inc.lock";

/** What follows the process id in a lock this run did not take. */
const HOLDER_THIS_RUN_NEVER_ISSUED = "a-holder-left-by-a-killed-run";

/** Past the marks a load writes before its download: the second load's, while the first's runs. */
const SECOND_LOAD_HEAD_START_MS = 250;

function refusal(status: number): Response {
  return new Response(null, { status });
}

/** A host that refuses the HEAD method and serves the GET. */
function refusingOnlyHead(served: Response): (url: string, init?: RequestInit) => Response {
  return (_url, init) => (init?.method === "HEAD" ? refusal(HEAD_METHOD_REFUSED) : served);
}

function opening(text: string): RegExp {
  return new RegExp(`^${matchedAsWritten(text)}`);
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

  /** Where giget saves a provider's tarballs, each in its template's folder. */
  function gigetProviderFolder(provider: string): string {
    return path.join(tempDir, "xdg", "giget", provider);
  }

  function gigetTarballOf({ provider, template, version }: GigetRef): string {
    const stem = version === "" ? template : version;
    return path.join(gigetProviderFolder(provider), template, `${stem}.tar.gz`);
  }

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (originalXdgCacheHome === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = originalXdgCacheHome;
    await cleanupTempDir(tempDir);
  });

  async function seedCachedCopy(record?: SourceRecord): Promise<void> {
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
      return { source, dir, tar: ref.tar, name: ref.template, version: ref.version };
    };
  }

  /**
   * giget's answer when its download fails, and when its own ETag check passes: the tarball it saved
   * earlier, extracted, with nothing written to its cache and nothing in the result to say so.
   */
  function extractingSaved(ref: GigetRef): GigetAnswer {
    return async (source, options) => {
      const dir = await extractionDir(options);
      await writeFile(path.join(dir, SAVED_FILE), SAVED_CONTENT);
      return { source, dir, tar: ref.tar, name: ref.template, version: ref.version };
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

  /**
   * giget when its download fails: the tarball it saved, extracted, while that tarball is on disk;
   * the failure itself once it is gone.
   */
  function stubFailingDownload(ref: GigetRef, failure: string): void {
    mockDownloadTemplate.mockImplementation(async (source, options) => {
      if (await fileExists(gigetTarballOf(ref))) return extractingSaved(ref)(source, options);
      throw new Error(failure);
    });
  }

  /** The copy an earlier download of `ref` left, and its record when given one. */
  async function seedCopyOf(ref: GigetRef, record?: SourceRecord): Promise<void> {
    const copy = cacheDirOf(ref.source);
    await mkdir(copy, { recursive: true });
    await writeFile(path.join(copy, SAVED_FILE), SAVED_CONTENT);
    if (record) await writeFile(fetchRecordPath(copy), JSON.stringify(record));
  }

  /**
   * What an earlier download of `ref` left: the copy, its record when given one, and giget's
   * tarball of the same content beside the record of the ETag it was saved under.
   */
  async function seedEarlierDownload(ref: GigetRef, record?: SourceRecord): Promise<void> {
    await seedCopyOf(ref, record);
    await seedGigetTarball(CACHED_ETAG, ref);
  }

  async function recordOf(ref: GigetRef): Promise<unknown> {
    return JSON.parse(await readFile(fetchRecordPath(cacheDirOf(ref.source)), "utf-8"));
  }

  /**
   * The next command a user runs: the fetcher and giget loaded afresh, so nothing an earlier run
   * asked or downloaded is remembered but what it left on disk.
   */
  async function aLaterRun(): Promise<{
    fetchFromSource: typeof fetchFromSource;
    downloadTemplate: Mock<typeof downloadTemplate>;
  }> {
    const laterDownload = vi.fn<typeof downloadTemplate>();
    vi.doMock("giget", () => ({ downloadTemplate: laterDownload }));
    vi.resetModules();
    const fetcher = await import("./source-fetcher");
    return { fetchFromSource: fetcher.fetchFromSource, downloadTemplate: laterDownload };
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

  /** A load outside doctor asks about a copy saved without a version stamp as about any other. */
  describe("a copy whose record carries no ETag", () => {
    it("asks about it before anything else, and downloads it again without claiming the source moved on when the source answers with an ETag", async () => {
      await seedCachedCopy({ tar: TARBALL });
      const fetchMock = vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG));
      vi.stubGlobal("fetch", fetchMock);
      stubDownload();

      const result = await fetchFromSource(SOURCE);

      expect(fetchMock.mock.calls[0]?.[0], "the copy was asked about").toBe(TARBALL);
      expect(fetchMock.mock.calls[0]?.[1]).toStrictEqual(
        expect.objectContaining({ method: "HEAD" }),
      );
      expect(mockDownloadTemplate).toHaveBeenCalledOnce();
      expect(
        fetchMock.mock.invocationCallOrder[0],
        "asked before the download, not only after it",
      ).toBeLessThan(mockDownloadTemplate.mock.invocationCallOrder[0] ?? 0);
      expect(await readdir(result.path)).toStrictEqual([FRESH_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: PUBLISHED_ETAG,
      });
      expect(
        log,
        "a copy of no known version is not said to be superseded",
      ).not.toHaveBeenCalledWith(STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT);
    });

    it("keeps it after one question a run when the source answers without an ETag either", async () => {
      await seedCachedCopy({ tar: TARBALL });
      const fetchMock = vi.fn().mockResolvedValue(headResponse());
      vi.stubGlobal("fetch", fetchMock);

      const result = await fetchFromSource(SOURCE);
      await fetchFromSource(SOURCE, { subdir: "" });

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        TARBALL,
        expect.objectContaining({ method: "HEAD" }),
      );
      expect(mockDownloadTemplate).not.toHaveBeenCalled();
      expect(result.fromCache).toBe(true);
      expect(await readdir(cacheDir)).toStrictEqual([ORPHAN_FILE]);
      expect(warn).not.toHaveBeenCalled();
    });

    it("keeps it and names its staleness once however many times one run loads it, when the source cannot be reached", async () => {
      await seedCachedCopy({ tar: TARBALL });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

      const result = await fetchFromSource(SOURCE);
      const second = await fetchFromSource(SOURCE, { subdir: "" });

      expect(warn).toHaveBeenCalledExactlyOnceWith(sourceUnreachableUsingCache(SOURCE));
      expect(result.fromCache).toBe(true);
      expect(result.unreachable, "the copy stood in for a source nobody could ask").toBe(true);
      expect(second.unreachable).toBe(true);
      expect(mockDownloadTemplate).not.toHaveBeenCalled();
      expect(await readdir(cacheDir)).toStrictEqual([ORPHAN_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({ tar: TARBALL });
    });

    it("keeps it over a server error, and says the source refused", async () => {
      await seedCachedCopy({ tar: TARBALL });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(SERVICE_UNAVAILABLE)));

      const result = await fetchFromSource(SOURCE);

      expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(SERVICE_UNAVAILABLE));
      expect(result.fromCache).toBe(true);
      expect(mockDownloadTemplate).not.toHaveBeenCalled();
      expect(await readdir(cacheDir)).toStrictEqual([ORPHAN_FILE]);
    });

    it("stops a load that stops on a refusal when the source answers 404, leaving the copy and its record", async () => {
      await seedCachedCopy({ tar: TARBALL });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(NOT_FOUND)));

      await expect(stoppingOnARefusal(() => fetchFromSource(SOURCE))).rejects.toMatchObject({
        message: expect.stringMatching(opening(`Repository not found: ${SOURCE}\n`)),
      });

      expect(mockDownloadTemplate).not.toHaveBeenCalled();
      expect(await readdir(cacheDir)).toStrictEqual([ORPHAN_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({ tar: TARBALL });
    });

    it("downloads it on a later run after a server error answered the check right after its download", async () => {
      await rm(cacheDir, { recursive: true });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(SERVICE_UNAVAILABLE)));
      stubDownload();
      await fetchFromSource(SOURCE);
      expect(
        JSON.parse(await readFile(recordPath, "utf-8")),
        "subject guard: the copy was saved without an ETag",
      ).toStrictEqual({ tar: TARBALL });

      const later = await aLaterRun();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
      later.downloadTemplate.mockImplementation(async (source, options) =>
        downloading(source === OTHER_MARKETPLACE.source ? OTHER_MARKETPLACE : MAIN)(
          source,
          options,
        ),
      );
      await later.fetchFromSource(OTHER_MARKETPLACE.source);
      await later.fetchFromSource(SOURCE);

      expect(
        later.downloadTemplate,
        "subject guard: the later run's downloads are the ones observed, a cold cache's among them",
      ).toHaveBeenCalledWith(OTHER_MARKETPLACE.source, expect.anything());
      expect(later.downloadTemplate, "the later run refreshes the copy").toHaveBeenCalledWith(
        SOURCE,
        expect.anything(),
      );
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: PUBLISHED_ETAG,
      });
    });
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

  /**
   * Outside doctor a failed download falls back on what the earlier download left, whichever copy
   * holds it, and says so: after the marketplace announced newer content, and when the copy lost its
   * record and the marketplace cannot be reached. giget extracts the tarball it saved while it is on
   * disk, so the CLI's copy and giget's tarball hold the same content here, as they do on disk.
   */
  describe.each(MARKETPLACE_KINDS)(
    "a download failing for a marketplace named $kind",
    ({ ref }) => {
      it("replaces the copy and says nothing of a fallback when the download succeeds", async () => {
        await seedEarlierDownload(ref, { tar: ref.tar, etag: CACHED_ETAG });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
        stubDownload(ref);

        const result = await fetchFromSource(ref.source);

        expect(await readdir(result.path)).toStrictEqual([FRESH_FILE]);
        expect(await recordOf(ref)).toStrictEqual({ tar: ref.tar, etag: PUBLISHED_ETAG });
        expect(warn).not.toHaveBeenCalled();
      });

      it("reads what the earlier download left when the marketplace announced newer content, and says once that the update could not be fetched", async () => {
        await seedEarlierDownload(ref, { tar: ref.tar, etag: CACHED_ETAG });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(PUBLISHED_ETAG)));
        stubFailingDownload(ref, `Failed to download ${ref.tar}: 503 Service Unavailable`);

        const result = await fetchFromSource(ref.source);
        const second = await fetchFromSource(ref.source, { subdir: "" });

        expect(log, "subject guard: the marketplace announced newer content").toHaveBeenCalledWith(
          STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT,
        );
        expect(mockDownloadTemplate, "one download tried a run").toHaveBeenCalledOnce();
        expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
        expect(await readFile(path.join(result.path, SAVED_FILE), "utf-8")).toBe(SAVED_CONTENT);
        expect(second.path, "every load this run reads the same copy").toBe(result.path);
        expect(
          await recordOf(ref),
          "the record still names the version the copy holds",
        ).toStrictEqual({ tar: ref.tar, etag: CACHED_ETAG });
        expect(warn).toHaveBeenCalledExactlyOnceWith(updateNotFetchedWarning(ref.source));
      });

      it("reads what the earlier download left when the copy lost its record and the marketplace cannot be reached, and says once that it could not be reached", async () => {
        await seedEarlierDownload(ref);
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
        stubFailingDownload(ref, `Failed to download ${ref.tar}: TypeError: fetch failed`);

        const result = await fetchFromSource(ref.source);
        const second = await fetchFromSource(ref.source, { subdir: "" });

        expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
        expect(await readFile(path.join(result.path, SAVED_FILE), "utf-8")).toBe(SAVED_CONTENT);
        expect(second.path, "every load this run reads the same copy").toBe(result.path);
        expect(log, "nothing announced newer content").not.toHaveBeenCalledWith(
          STATUS_MESSAGES.MARKETPLACE_HAS_NEWER_CONTENT,
        );
        expect(warn).toHaveBeenCalledExactlyOnceWith(sourceUnreachableUsingCache(ref.source));
      });

      /**
       * With no record and no tarball of giget's, giget's failed download is the only answer the load
       * gets, so a refusal in it is taken as the version check's would be.
       */
      describe("over a copy that lost its record, with no tarball of giget's to fall back on", () => {
        const copy = () => cacheDirOf(ref.source);

        /** Every request answered `status`, giget's download among them. */
        function refusingEveryRequest(status: number, statusText: string): void {
          vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(status)));
          stubFailingDownload(ref, `Failed to download ${ref.tar}: ${status} ${statusText}`);
        }

        it("stops a load that stops on a refusal when the download is refused 404, leaving the copy", async () => {
          await seedCopyOf(ref);
          refusingEveryRequest(NOT_FOUND, "Not Found");
          expect(
            await fileExists(gigetTarballOf(ref)),
            "subject guard: no tarball of giget's",
          ).toBe(false);

          await expect(stoppingOnARefusal(() => fetchFromSource(ref.source))).rejects.toMatchObject(
            {
              message: expect.stringMatching(opening(`Repository not found: ${ref.source}\n`)),
            },
          );

          expect(
            mockDownloadTemplate,
            "subject guard: giget's download was tried",
          ).toHaveBeenCalledOnce();
          expect(await readdir(copy()), "the copy stays for every other load").toStrictEqual([
            SAVED_FILE,
          ]);
          expect(await fileExists(fetchRecordPath(copy())), "nothing vouched for the copy").toBe(
            false,
          );
          expect(warn).not.toHaveBeenCalled();
        });

        it("leaves a load outside it keeping the copy over the same 404, saying nothing of it", async () => {
          await seedCopyOf(ref);
          refusingEveryRequest(NOT_FOUND, "Not Found");

          const result = await fetchFromSource(ref.source);

          expect(
            mockDownloadTemplate,
            "subject guard: giget's download was tried",
          ).toHaveBeenCalledOnce();
          expect(result.fromCache).toBe(true);
          expect(result.unreachable, "the marketplace answered, with a refusal").toBe(false);
          expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
          expect(await fileExists(fetchRecordPath(copy())), "nothing vouched for the copy").toBe(
            false,
          );
          expect(warn).not.toHaveBeenCalled();
        });

        it("keeps the copy over a 503, and says once that the marketplace refused", async () => {
          await seedCopyOf(ref);
          refusingEveryRequest(SERVICE_UNAVAILABLE, "Service Unavailable");

          const result = await fetchFromSource(ref.source);
          const second = await fetchFromSource(ref.source, { subdir: "" });

          expect(mockDownloadTemplate, "one download tried a run").toHaveBeenCalledOnce();
          expect(result.fromCache).toBe(true);
          expect(result.unreachable, "the marketplace answered, with a refusal").toBe(false);
          expect(second.path, "every load this run reads the same copy").toBe(result.path);
          expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
          expect(await fileExists(fetchRecordPath(copy())), "nothing vouched for the copy").toBe(
            false,
          );
          expect(warn).toHaveBeenCalledExactlyOnceWith(
            refusedWarning(SERVICE_UNAVAILABLE, ref.source),
          );
        });

        it("keeps the copy when the marketplace cannot be reached, and says once that it could not be reached", async () => {
          await seedCopyOf(ref);
          vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
          stubFailingDownload(ref, `Failed to download ${ref.tar}: TypeError: fetch failed`);

          const result = await fetchFromSource(ref.source);
          const second = await fetchFromSource(ref.source, { subdir: "" });

          expect(mockDownloadTemplate, "one download tried a run").toHaveBeenCalledOnce();
          expect(result.fromCache).toBe(true);
          expect(result.unreachable, "no answer is not a refusal").toBe(true);
          expect(second.path, "every load this run reads the same copy").toBe(result.path);
          expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
          expect(warn).toHaveBeenCalledExactlyOnceWith(sourceUnreachableUsingCache(ref.source));
        });
      });
    },
  );

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
      expect(
        warn,
        "the copy is the one this run downloaded, so no stand-in's staleness is said",
      ).not.toHaveBeenCalled();
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

  describe("asked by a load that stops on a refusal", () => {
    const stopping = () => stoppingOnARefusal(() => fetchFromSource(SOURCE));

    it.each(STOPPING)(
      "stops on the saved copy when the marketplace answers its version check $status, leaving the copy and its record",
      async ({ status, opens }) => {
        await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
        const fetchMock = vi.fn().mockResolvedValue(refusal(status));
        vi.stubGlobal("fetch", fetchMock);

        await expect(stopping()).rejects.toMatchObject({
          message: expect.stringMatching(opening(opens)),
        });

        expect(fetchMock.mock.calls[0]?.[1]).toStrictEqual(
          expect.objectContaining({ method: "HEAD" }),
        );
        expect(mockDownloadTemplate).not.toHaveBeenCalled();
        expect(await readdir(cacheDir), "the copy stays for every other load").toStrictEqual([
          ORPHAN_FILE,
        ]);
        expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
          tar: TARBALL,
          etag: CACHED_ETAG,
        });
      },
    );

    it("keeps the saved copy the marketplace vouches for", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));

      const result = await stopping();

      expect(result.fromCache).toBe(true);
      expect(result.unreachable).toBe(false);
      expect(mockDownloadTemplate).not.toHaveBeenCalled();
    });

    it.each(KEPT_OVER)(
      "keeps the saved copy and its record over a %i, and says the marketplace refused",
      async (status) => {
        await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(status)));

        const result = await stopping();

        expect(result.fromCache).toBe(true);
        expect(result.path).toBe(cacheDir);
        expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(status));
        expect(mockDownloadTemplate).not.toHaveBeenCalled();
        expect(await readdir(cacheDir)).toStrictEqual([ORPHAN_FILE]);
        expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
          tar: TARBALL,
          etag: CACHED_ETAG,
        });
      },
    );

    it("says a refusal it keeps the copy over once however many times one run loads it", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      const fetchMock = vi.fn().mockResolvedValue(refusal(SERVICE_UNAVAILABLE));
      vi.stubGlobal("fetch", fetchMock);

      await stopping();
      const second = await stoppingOnARefusal(() => fetchFromSource(SOURCE, { subdir: "" }));

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(SERVICE_UNAVAILABLE));
      expect(second.fromCache).toBe(true);
    });

    it.each(KEPT_OVER)(
      "leaves a load outside it keeping the copy and its record over the same %i, and saying the marketplace refused",
      async (status) => {
        await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
        const fetchMock = vi.fn().mockResolvedValue(refusal(status));
        vi.stubGlobal("fetch", fetchMock);

        const outside = await fetchFromSource(SOURCE);

        expect(fetchMock, "subject guard: the marketplace was asked").toHaveBeenCalledOnce();
        expect(outside.fromCache).toBe(true);
        expect(outside.path).toBe(cacheDir);
        expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(status));
        expect(mockDownloadTemplate).not.toHaveBeenCalled();
        expect(await readdir(cacheDir)).toStrictEqual([ORPHAN_FILE]);
        expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
          tar: TARBALL,
          etag: CACHED_ETAG,
        });
      },
    );

    it("leaves a load outside it saying a refusal once however many times one run loads it", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      const fetchMock = vi.fn().mockResolvedValue(refusal(SERVICE_UNAVAILABLE));
      vi.stubGlobal("fetch", fetchMock);

      await fetchFromSource(SOURCE);
      const second = await fetchFromSource(SOURCE, { subdir: "" });

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(SERVICE_UNAVAILABLE));
      expect(second.fromCache).toBe(true);
    });

    it("keeps the saved copy and names its staleness when the marketplace cannot be reached", async () => {
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

      const result = await stopping();

      expect(result.fromCache).toBe(true);
      expect(result.unreachable, "no answer is not a refusal").toBe(true);
      expect(warn).toHaveBeenCalledWith(sourceUnreachableUsingCache(SOURCE));
    });

    it.each(STOPPING)(
      "leaves a load outside it free to keep the copy the same $status stops, saying nothing of it",
      async ({ status }) => {
        await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
        const fetchMock = vi.fn().mockResolvedValue(refusal(status));
        vi.stubGlobal("fetch", fetchMock);

        const outside = await fetchFromSource(SOURCE);

        expect(fetchMock, "subject guard: the marketplace was asked").toHaveBeenCalledOnce();
        expect(outside.fromCache).toBe(true);
        expect(outside.path).toBe(cacheDir);
        expect(warn).not.toHaveBeenCalled();
      },
    );

    it.each(STOPPING)(
      "stops on the tarball giget saved when the marketplace answers $status, keeping nothing giget extracted",
      async ({ status, opens }) => {
        await rm(cacheDir, { recursive: true });
        await seedGigetTarball(CACHED_ETAG);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(status)));
        stubSavedTarballExtract();

        await expect(stopping()).rejects.toMatchObject({
          message: expect.stringMatching(opening(opens)),
        });

        expect(await readdir(path.dirname(cacheDir)), "no copy and no record").toStrictEqual([]);
        expect(
          await readFile(gigetTarballOf(MAIN), "utf-8"),
          "giget's own tarball stays for every other load",
        ).toBe(SAVED_TARBALL_CONTENT);
      },
    );

    it("keeps the tarball giget saved when the marketplace answers for it", async () => {
      await rm(cacheDir, { recursive: true });
      await seedGigetTarball(CACHED_ETAG);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse(CACHED_ETAG)));
      stubSavedTarballExtract();

      const result = await stopping();

      expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: CACHED_ETAG,
      });
    });

    it.each(KEPT_OVER)(
      "keeps the tarball giget saved over a %i, and says the marketplace refused",
      async (status) => {
        await rm(cacheDir, { recursive: true });
        await seedGigetTarball(CACHED_ETAG);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(status)));
        stubSavedTarballExtract();

        const result = await stopping();

        expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
        expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
          tar: TARBALL,
          etag: CACHED_ETAG,
        });
        expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(status));
      },
    );

    it("keeps the tarball giget saved and names its staleness when the marketplace cannot be reached", async () => {
      await rm(cacheDir, { recursive: true });
      await seedGigetTarball(CACHED_ETAG);
      const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
      vi.stubGlobal("fetch", fetchMock);
      stubSavedTarballExtract();

      const result = await stopping();

      expect(
        fetchMock,
        "subject guard: the marketplace was asked about the tarball",
      ).toHaveBeenCalled();
      expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: CACHED_ETAG,
      });
      expect(
        warn,
        "giget's tarball standing in for a marketplace nobody could ask is said as the saved copy is",
      ).toHaveBeenCalledExactlyOnceWith(sourceUnreachableUsingCache(SOURCE));
    });

    it("leaves a load outside it keeping the tarball giget saved when the marketplace cannot be reached, and naming its staleness", async () => {
      await rm(cacheDir, { recursive: true });
      await seedGigetTarball(CACHED_ETAG);
      const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
      vi.stubGlobal("fetch", fetchMock);
      stubSavedTarballExtract();

      const outside = await fetchFromSource(SOURCE);

      expect(
        fetchMock,
        "subject guard: the marketplace was asked about the tarball",
      ).toHaveBeenCalled();
      expect(mockDownloadTemplate, "giget extracted the tarball it saved").toHaveBeenCalledOnce();
      expect(await readdir(outside.path)).toStrictEqual([SAVED_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: CACHED_ETAG,
      });
      expect(
        warn,
        "giget's tarball standing in for a marketplace nobody could ask is said as the saved copy is",
      ).toHaveBeenCalledExactlyOnceWith(sourceUnreachableUsingCache(SOURCE));
    });

    it("leaves a load outside it naming an unreachable marketplace's staleness over giget's tarball once however many times one run loads it", async () => {
      await rm(cacheDir, { recursive: true });
      await seedGigetTarball(CACHED_ETAG);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
      stubSavedTarballExtract();

      await fetchFromSource(SOURCE);
      const second = await fetchFromSource(SOURCE, { subdir: "" });

      expect(mockDownloadTemplate, "the tarball is extracted once a run").toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledExactlyOnceWith(sourceUnreachableUsingCache(SOURCE));
      expect(second.fromCache).toBe(true);
    });

    /**
     * giget's refused download leaves the CLI no status to judge, so the marketplace is asked about
     * the tarball: the asking is the subject guard for the silence.
     */
    it.each(STOPPING)(
      "leaves a load outside it free to keep the tarball giget saved over the same $status, saying nothing of it",
      async ({ status }) => {
        await rm(cacheDir, { recursive: true });
        await seedGigetTarball(CACHED_ETAG);
        const fetchMock = vi.fn().mockResolvedValue(refusal(status));
        vi.stubGlobal("fetch", fetchMock);
        stubSavedTarballExtract();

        const outside = await fetchFromSource(SOURCE);

        expect(fetchMock, "subject guard: the marketplace was asked").toHaveBeenCalled();
        expect(await readdir(outside.path)).toStrictEqual([SAVED_FILE]);
        expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
          tar: TARBALL,
          etag: CACHED_ETAG,
        });
        expect(warn).not.toHaveBeenCalled();
      },
    );

    it.each(KEPT_OVER)(
      "leaves a load outside it keeping the tarball giget saved over the same %i, and saying the marketplace refused",
      async (status) => {
        await rm(cacheDir, { recursive: true });
        await seedGigetTarball(CACHED_ETAG);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(status)));
        stubSavedTarballExtract();

        const outside = await fetchFromSource(SOURCE);

        expect(await readdir(outside.path)).toStrictEqual([SAVED_FILE]);
        expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
          tar: TARBALL,
          etag: CACHED_ETAG,
        });
        expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(status));
      },
    );

    it("leaves a load outside it saying a refusal over giget's tarball once however many times one run loads it", async () => {
      await rm(cacheDir, { recursive: true });
      await seedGigetTarball(CACHED_ETAG);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(SERVICE_UNAVAILABLE)));
      stubSavedTarballExtract();

      await fetchFromSource(SOURCE);
      const second = await fetchFromSource(SOURCE, { subdir: "" });

      expect(mockDownloadTemplate, "the tarball is extracted once a run").toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(SERVICE_UNAVAILABLE));
      expect(second.fromCache).toBe(true);
    });

    it("leaves a load outside it saying nothing of a refusal asked after a download it just made, recording no ETag", async () => {
      await rm(cacheDir, { recursive: true });
      const fetchMock = vi.fn().mockResolvedValue(refusal(SERVICE_UNAVAILABLE));
      vi.stubGlobal("fetch", fetchMock);
      stubDownload();

      const outside = await fetchFromSource(SOURCE);

      expect(fetchMock, "subject guard: the marketplace was asked").toHaveBeenCalledOnce();
      expect(outside.fromCache, "no saved copy stood in").toBe(false);
      expect(await readdir(outside.path)).toStrictEqual([FRESH_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({ tar: TARBALL });
      expect(warn).not.toHaveBeenCalled();
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

  /**
   * A filesystem storing whole seconds leaves a file giget rewrites within the second it last wrote
   * it at the time it already had: stood in for by setting each time giget writes back to the second
   * its saved tarball and record carry. ctime, which no process can set, still moves here. The host
   * refuses the HEAD giget asks with, so giget records no ETag and fetches on every run.
   */
  describe("a tarball giget rewrites within the second it wrote the last, on a filesystem storing whole seconds", () => {
    const askingItself = () => askingEachMarketplaceItself(() => fetchFromSource(SOURCE));

    /** A marketplace that has not moved serves the bytes giget saved. */
    const DOWNLOADED_TARBALLS = [
      { serves: "content that moved on", bytes: FETCHED_TARBALL_CONTENT },
      { serves: "the content giget saved", bytes: SAVED_TARBALL_CONTENT },
    ] as const;

    /** As init and edit load from the marketplace (`stoppingOnARefusal`), and as every other load. */
    const OUTSIDE_DOCTOR = [
      { load: "a load outside doctor", stopsOnARefusal: false },
      { load: "a load that stops on a refusal", stopsOnARefusal: true },
    ] as const;

    function loadingOutsideDoctor(stopsOnARefusal: boolean): ReturnType<typeof fetchFromSource> {
      const load = () => fetchFromSource(SOURCE);
      return stopsOnARefusal ? stoppingOnARefusal(load) : load();
    }

    async function standAtTheSavedSecond(file: string): Promise<void> {
      await utimes(file, EARLIER_RUN, EARLIER_RUN);
    }

    /** giget's fetch past a refused HEAD: the tarball, a record with no ETag, then the extract. */
    function downloadingWithinTheSavedSecond(bytes: string): GigetAnswer {
      return async (source, options) => {
        const tarball = gigetTarballOf(MAIN);
        await writeFile(tarball, bytes);
        await writeFile(`${tarball}.json`, JSON.stringify({}));
        await standAtTheSavedSecond(tarball);
        await standAtTheSavedSecond(`${tarball}.json`);
        const dir = await extractionDir(options);
        await writeFile(path.join(dir, FRESH_FILE), FRESH_CONTENT);
        return { source, dir, tar: TARBALL, name: GIGET_TEMPLATE, version: GIGET_VERSION };
      };
    }

    beforeEach(async () => {
      await rm(cacheDir, { recursive: true });
      await seedGigetTarball();
      await standAtTheSavedSecond(`${gigetTarballOf(MAIN)}.json`);
      vi.stubGlobal("fetch", vi.fn(refusingOnlyHead(headResponse(PUBLISHED_ETAG))));
    });

    it.each(DOWNLOADED_TARBALLS)(
      "keeps the download when doctor must reach a marketplace serving $serves",
      async ({ bytes }) => {
        mockDownloadTemplate.mockImplementation(downloadingWithinTheSavedSecond(bytes));

        const result = await askingItself();

        expect(result).toStrictEqual({
          path: cacheDir,
          fromCache: false,
          unreachable: false,
          source: SOURCE,
        });
        expect(await readdir(cacheDir)).toStrictEqual([FRESH_FILE]);
        expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
          tar: TARBALL,
          etag: PUBLISHED_ETAG,
        });
      },
    );

    it("keeps a download giget wrote in a later second when doctor must reach the marketplace", async () => {
      stubDownload();

      const result = await askingItself();

      expect(result).toStrictEqual({
        path: cacheDir,
        fromCache: false,
        unreachable: false,
        source: SOURCE,
      });
      expect(await readdir(cacheDir)).toStrictEqual([FRESH_FILE]);
      expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({
        tar: TARBALL,
        etag: PUBLISHED_ETAG,
      });
    });

    it("refuses the tarball giget saved in that second when doctor must reach the marketplace and giget extracts it unfetched", async () => {
      stubSavedTarballExtract();

      await expect(askingItself()).rejects.toMatchObject({
        name: "MarketplaceUnreachableError",
        source: SOURCE,
        reason: DOWNLOAD_FAILED,
      });

      expect(await readdir(path.dirname(cacheDir)), "no copy and no record").toStrictEqual([]);
    });

    it.each(OUTSIDE_DOCTOR)(
      "says no refusal over the download when $load fetches within that second",
      async ({ stopsOnARefusal }) => {
        mockDownloadTemplate.mockImplementation(
          downloadingWithinTheSavedSecond(FETCHED_TARBALL_CONTENT),
        );

        const result = await loadingOutsideDoctor(stopsOnARefusal);

        expect(result.fromCache, "no saved copy stood in").toBe(false);
        expect(await readdir(cacheDir)).toStrictEqual([FRESH_FILE]);
        expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({ tar: TARBALL });
        expect(
          warn,
          "the copy is the one this run downloaded, so no stand-in's refusal is said",
        ).not.toHaveBeenCalled();
      },
    );

    it.each(OUTSIDE_DOCTOR)(
      "says no refusal over a download giget wrote in a later second when $load fetches it",
      async ({ stopsOnARefusal }) => {
        stubDownload();

        const result = await loadingOutsideDoctor(stopsOnARefusal);

        expect(result.fromCache).toBe(false);
        expect(await readdir(cacheDir)).toStrictEqual([FRESH_FILE]);
        expect(JSON.parse(await readFile(recordPath, "utf-8"))).toStrictEqual({ tar: TARBALL });
        expect(warn).not.toHaveBeenCalled();
      },
    );

    it.each(OUTSIDE_DOCTOR)(
      "says the marketplace refused when $load keeps the tarball giget saved in that second",
      async ({ stopsOnARefusal }) => {
        stubSavedTarballExtract();

        const result = await loadingOutsideDoctor(stopsOnARefusal);

        expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
        expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(HEAD_METHOD_REFUSED));
      },
    );
  });

  /**
   * Two marketplaces under giget's one github folder, as two runs on one machine load them. The host
   * refuses every request, so each download fails and giget extracts the tarball it saved for that
   * marketplace, writing nothing.
   */
  describe("two marketplaces downloading at once", () => {
    const BOTH = [MAIN, OTHER_MARKETPLACE] as const;

    function gigetFolderLock(): string {
      return path.join(gigetProviderFolder(MAIN.provider), GIGET_FOLDER_LOCK);
    }

    /** Each saved record reads as giget wrote it, and nothing is left beside giget's own files. */
    async function expectGigetCacheAsSaved(): Promise<void> {
      for (const ref of BOTH) {
        expect(await readFile(`${gigetTarballOf(ref)}.json`, "utf-8")).toBe(
          JSON.stringify({ etag: CACHED_ETAG }),
        );
        expect(await readdir(path.dirname(gigetTarballOf(ref)))).toStrictEqual([
          `${GIGET_VERSION}.tar.gz`,
          `${GIGET_VERSION}.tar.gz.json`,
        ]);
      }
      expect((await readdir(gigetProviderFolder(MAIN.provider))).sort()).toStrictEqual([
        OTHER_MARKETPLACE.template,
        MAIN.template,
      ]);
    }

    beforeEach(async () => {
      await rm(cacheDir, { recursive: true });
      await Promise.all(BOTH.map((ref) => seedGigetTarball(CACHED_ETAG, ref)));
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(refusal(HEAD_METHOD_REFUSED)));
    });

    it("says each marketplace refused, and leaves giget's records as saved, when the second downloads while the first still is", async () => {
      let firstDownloading = () => {};
      const firstStarted = new Promise<void>((resolve) => {
        firstDownloading = resolve;
      });
      let failFirst = () => {};
      const firstFailing = new Promise<void>((resolve) => {
        failFirst = resolve;
      });
      let secondDownloading = () => {};
      const secondStarted = new Promise<void>((resolve) => {
        secondDownloading = resolve;
      });
      mockDownloadTemplate.mockImplementation(async (source, options) => {
        if (source === OTHER_MARKETPLACE.source) {
          secondDownloading();
          return extractingSaved(OTHER_MARKETPLACE)(source, options);
        }
        firstDownloading();
        await firstFailing;
        return extractingSaved(MAIN)(source, options);
      });

      const first = fetchFromSource(MAIN.source);
      await firstStarted;
      const second = fetchFromSource(OTHER_MARKETPLACE.source);
      await Promise.race([secondStarted, delay(SECOND_LOAD_HEAD_START_MS)]);
      failFirst();

      expect(await Promise.all([first, second])).toStrictEqual(
        BOTH.map(({ source }) => ({
          path: cacheDirOf(source),
          fromCache: false,
          unreachable: false,
          source,
        })),
      );
      expect(warn).toHaveBeenCalledTimes(BOTH.length);
      expect(warn).toHaveBeenCalledWith(refusedWarning(HEAD_METHOD_REFUSED, MAIN.source));
      expect(warn).toHaveBeenCalledWith(
        refusedWarning(HEAD_METHOD_REFUSED, OTHER_MARKETPLACE.source),
      );
      await expectGigetCacheAsSaved();
    });

    it("keeps another marketplace's download whole while a run discards the giget folder of one that moved on", async () => {
      await mkdir(cacheDir, { recursive: true });
      await seedCachedCopy({ tar: TARBALL, etag: CACHED_ETAG });
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          url === TARBALL ? headResponse(PUBLISHED_ETAG) : refusal(HEAD_METHOD_REFUSED),
        ),
      );
      let otherDownloading = () => {};
      const otherStarted = new Promise<void>((resolve) => {
        otherDownloading = resolve;
      });
      let failOther = () => {};
      const otherFailing = new Promise<void>((resolve) => {
        failOther = resolve;
      });
      mockDownloadTemplate.mockImplementation(async (source, options) => {
        if (source === MAIN.source) return downloading(MAIN)(source, options);
        otherDownloading();
        await otherFailing;
        return extractingSaved(OTHER_MARKETPLACE)(source, options);
      });

      const other = fetchFromSource(OTHER_MARKETPLACE.source);
      await otherStarted;
      const movedOn = fetchFromSource(MAIN.source);
      await delay(SECOND_LOAD_HEAD_START_MS);
      failOther();

      const [otherResult, movedOnResult] = await Promise.all([other, movedOn]);
      expect(await readdir(otherResult.path)).toStrictEqual([SAVED_FILE]);
      expect(await readdir(movedOnResult.path)).toStrictEqual([FRESH_FILE]);
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        refusedWarning(HEAD_METHOD_REFUSED, OTHER_MARKETPLACE.source),
      );
      expect(await readFile(`${gigetTarballOf(OTHER_MARKETPLACE)}.json`, "utf-8")).toBe(
        JSON.stringify({ etag: CACHED_ETAG }),
      );
      expect(await readFile(gigetTarballOf(MAIN), "utf-8")).toBe(FETCHED_TARBALL_CONTENT);
      expect((await readdir(gigetProviderFolder(MAIN.provider))).sort()).toStrictEqual([
        OTHER_MARKETPLACE.template,
        MAIN.template,
      ]);
    });

    it("downloads past a lock on giget's folder that a run since ended left, leaving none behind", async () => {
      await writeFile(gigetFolderLock(), String(spawnSync(process.execPath, ["-e", ""]).pid));
      stubSavedTarballExtract();

      const result = await fetchFromSource(SOURCE);

      expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
      expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(HEAD_METHOD_REFUSED));
      await expectGigetCacheAsSaved();
    });

    /** As a container restarted over the same cache folder hands a new run its killed run's id. */
    it("downloads past a lock naming this run's own process id that it never took, leaving none behind", async () => {
      await writeFile(gigetFolderLock(), `${process.pid} ${HOLDER_THIS_RUN_NEVER_ISSUED}`);
      stubSavedTarballExtract();

      const result = await fetchFromSource(SOURCE);

      expect(await readdir(result.path)).toStrictEqual([SAVED_FILE]);
      expect(warn).toHaveBeenCalledExactlyOnceWith(refusedWarning(HEAD_METHOD_REFUSED));
      await expectGigetCacheAsSaved();
    });

    it("takes over a lock held longer than any download, putting back the records its holder marked", async () => {
      let firstDownloading = () => {};
      const firstStarted = new Promise<void>((resolve) => {
        firstDownloading = resolve;
      });
      mockDownloadTemplate.mockImplementation(async (source, options) => {
        if (source === OTHER_MARKETPLACE.source) {
          return extractingSaved(OTHER_MARKETPLACE)(source, options);
        }
        firstDownloading();
        return new Promise<never>(() => {});
      });

      void fetchFromSource(MAIN.source);
      await firstStarted;
      await utimes(gigetFolderLock(), EARLIER_RUN, EARLIER_RUN);
      const second = await fetchFromSource(OTHER_MARKETPLACE.source);

      expect(await readdir(second.path)).toStrictEqual([SAVED_FILE]);
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        refusedWarning(HEAD_METHOD_REFUSED, OTHER_MARKETPLACE.source),
      );
      await expectGigetCacheAsSaved();
    });
  });
});
