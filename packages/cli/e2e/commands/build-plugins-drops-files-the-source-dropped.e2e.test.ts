import path from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  createE2ESource,
  readInstallTree,
  readPluginVersions,
  type E2ESource,
  type InstallTree,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";

/**
 * A rebuild replaces a plugin's earlier build rather than writing over it, so a file deleted from a
 * skill's source since the last build is gone from its plugin as well.
 */

const REBUILT_SKILL_ID = E2E_SKILL.react.id;
const KEPT_EXAMPLE = "kept.md";
const DROPPED_EXAMPLE = "dropped.md";
const KEPT_EXAMPLE_BODY = "# Kept example";

const BUILT_SKILL_DIR = `${DIRS.SKILLS}/${REBUILT_SKILL_ID}`;

/** Written out, so a missing or extra file fails the `toStrictEqual`. */
const FIRST_BUILD_FILES = [
  `${SOURCE_PATHS.PLUGIN_MANIFEST_DIR}/.content-hash`,
  `${SOURCE_PATHS.PLUGIN_MANIFEST_DIR}/${FILES.PLUGIN_JSON}`,
  "README.md",
  `${BUILT_SKILL_DIR}/${FILES.SKILL_MD}`,
  `${BUILT_SKILL_DIR}/examples/${DROPPED_EXAMPLE}`,
  `${BUILT_SKILL_DIR}/examples/${KEPT_EXAMPLE}`,
  `${BUILT_SKILL_DIR}/reference.md`,
];

const REBUILD_FILES = [
  `${SOURCE_PATHS.PLUGIN_MANIFEST_DIR}/.content-hash`,
  `${SOURCE_PATHS.PLUGIN_MANIFEST_DIR}/${FILES.PLUGIN_JSON}`,
  "README.md",
  `${BUILT_SKILL_DIR}/${FILES.SKILL_MD}`,
  `${BUILT_SKILL_DIR}/examples/${KEPT_EXAMPLE}`,
];

describe("build plugins over an earlier build whose source has since dropped files", () => {
  let source: E2ESource;
  let pluginsDir: string;
  let rebuiltPluginDir: string;
  let firstBuild: InstallTree;
  let rebuild: Awaited<ReturnType<typeof CLI.run>>;

  beforeAll(async () => {
    source = await createE2ESource({ unbuilt: true });
    pluginsDir = path.join(source.sourceDir, SOURCE_PATHS.PLUGINS_DIST);
    rebuiltPluginDir = path.join(pluginsDir, REBUILT_SKILL_ID);
    const skillSourceDir = path.join(source.sourceDir, SOURCE_PATHS.SKILLS_DIR, REBUILT_SKILL_ID);
    const examplesDir = path.join(skillSourceDir, DIRS.EXAMPLES);
    await mkdir(examplesDir, { recursive: true });
    await writeFile(path.join(examplesDir, KEPT_EXAMPLE), KEPT_EXAMPLE_BODY);
    await writeFile(path.join(examplesDir, DROPPED_EXAMPLE), "# Dropped example");
    await writeFile(path.join(skillSourceDir, FILES.REFERENCE_MD), "# Reference");

    const built = await CLI.run(["build", "plugins"], { dir: source.sourceDir });
    expect(built.exitCode, built.output).toBe(EXIT_CODES.SUCCESS);
    firstBuild = await readInstallTree(rebuiltPluginDir);

    await rm(path.join(examplesDir, DROPPED_EXAMPLE));
    await rm(path.join(skillSourceDir, FILES.REFERENCE_MD));
    rebuild = await CLI.run(["build", "plugins"], { dir: source.sourceDir });
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  it("built the dropped files the first time, so their absence after the rebuild means something", () => {
    expect(Object.keys(firstBuild.files).sort()).toStrictEqual(FIRST_BUILD_FILES);
  });

  it("leaves exactly the files the source produces now", async () => {
    expect(rebuild.exitCode, rebuild.output).toBe(EXIT_CODES.SUCCESS);
    const rebuilt = await readInstallTree(rebuiltPluginDir);

    expect(
      Object.keys(rebuilt.files).sort(),
      "a file deleted from the source must not survive in the plugin from the build before",
    ).toStrictEqual(REBUILD_FILES);
    expect(rebuilt.files[`${BUILT_SKILL_DIR}/examples/${KEPT_EXAMPLE}`]).toBe(KEPT_EXAMPLE_BODY);
    expect(rebuilt.emptyDirectories).toStrictEqual([]);
  });

  it("carries the earlier build's version forward, bumped because the content changed", async () => {
    expect(
      await readPluginVersions(pluginsDir, [REBUILT_SKILL_ID]),
      "the earlier build's manifest is read before its folder is replaced",
    ).toStrictEqual({ [REBUILT_SKILL_ID]: "2.0.0" });
  });
});
