import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MARKETPLACE_JSON, PLUGIN_MANIFEST_DIR } from "../../consts";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";

vi.mock("../../utils/logger");

import { warn } from "../../utils/logger";
import { fetchMarketplace } from "./source-fetcher";

const UNKNOWN_FIELD = "fieldThisFormatDoesNotDefine";

/**
 * marketplace.json is a file this CLI defines, publishes a schema for, and reads every field of, so
 * a key it does not know is a real signal: a typo, a newer publisher, or a file that is not what it
 * claims to be. That is the opposite of settings.json, which belongs to Claude Code and which this
 * CLI must never police — these tests exist so the silence introduced there stays there.
 */
describe("fetchMarketplace unknown-field warning", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-marketplace-fields-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /** Writes a marketplace manifest into the temp dir and returns it as a local source. */
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

    // The field is named, not counted: the point of the warning is that it can be acted on.
    expect(warn).toHaveBeenCalledWith(`Unknown fields in ${MARKETPLACE_JSON}: ${UNKNOWN_FIELD}`);
  });

  it("stays silent about a manifest that declares only defined fields", async () => {
    const source = await writeMarketplace(validMarketplace({ description: "A test marketplace" }));

    await fetchMarketplace(source);

    // The subject guard for the test above: without it, a `warn` that fired on every manifest
    // would satisfy the positive assertion just as well.
    expect(warn).not.toHaveBeenCalled();
  });
});
