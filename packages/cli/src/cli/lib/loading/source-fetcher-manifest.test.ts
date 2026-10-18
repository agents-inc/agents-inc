import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MARKETPLACE_JSON, MAX_MARKETPLACE_PLUGINS, PLUGIN_MANIFEST_DIR } from "../../consts";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";
import type { Marketplace } from "../../types";

vi.mock("../../utils/logger");

import { verbose, warn } from "../../utils/logger";
import {
  fetchMarketplace,
  MarketplaceManifestAbsentError,
  MarketplaceNameRefusedError,
} from "./source-fetcher";

/** One character past the length a plugin name is warned at. */
const OVERLONG_PLUGIN_NAME = "p".repeat(201);
const LONGEST_QUIET_PLUGIN_NAME = "p".repeat(200);
const UNSAFE_LEADING = "$plugin";
const UNSAFE_TRAILING = "plugin$";
const LONG_UNSAFE_NAME = `${"u".repeat(55)};`;
const NOT_KEBAB_NAME = "Test_Marketplace";

function marketplaceWith(overrides: Partial<Marketplace> = {}): Marketplace {
  return {
    name: "test-marketplace",
    version: "1.0.0",
    owner: { name: "test-owner" },
    plugins: [{ name: "test-plugin", source: "./plugins/test" }],
    ...overrides,
  };
}

function pluginsNamed(count: number): Marketplace["plugins"] {
  return Array.from({ length: count }, (_, index) => ({
    name: `plugin-${index}`,
    source: `./plugins/plugin-${index}`,
  }));
}

