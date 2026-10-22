import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureMarketplace } from "./ensure-marketplace.js";
import { requireMarketplace } from "./require-marketplace.js";
import type { SourceLoadResult } from "../../loading/source-loader.js";
import { buildSourceResult } from "../../__tests__/factories/config-factories.js";
import {
  cleanupTestSource,
  createTestSource,
  TEST_MARKETPLACE_NAME,
  type TestDirs,
} from "../../__tests__/fixtures/create-test-source.js";
import { createMockPluginHost } from "../../__tests__/helpers/mock-plugin-host.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { EMPTY_MATRIX } from "../../__tests__/mock-data/mock-matrices.js";

const RECORDED_MARKETPLACE = "agents-inc";
const GITHUB_SOURCE = "github:test/source";

/** The host is the seam to the coding agent's CLI; the marketplace is resolved from disk. */
describe("ensureMarketplace", () => {
  let dirs: TestDirs;
  let noMarketplaceDir: string;
  const host = createMockPluginHost();

  beforeEach(async () => {
    vi.resetAllMocks();
    dirs = await createTestSource();
    noMarketplaceDir = path.join(dirs.tempDir, "a-repository-with-no-marketplace");
    await mkdir(noMarketplaceDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestSource(dirs);
  });

  useFakeHome(() => dirs.tempDir);

  function sourceResultFor(source: string, marketplace?: string): SourceLoadResult {
    return buildSourceResult(EMPTY_MATRIX, source, {
      sourceConfig: { source, sourceOrigin: "flag" },
      isLocal: false,
      ...(marketplace !== undefined && { marketplace }),
    });
  }

  it("refreshes a marketplace the host already has, registering nothing", async () => {
    vi.mocked(host.marketplaceExists).mockImplementation((name) =>
      Promise.resolve(name === RECORDED_MARKETPLACE),
    );

    const result = await ensureMarketplace(
      sourceResultFor(GITHUB_SOURCE, RECORDED_MARKETPLACE),
      host,
    );

    expect(host.refreshMarketplace).toHaveBeenCalledExactlyOnceWith(RECORDED_MARKETPLACE);
    expect(host.addMarketplace).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ marketplace: RECORDED_MARKETPLACE, registered: false });
  });

  it("registers a marketplace the host lacks, by its source without the github: prefix", async () => {
    vi.mocked(host.marketplaceExists).mockResolvedValue(false);

    const result = await ensureMarketplace(
      sourceResultFor(GITHUB_SOURCE, RECORDED_MARKETPLACE),
      host,
    );

    expect(host.addMarketplace).toHaveBeenCalledWith("test/source");
    expect(result).toStrictEqual({ marketplace: RECORDED_MARKETPLACE, registered: true });
  });

  it("names a marketplace no one recorded from the source's own manifest, then registers it", async () => {
    vi.mocked(host.marketplaceExists).mockResolvedValue(false);
    const sourceResult = sourceResultFor(dirs.sourceDir);

    const result = await ensureMarketplace(sourceResult, host);

    expect(sourceResult.marketplace).toBe(TEST_MARKETPLACE_NAME);
    expect(host.addMarketplace).toHaveBeenCalledExactlyOnceWith(dirs.sourceDir);
    expect(result).toStrictEqual({ marketplace: TEST_MARKETPLACE_NAME, registered: true });
  });

  it("resolves no marketplace, and registers or refreshes nothing, for a source that has none", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await ensureMarketplace(sourceResultFor(noMarketplaceDir), host);

    expect(host.addMarketplace).not.toHaveBeenCalled();
    expect(host.refreshMarketplace).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ marketplace: null, registered: false });
  });

  it("names the cause when the marketplace cannot be resolved", async () => {
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});

    await ensureMarketplace(sourceResultFor(noMarketplaceDir), host);

    expect(
      said,
      "the hard error downstream names no cause, so this warning is the only place the reason reaches the user",
    ).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(
        `  Warning: Could not resolve a marketplace from '${noMarketplaceDir}': Marketplace not found at: ${noMarketplaceDir}\n`,
      ),
    );
  });

  it("warns and carries on with the cached marketplace when the refresh fails", async () => {
    const said = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(host.marketplaceExists).mockResolvedValue(true);
    vi.mocked(host.refreshMarketplace).mockRejectedValue(new Error("Update failed"));

    const result = await ensureMarketplace(
      sourceResultFor(GITHUB_SOURCE, RECORDED_MARKETPLACE),
      host,
    );

    expect(said).toHaveBeenCalledExactlyOnceWith(
      "  Warning: Could not update marketplace — continuing with cached version",
    );
    expect(result).toStrictEqual({ marketplace: RECORDED_MARKETPLACE, registered: false });
  });

  it("registers a source that only mentions github: as written, stripping it only from its front", async () => {
    vi.mocked(host.marketplaceExists).mockResolvedValue(false);

    await ensureMarketplace(
      sourceResultFor("https://mirror.example.com/github:test/source", RECORDED_MARKETPLACE),
      host,
    );

    expect(host.addMarketplace).toHaveBeenCalledExactlyOnceWith(
      "https://mirror.example.com/github:test/source",
    );
  });

  describe("requireMarketplace", () => {
    it("refuses, naming what it could not do and the source, when no marketplace resolves", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(
        await requireMarketplace(sourceResultFor(noMarketplaceDir), "install plugins", host),
      ).toStrictEqual({
        ok: false,
        error: `Cannot install plugins: marketplace could not be resolved from '${noMarketplaceDir}'. Plugin install mode requires a marketplace — fix the marketplace or switch the affected skills to eject mode.`,
      });
    });

    it("answers the marketplace it resolved, and whether it registered it", async () => {
      vi.mocked(host.marketplaceExists).mockResolvedValue(false);

      expect(
        await requireMarketplace(sourceResultFor(dirs.sourceDir), "install plugins", host),
      ).toStrictEqual({ ok: true, marketplace: TEST_MARKETPLACE_NAME, registered: true });
    });
  });
});
