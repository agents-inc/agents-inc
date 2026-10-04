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
 * A skill a marketplace ships whose SKILL.md frontmatter does not parse is warned about by every
 * command that loads the marketplace — as a skill whose `metadata.yaml` does not parse already is.
 *
 * Both are skipped by the same scan (`extractAllSkills`), one file apart. The `metadata.yaml` case
 * warns, naming the file; the SKILL.md case said nothing outside `--verbose`, so the skill simply
 * was not there and no command but `doctor` said why. The owner: "yes, this should be warned".
 *
 * The marketplace here ships one of each beside its healthy skills, and every run is read for
 * both. The `metadata.yaml` line is the control and the positive subject guard at once: it proves
 * this command loaded the marketplace and prints what the load warns, so the SKILL.md line's
 * absence is a skip that went unsaid rather than a run that never got as far. The assertion is the
 * broken file's own path under the skills directory, `<dir>/SKILL.md` — any sentence that names
 * the file to fix carries it, and nothing else this run prints does.
 *
 * `init --from` is the third door, and it depends on the `--from` runs printing what their load
 * captured at all — `commands/from-prints-load-warnings` is that half.
 *
 * Observed red against the unfixed build: every command printed the `metadata.yaml` line and
 * nothing about the SKILL.md.
 */

/** Ships a metadata.yaml that reads, beside a SKILL.md whose frontmatter does not. */
const BROKEN_FRONTMATTER_ID = e2eSkillId("web-broken-frontmatter");

/** Ships a SKILL.md that reads, beside a metadata.yaml that does not — the class already warned. */
const BROKEN_METADATA_ID = e2eSkillId("web-broken-metadata");

const BROKEN_FRONTMATTER_FILE = `${BROKEN_FRONTMATTER_ID}/${FILES.SKILL_MD}`;
const BROKEN_METADATA_FILE = `${BROKEN_METADATA_ID}/${FILES.METADATA_YAML}`;

/** Every command run against the installation, with the arguments it needs to load the marketplace. */
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
      // The SKILL.md line first: it is this file's subject, and it stays red until both it and
      // the `--from` replay exist. The metadata.yaml line after it is that replay's own pin.
      const said = flattenCliOutput(output);
      expect(
        said,
        "a skill skipped for a SKILL.md that will not parse is named, as one skipped for its metadata.yaml is",
      ).toContain(BROKEN_FRONTMATTER_FILE);
      expect(said, "the --from run says what its load warns").toContain(BROKEN_METADATA_FILE);
    },
  );
});
