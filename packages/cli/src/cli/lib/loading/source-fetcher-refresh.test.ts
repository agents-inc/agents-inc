import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, writeFile, readdir } from "fs/promises";
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
import { downloadTemplate, type DownloadTemplateResult } from "giget";

const mockDownloadTemplate = vi.mocked(downloadTemplate);

describe("source-fetcher refresh", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-source-fetcher-refresh-");
    mockCacheDir = path.join(tempDir, "cache");
    await mkdir(path.join(mockCacheDir, "sources"), { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should remove orphan files from cache when forceRefresh is true", async () => {
    const source = "github:org/repo";
    const sanitized = sanitizeSourceForCache(source);
    const cacheDir = path.join(mockCacheDir, "sources", sanitized);

    await mkdir(cacheDir, { recursive: true });
    await writeFile(path.join(cacheDir, "orphan-skill.md"), "stale content");
    await writeFile(path.join(cacheDir, "another-old-file.ts"), "old code");

    mockDownloadTemplate.mockResolvedValue({
      source: source,
      dir: cacheDir,
    } as DownloadTemplateResult);

    await fetchFromSource(source, { forceRefresh: true });

    expect(mockDownloadTemplate).toHaveBeenCalledOnce();

    const callArgs = mockDownloadTemplate.mock.calls[0];
    expect(callArgs[1]).toStrictEqual(expect.objectContaining({ dir: cacheDir, force: true }));
  });

  it("should not leave orphan files after refresh", async () => {
    const source = "github:org/repo";
    const sanitized = sanitizeSourceForCache(source);
    const cacheDir = path.join(mockCacheDir, "sources", sanitized);

    await mkdir(cacheDir, { recursive: true });
    await writeFile(path.join(cacheDir, "orphan-skill.md"), "stale content");

    mockDownloadTemplate.mockImplementation(async (_src, opts) => {
      const dir = (opts as { dir: string }).dir;
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "new-skill.md"), "fresh content");
      return { source: _src as string, dir };
    });

    const result = await fetchFromSource(source, { forceRefresh: true });

    const files = await readdir(result.path);
    expect(files).toContain("new-skill.md");
    expect(files).not.toContain("orphan-skill.md");
  });

  it("should use cache without removing when forceRefresh is false", async () => {
    const source = "github:org/repo";
    const sanitized = sanitizeSourceForCache(source);
    const cacheDir = path.join(mockCacheDir, "sources", sanitized);

    await mkdir(cacheDir, { recursive: true });
    await writeFile(path.join(cacheDir, "existing-file.md"), "cached content");

    const result = await fetchFromSource(source, { forceRefresh: false });

    expect(result.fromCache).toBe(true);
    expect(result.path).toBe(cacheDir);
    expect(mockDownloadTemplate).not.toHaveBeenCalled();

    const files = await readdir(result.path);
    expect(files).toContain("existing-file.md");
  });
});
