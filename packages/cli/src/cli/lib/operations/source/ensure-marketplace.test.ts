import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SourceLoadResult } from "../../loading/source-loader.js";
import { buildSourceResult } from "../../__tests__/factories/config-factories.js";
import { EMPTY_MATRIX } from "../../__tests__/mock-data/mock-matrices.js";

vi.mock("../../../utils/exec.js", () => ({
  claudePluginMarketplaceExists: vi.fn(),
  claudePluginMarketplaceAdd: vi.fn(),
  claudePluginMarketplaceUpdate: vi.fn(),
}));

vi.mock("../../loading/index.js", () => ({
  fetchMarketplace: vi.fn(),
}));

vi.mock("../../../utils/logger.js");

import { ensureMarketplace } from "./ensure-marketplace";
import {
  claudePluginMarketplaceExists,
  claudePluginMarketplaceAdd,
  claudePluginMarketplaceUpdate,
} from "../../../utils/exec.js";
import { fetchMarketplace } from "../../loading/index.js";
import { warn } from "../../../utils/logger.js";

const mockMarketplaceExists = vi.mocked(claudePluginMarketplaceExists);
const mockMarketplaceAdd = vi.mocked(claudePluginMarketplaceAdd);
const mockMarketplaceUpdate = vi.mocked(claudePluginMarketplaceUpdate);
const mockFetchMarketplace = vi.mocked(fetchMarketplace);
const mockWarn = vi.mocked(warn);

/** Why the lazy resolution failed — the sentence a user must be able to read back. */
const FETCH_FAILURE_CAUSE = "Network error";

function makeSourceResult(marketplace?: string): SourceLoadResult {
  return buildSourceResult(EMPTY_MATRIX, "/tmp/test-source", {
    sourceConfig: { source: "github:test/source", sourceOrigin: "flag" },
    isLocal: false,
    ...(marketplace !== undefined && { marketplace }),
  });
}

describe("ensureMarketplace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return existing marketplace without registering", async () => {
    const sourceResult = makeSourceResult("agents-inc");
    mockMarketplaceExists.mockResolvedValue(true);

    const result = await ensureMarketplace(sourceResult);

    expect(mockMarketplaceExists).toHaveBeenCalledWith("agents-inc");
    expect(mockMarketplaceAdd).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ marketplace: "agents-inc", registered: false });
  });

  it("should register new marketplace when not exists", async () => {
    const sourceResult = makeSourceResult("agents-inc");
    mockMarketplaceExists.mockResolvedValue(false);

    const result = await ensureMarketplace(sourceResult);

    expect(mockMarketplaceAdd).toHaveBeenCalledWith("test/source");
    expect(result).toStrictEqual({ marketplace: "agents-inc", registered: true });
  });

  it("should return null marketplace when no marketplace configured and fetch fails", async () => {
    const sourceResult = makeSourceResult(undefined);
    mockFetchMarketplace.mockRejectedValue(new Error(FETCH_FAILURE_CAUSE));

    const result = await ensureMarketplace(sourceResult);

    expect(mockFetchMarketplace).toHaveBeenCalledWith("github:test/source");
    expect(mockMarketplaceExists).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ marketplace: null, registered: false });
  });

  it("names the cause when the marketplace cannot be resolved", async () => {
    const sourceResult = makeSourceResult(undefined);
    mockFetchMarketplace.mockRejectedValue(new Error(FETCH_FAILURE_CAUSE));

    await ensureMarketplace(sourceResult);

    expect(
      mockWarn,
      "the hard error downstream names no cause, so this warning is the only place the reason reaches the user",
    ).toHaveBeenCalledWith(
      `Could not resolve a marketplace from 'github:test/source': ${FETCH_FAILURE_CAUSE}`,
    );
  });

  it("should warn when marketplace update fails", async () => {
    const sourceResult = makeSourceResult("agents-inc");
    mockMarketplaceExists.mockResolvedValue(true);
    mockMarketplaceUpdate.mockRejectedValue(new Error("Update failed"));

    const result = await ensureMarketplace(sourceResult);

    expect(mockMarketplaceUpdate).toHaveBeenCalledWith("agents-inc");
    expect(mockWarn).toHaveBeenCalledWith(
      "Could not update marketplace — continuing with cached version",
    );
    expect(result).toStrictEqual({ marketplace: "agents-inc", registered: false });
  });

  it("should lazily resolve marketplace name via fetchMarketplace", async () => {
    const sourceResult = makeSourceResult(undefined);
    mockFetchMarketplace.mockResolvedValue({
      marketplace: {
        name: "resolved-marketplace",
        version: "1.0.0",
        owner: { name: "test" },
        plugins: [],
      },
      sourcePath: "/tmp/resolved",
      fromCache: false,
    });
    mockMarketplaceExists.mockResolvedValue(false);

    const result = await ensureMarketplace(sourceResult);

    expect(mockFetchMarketplace).toHaveBeenCalledWith("github:test/source");
    expect(sourceResult.marketplace).toBe("resolved-marketplace");
    expect(mockMarketplaceExists).toHaveBeenCalledWith("resolved-marketplace");
    expect(mockMarketplaceAdd).toHaveBeenCalledWith("test/source");
    expect(result).toStrictEqual({ marketplace: "resolved-marketplace", registered: true });
  });
});
