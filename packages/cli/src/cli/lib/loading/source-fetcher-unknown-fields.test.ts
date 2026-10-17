import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MARKETPLACE_JSON, PLUGIN_MANIFEST_DIR } from "../../consts";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";

vi.mock("../../utils/logger");

import { warn } from "../../utils/logger";
import { fetchMarketplace } from "./source-fetcher";

const UNKNOWN_FIELD = "fieldThisFormatDoesNotDefine";

/** marketplace.json is this CLI's own file, so an unknown key in it is a real signal. */
describe("fetchMarketplace unknown-field warning", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-marketplace-fields-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  async function writeMarketplace(marketplace: Record<string, unknown>): Promise<string> {
    const manifestDir = path.join(tempDir, PLUGIN_MANIFEST_DIR);
    await mkdir(manifestDir, { recursive: true });
    await writeFile(path.join(manifestDir, MARKETPLACE_JSON), JSON.stringify(marketplace), "utf-8");
    return tempDir;
  }

  function validMarketplace(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: "test-marketplace",
      version: "1.0.0",
      owner: { name: "test-owner" },
      plugins: [{ name: "test-plugin", source: "./plugins/test", category: "web-framework" }],
      ...overrides,
    };
  }

  it("warns about a top-level field the marketplace format does not define", async () => {
    const source = await writeMarketplace(validMarketplace({ [UNKNOWN_FIELD]: true }));

    await fetchMarketplace(source);

    expect(warn).toHaveBeenCalledWith(`Unknown fields in ${MARKETPLACE_JSON}: ${UNKNOWN_FIELD}`);
  });

  it("stays silent about a manifest that declares only defined fields", async () => {
    const source = await writeMarketplace(validMarketplace({ description: "A test marketplace" }));

    await fetchMarketplace(source);

    // Subject guard for the test above.
    expect(warn).not.toHaveBeenCalled();
  });
});
