import path from "path";
import { writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL, e2eSkillId } from "../fixtures/expected-values.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION, ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  createLocalSkillIn,
  createTempDir,
  flattenCliOutput,
  readTestFile,
  renderMetadataYaml,
  renderUnparseableMetadataYaml,
  renderUnparseableSkillMd,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, SOURCE_PATHS, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A shipped skill whose SKILL.md frontmatter does not parse is warned about by every command that
 * loads the marketplace, as a broken metadata.yaml is; the metadata.yaml line is the control and
 * subject guard. The assertion is the broken file's path.
 */

const BROKEN_FRONTMATTER_ID = e2eSkillId("web-broken-frontmatter");

const BROKEN_METADATA_ID = e2eSkillId("web-broken-metadata");

const BROKEN_FRONTMATTER_FILE = `${BROKEN_FRONTMATTER_ID}/${FILES.SKILL_MD}`;
const BROKEN_METADATA_FILE = `${BROKEN_METADATA_ID}/${FILES.METADATA_YAML}`;

const COMMANDS_THAT_LOAD_THE_MARKETPLACE = [
  ["compile", ["compile"]],
  ["search", ["search", E2E_SKILL.react.slug]],
] as const satisfies readonly (readonly [string, readonly string[]])[];

async function shipBrokenSkills(sourceDir: string): Promise<void> {
  const skillsDir = path.join(sourceDir, SOURCE_PATHS.SKILLS_DIR);

  const frontmatterDir = await createLocalSkillIn(skillsDir, BROKEN_FRONTMATTER_ID, {
    metadata: renderMetadataYaml({
      author: "@agents-inc",
      category: "web-testing",
      domain: "web",
      slug: "broken-frontmatter",
      displayName: "E2E Broken Frontmatter",
      contentHash: "f1e2d3c",
    }),
  });
  await writeFile(
    path.join(frontmatterDir, FILES.SKILL_MD),
    renderUnparseableSkillMd(BROKEN_FRONTMATTER_ID),
  );

  await createLocalSkillIn(skillsDir, BROKEN_METADATA_ID, {
    description: "Shipped with a broken metadata.yaml",
    metadata: renderUnparseableMetadataYaml(),
  });
}

describe("a marketplace skill whose SKILL.md frontmatter does not parse", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    await shipBrokenSkills(source.sourceDir);
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
  });

  afterEach(async () => {
    store.reset();
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it.each(COMMANDS_THAT_LOAD_THE_MARKETPLACE)(
    "is warned about by %s, beside the metadata.yaml the same load already warns about",
    { timeout: TIMEOUTS.INSTALL },
    async (_name, argv) => {
      const project = await ProjectBuilder.editable({ marketplace: source.sourceDir });
      tempDir = path.dirname(project.dir);
      const configBefore = await readTestFile(configTsPath(project.dir));

      const { exitCode, output } = await CLI.run([...argv], project);

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(output);
      expect(said, "this command loaded the marketplace and says what its load warns").toContain(
        BROKEN_METADATA_FILE,
      );
      expect(said).toContain(STEP_TEXT.MARKETPLACE_METADATA_UNPARSEABLE);
      expect(
        said,
        "a skill skipped for a SKILL.md that will not parse is named, as one skipped for its metadata.yaml is",
      ).toContain(BROKEN_FRONTMATTER_FILE);
      expect(
        await readTestFile(configTsPath(project.dir)),
        "a warning is all the run owes — config.ts is not rewritten",
      ).toBe(configBefore);
    },
  );

  it(
    "is warned about by init --from, beside the metadata.yaml the same load warns about",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      store.publish(
        "Frontmt1",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        }),
      );

      const { exitCode, output } = await runInitFrom(
        store,
        "Frontmt1",
        { dir: tempDir },
        source.sourceDir,
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
      const said = flattenCliOutput(output);
      expect(
        said,
        "a skill skipped for a SKILL.md that will not parse is named, as one skipped for its metadata.yaml is",
      ).toContain(BROKEN_FRONTMATTER_FILE);
      expect(said, "the --from run says what its load warns").toContain(BROKEN_METADATA_FILE);
    },
  );
});
