import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createTempDir,
  ensureBinaryExists,
  readTreeSnapshot,
  renderSkillMd,
  runCLI,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";
import { BUILT_IN_MATRIX } from "../../src/cli/types/generated/matrix.js";

/**
 * A skill id is the directory the skill installs into, and Claude reads
 * `~/.claude` and `./.claude` together — so two marketplaces naming one id means
 * one silently shadows the other. The namespace rule makes that unrepresentable
 * by construction; this is the guard that catches a marketplace which never ran
 * the build that enforces it.
 *
 * The fixture marketplace publishes in its own namespace, so it is the positive
 * half: if the guard were a blanket refusal of every custom marketplace, the
 * second test here would fail rather than the whole suite going quiet.
 */

/** An id the shipped catalogue owns, asserted against the catalogue below. */
const CATALOGUE_OWNED_ID = "web-framework-react";

/** The word the refusal has to reach for, since a namespace is the fix. */
const NAMESPACE_REMEDY = "namespace";

/**
 * Republishes one of the fixture's skills under an id the public catalogue owns.
 * The id a source registers a skill under is its SKILL.md frontmatter `name`, so
 * rewriting that one file is the whole of what a marketplace which skipped the
 * namespace rule looks like on disk.
 */
async function republishUnderCatalogueId(source: E2ESource): Promise<void> {
  const skillMdPath = path.join(
    source.sourceDir,
    SOURCE_PATHS.SKILLS_DIR,
    E2E_SKILL.react.id,
    FILES.SKILL_MD,
  );
  await writeFile(skillMdPath, renderSkillMd(CATALOGUE_OWNED_ID, "Collides with the catalogue"));
}

describe("a marketplace colliding with the public catalogue", () => {
  let namespacedSource: E2ESource;
  let collidingSource: E2ESource;
  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    namespacedSource = await createE2ESource();
    collidingSource = await createE2ESource();
    await republishUnderCatalogueId(collidingSource);
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupTempDir(namespacedSource.tempDir);
    await cleanupTempDir(collidingSource.tempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it("is an id the shipped catalogue really owns", () => {
    expect(
      CATALOGUE_OWNED_ID in BUILT_IN_MATRIX.skills,
      "the fixture must collide with the catalogue for the refusal below to mean anything",
    ).toBe(true);
  });

  it("is refused by init, naming the id and the namespace that fixes it", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    const projectBefore = await readTreeSnapshot(projectDir);

    const { exitCode, combined } = await runCLI(
      ["init", "--marketplace", collidingSource.sourceDir],
      projectDir,
      { env: { HOME: tempDir } },
    );

    expect(exitCode, "a colliding marketplace must not reach the wizard").not.toBe(
      EXIT_CODES.SUCCESS,
    );
    const output = flattenCliOutput(combined);
    expect(output, "the colliding id must be named").toContain(CATALOGUE_OWNED_ID);
    expect(output, "the marketplace that shipped it must be named").toContain(
      collidingSource.sourceDir,
    );
    expect(output, "the refusal must name the fix, not just the fault").toContain(NAMESPACE_REMEDY);

    // The refusal lands during the load, before anything is installed or written.
    expect(
      await readTreeSnapshot(projectDir),
      "a refused marketplace must leave the project exactly as it found it",
    ).toStrictEqual(projectBefore);
  });

  it("does not refuse the fixture marketplace, whose ids carry its own namespace", async () => {
    const project = await ProjectBuilder.editable({
      marketplace: namespacedSource.sourceDir,
      skills: [E2E_SKILL.react.id],
      agents: ["web-developer"],
    });
    tempDir = path.dirname(project.dir);

    const { exitCode, output } = await CLI.run(["search", E2E_SKILL.react.slug], project);

    expect(exitCode, "a namespaced marketplace loads like any other").toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(output), "its skills must still be found").toContain(
      E2E_SKILL.react.id,
    );
  });
});
