import path from "path";
import { writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { writeTestPackageJson } from "../helpers/config-io.js";
import { writeTestPluginManifest } from "../helpers/disk-writers.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { fileExists } from "../test-fs-utils.js";
import { VALID_PACKAGE_JSON_FILE } from "../mock-data/mock-source-files.js";
import { fetchMarketplace } from "../../loading/source-fetcher.js";
import { EXIT_CODES } from "../../exit-codes.js";
import { MARKETPLACE_JSON, PLUGIN_MANIFEST_DIR, STANDARD_FILES } from "../../../consts.js";

/** The plugins directory the build scans, relative to the project root. */
const PLUGINS_DIR_FLAG = path.join("dist", "plugins");

/**
 * One plugin, published in the fixture marketplace's own namespace. A build needs
 * at least one: `marketplaceSchema` requires a non-empty `plugins`, and the
 * namespace validator requires every id to carry the marketplace's name.
 */
const PLUGIN_NAME = `${VALID_PACKAGE_JSON_FILE.name}-web-framework-react`;

/** An npm scoped name: legal for a package, and not a name a marketplace may publish under. */
const SCOPED_PACKAGE_NAME = "@acme/skills";

/** The characters {@link SCOPED_PACKAGE_NAME} carries that a marketplace name may not. */
const SCOPED_NAME_OFFENDERS = ["@", "/"];

/** {@link VALID_PACKAGE_JSON_FILE} without the field the marketplace owner is derived from. */
const PACKAGE_JSON_WITHOUT_AUTHOR = {
  name: VALID_PACKAGE_JSON_FILE.name,
  version: VALID_PACKAGE_JSON_FILE.version,
  description: VALID_PACKAGE_JSON_FILE.description,
};

describe("build marketplace writes a manifest this CLI can read back", () => {
  let projectDir: string;
  let manifestPath: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("build-marketplace-round-trip-"));
    manifestPath = path.join(projectDir, PLUGIN_MANIFEST_DIR, MARKETPLACE_JSON);
    await writeTestPluginManifest(path.join(projectDir, PLUGINS_DIR_FLAG, PLUGIN_NAME), {
      name: PLUGIN_NAME,
    });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("reads the manifest it just wrote back through the marketplace reader", async () => {
    await writeTestPackageJson(projectDir);

    const { error } = await runCliCommand(["build:marketplace", "--plugins-dir", PLUGINS_DIR_FLAG]);

    expect(error).toBeUndefined();
    const readBack = await fetchMarketplace(projectDir);
    expect(readBack.marketplace.name).toBe(VALID_PACKAGE_JSON_FILE.name);
    expect(readBack.marketplace.owner.name).not.toBe("");
  });

  it("refuses a package.json with no author rather than writing an owner it cannot read back", async () => {
    await writeFile(
      path.join(projectDir, STANDARD_FILES.PACKAGE_JSON),
      JSON.stringify(PACKAGE_JSON_WITHOUT_AUTHOR),
    );

    const { error } = await runCliCommand(["build:marketplace", "--plugins-dir", PLUGINS_DIR_FLAG]);

    expect(error).toBeInstanceOf(Error);
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(error?.message).toContain("author");
    expect(await fileExists(manifestPath)).toBe(false);
  });

  it("refuses an author string that yields no name", async () => {
    await writeTestPackageJson(projectDir, { author: "<solo@example.com>" });

    const { error } = await runCliCommand(["build:marketplace", "--plugins-dir", PLUGINS_DIR_FLAG]);

    expect(error).toBeInstanceOf(Error);
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(await fileExists(manifestPath)).toBe(false);
  });

  it("refuses a scoped package name, naming every character a marketplace name may not carry", async () => {
    await writeTestPackageJson(projectDir, { name: SCOPED_PACKAGE_NAME });

    const { error } = await runCliCommand(["build:marketplace", "--plugins-dir", PLUGINS_DIR_FLAG]);

    expect(error).toBeInstanceOf(Error);
    for (const character of SCOPED_NAME_OFFENDERS) {
      expect(error?.message, `the refusal must name '${character}'`).toContain(character);
    }
    expect(error?.message).toContain(STANDARD_FILES.PACKAGE_JSON);
    expect(await fileExists(manifestPath)).toBe(false);
  });
});
