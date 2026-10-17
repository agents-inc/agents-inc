/**
 * A source repo's own config is provider-neutral (`<source>/.agents-inc/config.ts`); a provider
 * folder belongs to an installation and must not be read as the repo's declaration.
 */

import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildSourceConfig } from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { isSourceRepo } from "../../source-validator.js";
import { loadSourceRepoConfig } from "../config.js";

const SOURCE_REPO_REL = ".agents-inc";

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