/** What `fetchMarketplace` reads and refuses, and what it says about a manifest it loads. */
describe("fetchMarketplace manifest checks", () => {
  let tempDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-marketplace-manifest-");
    manifestPath = path.join(tempDir, PLUGIN_MANIFEST_DIR, MARKETPLACE_JSON);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  async function writeManifest(manifest: unknown): Promise<string> {
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest), "utf-8");
    return tempDir;
  }

  it("refuses a folder with no manifest as absent, naming the file and its causes", async () => {
    await mkdir(path.join(tempDir, PLUGIN_MANIFEST_DIR), { recursive: true });

    const refusal = fetchMarketplace(tempDir);

    await expect(refusal).rejects.toBeInstanceOf(MarketplaceManifestAbsentError);
    await expect(refusal).rejects.toMatchObject({
      message: [
        `Marketplace not found at: ${tempDir}`,
        "",
        "The .claude-plugin/marketplace.json file is missing from this repository.",
        "",
        "Possible causes:",
        "  - The marketplace URL may be incorrect",
        "  - The repository may not have a marketplace configured",
        "",
        "To create a marketplace, add a .claude-plugin/marketplace.json file to your marketplace repository.",
      ].join("\n"),
    });
  });

  it("names the manifest and the depth limit when the JSON nests too deeply", async () => {
    let deep: unknown = "payload";
    for (let level = 0; level < 15; level++) deep = { nested: deep };
    const source = await writeManifest({ ...marketplaceWith(), deep });

    await expect(fetchMarketplace(source)).rejects.toMatchObject({
      message: `Invalid marketplace.json at: ${manifestPath}\n\nJSON structure exceeds maximum nesting depth of 10.`,
    });
  });

  it("names the manifest, the count and the limit when it lists too many plugins", async () => {
    const source = await writeManifest(
      marketplaceWith({ plugins: pluginsNamed(MAX_MARKETPLACE_PLUGINS + 1) }),
    );

    await expect(fetchMarketplace(source)).rejects.toMatchObject({
      message: `Invalid marketplace.json at: ${manifestPath}\n\nToo many plugins: 10001 (limit: 10000).`,
    });
  });

  it("loads a manifest listing exactly as many plugins as the limit allows", async () => {
    const source = await writeManifest(
      marketplaceWith({ plugins: pluginsNamed(MAX_MARKETPLACE_PLUGINS) }),
    );

    const result = await fetchMarketplace(source);

    expect(result.marketplace.plugins).toHaveLength(MAX_MARKETPLACE_PLUGINS);
  });

  it("refuses a name the schema rejects as a name refusal, even beside other errors", async () => {
    const alone = await writeManifest(marketplaceWith({ name: NOT_KEBAB_NAME }));
    await expect(fetchMarketplace(alone)).rejects.toBeInstanceOf(MarketplaceNameRefusedError);

    const withOthers = await writeManifest(marketplaceWith({ name: NOT_KEBAB_NAME, version: "" }));
    await expect(fetchMarketplace(withOthers)).rejects.toBeInstanceOf(MarketplaceNameRefusedError);
  });

  it("refuses a manifest whose name is fine as an invalid manifest, not a name refusal", async () => {
    const source = await writeManifest(marketplaceWith({ version: "" }));

    const refusal = fetchMarketplace(source);

    await expect(refusal).rejects.toThrow(`Invalid ${MARKETPLACE_JSON} at: ${manifestPath}`);
    await expect(refusal).rejects.not.toBeInstanceOf(MarketplaceNameRefusedError);
  });

  it("tells the reader of a reserved name to rename the marketplace in this manifest", async () => {
    const source = await writeManifest(marketplaceWith({ name: "eject" }));

    await expect(fetchMarketplace(source)).rejects.toMatchObject({
      message: `Invalid marketplace.json at: ${manifestPath}\n\nMarketplace name 'eject' is reserved. 'agents-inc' is the public catalogue's own namespace, 'external' and 'local' hold the skills that belong to no marketplace, and 'eject' is what an installation records for a skill copied into it rather than installed as a plugin — a marketplace under any of them is read back as something it is not. Choose a name of your own: rename the marketplace in this manifest.`,
    });
  });

  it("warns about a plugin name over 200 characters, quoting its first 50", async () => {
    const source = await writeManifest(
      marketplaceWith({ plugins: [{ name: OVERLONG_PLUGIN_NAME, source: "./plugins/long" }] }),
    );

    await fetchMarketplace(source);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `Marketplace plugin name too long (201 chars): '${"p".repeat(50)}...'`,
    );
  });

  it("stays quiet about a plugin name of exactly 200 safe characters", async () => {
    const source = await writeManifest(
      marketplaceWith({
        plugins: [{ name: LONGEST_QUIET_PLUGIN_NAME, source: "./plugins/long" }],
      }),
    );

    await fetchMarketplace(source);

    expect(warn).not.toHaveBeenCalled();
  });

  it.each([UNSAFE_LEADING, UNSAFE_TRAILING])(
    "warns about a plugin name carrying a shell character: %s",
    async (name) => {
      const source = await writeManifest(
        marketplaceWith({ plugins: [{ name, source: "./plugins/unsafe" }] }),
      );

      await fetchMarketplace(source);

      expect(warn).toHaveBeenCalledExactlyOnceWith(
        `Marketplace plugin name contains unsafe characters: '${name}'`,
      );
    },
  );

  it("quotes only the first 50 characters of an unsafe plugin name", async () => {
    const source = await writeManifest(
      marketplaceWith({ plugins: [{ name: LONG_UNSAFE_NAME, source: "./plugins/unsafe" }] }),
    );

    await fetchMarketplace(source);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `Marketplace plugin name contains unsafe characters: '${"u".repeat(50)}'`,
    );
  });

  it("names the local folder it reads and the marketplace and version it loaded", async () => {
    const source = await writeManifest(marketplaceWith());

    await fetchMarketplace(source);

    expect(verbose).toHaveBeenCalledWith(`Using local marketplace: ${tempDir}`);
    expect(verbose).toHaveBeenCalledWith("Loaded marketplace: test-marketplace v1.0.0");
  });
});
