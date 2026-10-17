import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createTempDir,
  readTreeSnapshot,
  renderSkillMd,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { compactCliOutput, flattenCliOutput } from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";
import { BUILT_IN_MATRIX } from "../../src/cli/types/generated/matrix.js";

/**
 * Two marketplaces naming one id would shadow each other, so a marketplace republishing a
 * catalogue-owned id is refused at load. The fixture marketplace in its own namespace is the
 * permitted half.
 */

const CATALOGUE_OWNED_ID = "web-framework-react";

/** The fix is a namespace, so the refusal must say so. */
const NAMESPACE_REMEDY = "namespace";

const STACK_ID = "Collide01";

/**
 * A source registers a skill under its SKILL.md `name`, so rewriting that file is the whole defect.
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
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    namespacedSource = await createE2ESource();
    collidingSource = await createE2ESource();
    await republishUnderCatalogueId(collidingSource);
    store = await startSeedConfigStore();
    store.publish(STACK_ID, e2eStackPayload());
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
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

  it("is refused by init --from, naming the id and the namespace that fixes it", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    const projectBefore = await readTreeSnapshot(projectDir);

    const { exitCode, output: combined } = await runInitFrom(
      store,
      STACK_ID,
      { dir: projectDir, globalHome: tempDir },
      collidingSource.sourceDir,
    );

    expect(exitCode, "a colliding marketplace must not be installed from").not.toBe(
      EXIT_CODES.SUCCESS,
    );
    const output = flattenCliOutput(combined);
    expect(output, "the colliding id must be named").toContain(CATALOGUE_OWNED_ID);
    // Compacted: oclif breaks a long path mid-word.
    expect(compactCliOutput(combined), "the marketplace that shipped it must be named").toContain(
      compactCliOutput(collidingSource.sourceDir),
    );
    expect(output, "the refusal must name the fix, not just the fault").toContain(NAMESPACE_REMEDY);

    // The refusal lands during the load, before anything is written.
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
