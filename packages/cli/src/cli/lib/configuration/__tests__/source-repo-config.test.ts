/**
 * A marketplace source repository's OWN config, which is a different question from an
 * installation's and now gets its own door.
 *
 * `loadProjectSourceConfig` serves both today: "what does this installation's config say" and
 * "what layout does this source repo declare". They part company at the rename
 * (`todo/plans/CLI-source-folder-rename-plan.md`, Step R1 and D5):
 *
 *   - an INSTALLATION's config lives inside a provider folder, `.agents-inc/<provider>/`,
 *     because one installation is exactly one provider and the folder is what says which;
 *   - a SOURCE REPO's config is PROVIDER-NEUTRAL — `<source>/.agents-inc/config.ts`, no
 *     provider segment — because `skillsDir` and `stacksFile` describe the repository's own
 *     layout and have nothing to do with a provider, and a marketplace serving both would
 *     otherwise declare its layout twice.
 *
 * A provider folder must not be mistaken for the repository's own declaration.
 */

import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildSourceConfig } from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { isSourceRepo } from "../../source-validator.js";
import { loadSourceRepoConfig } from "../config.js";

/** Where a source repo declares itself, with no provider segment. */
const SOURCE_REPO_REL = ".agents-inc";

/** A provider folder, which belongs to an INSTALLATION and never to a source repo. */
const CLAUDE_INSTALL_REL = ".agents-inc/claude";

/** Skills directories that say which declaration was the one that got read. */
const DECLARED_BY_THE_NEW_FILE = "catalogue/skills";
const DECLARED_BY_AN_INSTALLATION = "installed/skills";

describe("loadSourceRepoConfig", () => {
  let sourceRepo: string;

  beforeEach(async () => {
    sourceRepo = await createTempDir("cc-source-repo-config-");
  });

  afterEach(async () => {
    await cleanupTempDir(sourceRepo);
  });

  it("reads the provider-neutral file a new source repo carries", async () => {
    await writeTestTsConfig(
      sourceRepo,
      buildSourceConfig({ skillsDir: DECLARED_BY_THE_NEW_FILE }),
      SOURCE_REPO_REL,
    );

    expect((await loadSourceRepoConfig(sourceRepo))?.skillsDir).toBe(DECLARED_BY_THE_NEW_FILE);
  });

  it("answers nothing for a repo that declares neither", async () => {
    expect(await loadSourceRepoConfig(sourceRepo)).toBeNull();
  });

  it("does not read an installation's config out of a provider folder", async () => {
    await writeTestTsConfig(
      sourceRepo,
      buildSourceConfig({ skillsDir: DECLARED_BY_AN_INSTALLATION }),
      CLAUDE_INSTALL_REL,
    );

    expect(
      await loadSourceRepoConfig(sourceRepo),
      "a provider folder is where an installation keeps its own settings — reading it here would let one project's install rewrite a marketplace's layout",
    ).toBeNull();
  });
});

describe("isSourceRepo", () => {
  let sourceRepo: string;

  beforeEach(async () => {
    sourceRepo = await createTempDir("cc-is-source-repo-");
  });

  afterEach(async () => {
    await cleanupTempDir(sourceRepo);
  });

  it("recognises a repo declaring its skills tree in the new file", async () => {
    await writeTestTsConfig(
      sourceRepo,
      buildSourceConfig({ skillsDir: DECLARED_BY_THE_NEW_FILE }),
      SOURCE_REPO_REL,
    );
    await mkdir(path.join(sourceRepo, DECLARED_BY_THE_NEW_FILE), { recursive: true });

    expect(await isSourceRepo(sourceRepo)).toBe(true);
  });

  it("leaves a project that declares no skills tree alone", async () => {
    await writeTestTsConfig(
      sourceRepo,
      buildSourceConfig({ skillsDir: DECLARED_BY_THE_NEW_FILE }),
      SOURCE_REPO_REL,
    );

    expect(
      await isSourceRepo(sourceRepo),
      "without this the spec above would hold for a predicate that answers true to everything",
    ).toBe(false);
  });
});
