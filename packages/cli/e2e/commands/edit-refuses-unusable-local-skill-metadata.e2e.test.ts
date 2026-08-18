import path from "path";
import { writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { CUSTOM_PROJECT_SKILL_ID, ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { flattenCliOutput } from "../fixtures/seed-config-store.js";
import { EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * A saved skill entry whose local files ARE on disk, and whose metadata.yaml describes no
 * skill, stops `edit` before the wizard mounts — the same refusal `compile` raises over the
 * same file, for the same reason: nothing can be loaded for that skill.
 *
 * What it replaces: the entry resolved to nothing, so the run dropped it from config.ts and
 * announced it as "removed (not present in <source>)" — a sentence that blamed the
 * marketplace for a YAML typo in the user's own working copy, and cost them the config
 * record of an install whose files were sitting right there. A marketplace-dropped entry is
 * still removed and still says so; a local skill whose file can be repaired is not.
 */

/** Unparseable YAML: a flow-mapping opener followed by nested compact mappings. */
const UNPARSEABLE_YAML = `{{{ this is not: valid: yaml: "at all\n`;

/** A single token of the `yaml` parser's own reason, safe from output wrapping. */
const PARSE_REASON_TOKEN = "mappings";

type Fixture = {
  projectDir: string;
  tempDir: string;
  metadataPath: string;
  healthyMetadata: string;
};

/**
 * A project whose one skill is CUSTOM — a skill the marketplace has never heard of, which is
 * the only kind whose broken metadata.yaml can make a saved entry unresolvable. Corrupt an
 * ejected copy of a marketplace skill instead and the catalogue still carries the id, so the
 * wizard resolves it from there and nothing is classified at all.
 */
async function seedBrokenCustomSkillMetadata(source: string): Promise<Fixture> {
  const project = await ProjectBuilder.withCustomSkill({ marketplace: source });
  const metadataPath = path.join(
    skillsPath(project.dir),
    CUSTOM_PROJECT_SKILL_ID,
    FILES.METADATA_YAML,
  );
  const healthyMetadata = await readTestFile(metadataPath);
  await writeFile(metadataPath, UNPARSEABLE_YAML);

  return {
    projectDir: project.dir,
    tempDir: path.dirname(project.dir),
    metadataPath,
    healthyMetadata,
  };
}

describe("edit with a saved entry whose installed metadata.yaml describes no skill", () => {
  let tempDir: string;
  let source: E2ESource;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  it(
    "refuses naming the skill, the file and the reason, and keeps the config entry",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const fixture = await seedBrokenCustomSkillMetadata(source.sourceDir);
      tempDir = fixture.tempDir;

      const configBefore = await readTestFile(configTsPath(fixture.projectDir));
      const skillDirsBefore = await listFiles(skillsPath(fixture.projectDir));

      const { exitCode, output } = await CLI.run(["edit"], { dir: fixture.projectDir });

      expect(exitCode, `edit must refuse an unusable metadata.yaml:\n${output}`).toBe(
        EXIT_CODES.ERROR,
      );
      expect(output, "the offending skill must be named").toContain(CUSTOM_PROJECT_SKILL_ID);
      expect(output, "the offending file must be named").toContain(fixture.metadataPath);
      expect(output, "the parser's own reason must reach the user").toContain(PARSE_REASON_TOKEN);
      // The refusal's own closing line. The loader already WARNS about the same file while
      // discovering local skills, so only this sentence distinguishes a run that refused
      // from one that shrugged and carried on into the wizard.
      expect(
        flattenCliOutput(output),
        "the refusal must offer the two ways out and point at doctor",
      ).toContain(STEP_TEXT.METADATA_UNUSABLE_WAY_OUT);
      expect(
        flattenCliOutput(output),
        "a repairable file must not be reported as the marketplace dropping the skill",
      ).not.toContain(STEP_TEXT.REMOVED_REASON_NOT_IN_SOURCE);

      // The whole point: the entry survives the refusal, on disk, byte for byte.
      expect(
        await readTestFile(configTsPath(fixture.projectDir)),
        "config.ts must not lose the entry over a file that can be repaired",
      ).toBe(configBefore);
      expect(await listFiles(skillsPath(fixture.projectDir))).toStrictEqual(skillDirsBefore);
      expect(
        await readTestFile(fixture.metadataPath),
        "edit must not rewrite the file it refused",
      ).toBe(UNPARSEABLE_YAML);
    },
  );

  it(
    "stops refusing once the metadata.yaml is repaired",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      const fixture = await seedBrokenCustomSkillMetadata(source.sourceDir);
      tempDir = fixture.tempDir;
      const refused = await CLI.run(["edit"], { dir: fixture.projectDir });
      expect(flattenCliOutput(refused.output)).toContain(STEP_TEXT.METADATA_UNUSABLE_WAY_OUT);

      await writeFile(fixture.metadataPath, fixture.healthyMetadata);

      const repaired = await CLI.run(["edit"], { dir: fixture.projectDir });

      // The run gets no further than the wizard mount — `CLI.run` has no PTY, so Ink refuses
      // raw mode and the session dies there. That is enough for what this asserts: the guard
      // is keyed to the unusable FILE, not to custom skills or to unresolvable entries at
      // large, so a repaired file must let the run reach the wizard it used to be stopped
      // short of.
      expect(
        flattenCliOutput(repaired.output),
        "a readable metadata.yaml must not be refused",
      ).not.toContain(STEP_TEXT.METADATA_UNUSABLE_WAY_OUT);
    },
  );
});
