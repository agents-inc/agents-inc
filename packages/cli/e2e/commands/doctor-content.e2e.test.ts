import path from "path";
import { readdir, readFile, writeFile } from "fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { describe, it, expect, afterEach } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { cleanupTempDir, completeWithLocalSources } from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import type { RelationshipDefinitions } from "../../src/cli/types/index.js";

/** Longer than CLI_DESCRIPTION_MAX_LENGTH, which downgrades to an advisory warning. */
const OVER_LENGTH_CLI_DESCRIPTION = "x".repeat(75);

/** A slug the E2E fixture marketplace never ships, so a rule naming it resolves to nothing. */
const DANGLING_RULE_SLUG = "angular-standalone";

/**
 * A conflict rule pairing a slug the fixture ships with one it does not. A marketplace's own
 * rules are never narrowed to what it ships, so this is the shape an author's typo takes: the
 * reference is dropped and the rule containing it states nothing.
 */
const RULES_WITH_DANGLING_SLUG: Partial<RelationshipDefinitions> = {
  conflicts: [
    {
      skills: [E2E_SKILL.react.slug, DANGLING_RULE_SLUG],
      reason: "Deliberately names a slug no skill in this marketplace carries",
    },
  ],
};

/** Absolute path to one installed skill's metadata.yaml under the wizard's global HOME. */
async function firstInstalledSkillMetadata(globalHome: string): Promise<string> {
  const installedSkillsDir = path.join(globalHome, DIRS.CLAUDE, DIRS.SKILLS);
  const skillDirs = await readdir(installedSkillsDir);
  expect(skillDirs.length).toBeGreaterThan(0);
  return path.join(installedSkillsDir, firstElement(skillDirs), FILES.METADATA_YAML);
}

describe("doctor layered output", () => {
  let wizard: InitWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "should run both layers and exit 0 on a clean install",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      wizard = await InitWizard.launchInProject();
      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const { exitCode, stdout } = await CLI.run(["doctor"], result.project);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(
        stdout,
        "a clean install must reach the operational layer, not just report clean content",
      ).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SUMMARY);
    },
  );

  /**
   * The two rows that name the same subject in the two layers — what the marketplace
   * HOLDS, and whether it can be reached. They are the pair a vocabulary rename has to
   * move together, and the only rows on the report whose old names are also ordinary
   * English: a report that still heads them "Sources" / "Source Reachable" reads as a
   * surface the rename skipped.
   */
  it(
    "should head both marketplace rows with the marketplace noun",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      wizard = await InitWizard.launchInProject();
      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const { stdout } = await CLI.run(["doctor"], result.project);

      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_MARKETPLACES);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE);
      // Subject guard plus the negative: the row names are the only place "Source"
      // appears capitalised at the head of a line, so the report is asserted to have
      // reached both layers before either absence is claimed.
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(stdout, "the withdrawn row headings must be gone, not merely joined").not.toMatch(
        /^\s*Sources?(\s|$)/m,
      );
      expect(stdout).not.toContain("Source Reachable");
    },
  );

  /**
   * A corrupt installed skill is still an error and still exits non-zero, but only the row that
   * resolves configured ids against the local-skill discovery pass is a cascade of it: that pass
   * drops the skill it cannot read. The rows beside it read config.ts and the names of the files
   * on disk, and one unreadable metadata.yaml leaves both of those answers unchanged.
   */
  it(
    "should stand down only the row a corrupt installed skill can mislead",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      wizard = await InitWizard.launchInProject();
      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Default-scope installs eject to the wizard's global HOME, so the
      // installed skills live under globalHome/.claude.
      const metadataPath = await firstInstalledSkillMetadata(wizard.globalHome);
      await writeFile(metadataPath, ":\n  [unclosed: yaml\n    bad\n");

      const { exitCode, stdout } = await CLI.run(["doctor"], result.project);

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(stdout).toContain(FILES.METADATA_YAML);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR);
      expect(
        stdout,
        "the config row reads config.ts and nothing an installed skill holds",
      ).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(
        stdout,
        "the orphan row compares file names against the config and opens none of them",
      ).toContain(STEP_TEXT.DOCTOR_ROW_NO_ORPHANS);
      expect(stdout).toMatch(
        new RegExp(
          `${STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED}\\s+${STEP_TEXT.DOCTOR_STATUS_SKIP}\\s+Skipped`,
        ),
      );
      // The three negatives above and in the specs beside this one only say the BLANKET skip did
      // not happen, and a row stood down by the wrong pass prints neither string — so nothing at
      // this layer could tell the two skips apart without a positive naming the blocking pass.
      expect(
        stdout,
        "the row must name the pass that blocked it, not merely report itself skipped",
      ).toContain(STEP_TEXT.DOCTOR_SKIP_RESTATING_SKILL_ERRORS);
    },
  );

  it(
    "should keep content warnings non-fatal and still run the operational layer",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      wizard = await InitWizard.launchInProject();
      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const metadataPath = await firstInstalledSkillMetadata(wizard.globalHome);
      const metadata: Record<string, unknown> = parseYaml(await readFile(metadataPath, "utf8"));
      await writeFile(
        metadataPath,
        stringifyYaml({ ...metadata, cliDescription: OVER_LENGTH_CLI_DESCRIPTION }),
      );

      const { exitCode, stdout } = await CLI.run(["doctor"], result.project);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(stdout).toContain("75 characters");
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR);
    },
  );
});

describe("doctor in a skills source repository", () => {
  let source: E2ESource | undefined;

  afterEach(async () => {
    if (source) await cleanupTempDir(source.tempDir);
    source = undefined;
  });

  it(
    "should validate the repository's own content and skip the operational layer",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource();

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: source.sourceDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONTENT_SECTION);
      expect(
        stdout,
        "the source repository under the cwd is the content an author runs doctor to check",
      ).toContain(source.sourceDir);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SKIP_NO_INSTALLATION);
      expect(
        stdout,
        "there is no installed state in a source repo, so operational rows would be noise",
      ).not.toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
    },
  );

  /**
   * The author half of the ruling: standing in the repository that holds the typo, a rule that
   * states nothing is a hard failure. They can open the file, and a run that passed would be
   * telling them the marketplace they are about to publish is sound when it is not.
   */
  it(
    "should fail the run for a slug the repository's own rules dangle",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource({ relationships: RULES_WITH_DANGLING_SLUG });

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: source.sourceDir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(DANGLING_RULE_SLUG);
      expect(
        stdout,
        "the author owns the file, so the line must not tell them it is someone else's",
      ).not.toContain(STEP_TEXT.DOCTOR_FOREIGN_MARKETPLACE_DEFECT);
    },
  );
});

/**
 * The consumer half of the ruling. The same typo, in a marketplace the reader installed from and
 * cannot edit, changes nothing about whether their skills install or resolve — so it must not
 * fail their run, and the line must name the marketplace that shipped it.
 */
describe("doctor in a project whose marketplace dangles a slug", () => {
  let wizard: InitWizard | undefined;
  let source: E2ESource | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (source) await cleanupTempDir(source.tempDir);
    source = undefined;
  });

  it(
    "should warn without failing, and name the marketplace that shipped the rule",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource({ relationships: RULES_WITH_DANGLING_SLUG });
      wizard = await InitWizard.launchInProject({ source });
      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const { exitCode, stdout } = await CLI.run(["doctor"], result.project);

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(DANGLING_RULE_SLUG);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_FOREIGN_MARKETPLACE_DEFECT);
      expect(stdout, "the slug alone does not tell the reader whose defect it is").toContain(
        source.sourceDir,
      );
    },
  );

  /**
   * A warning stands nothing down. `blocks: ["skills"]` is earned by a broken marketplace leaving
   * skills OUT of the matrix; an unresolved rule slug leaves every skill in it, so the row that
   * resolves configured ids has to keep answering for itself.
   */
  it(
    "should leave every operational row answering for itself",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      source = await createE2ESource({ relationships: RULES_WITH_DANGLING_SLUG });
      wizard = await InitWizard.launchInProject({ source });
      const result = await completeWithLocalSources(wizard);
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const { stdout } = await CLI.run(["doctor"], result.project);

      expect(stdout).toContain(STEP_TEXT.DOCTOR_OPERATIONAL_SECTION);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED);
      expect(stdout, "a warning disables no row").not.toMatch(
        new RegExp(
          `${STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED}\\s+${STEP_TEXT.DOCTOR_STATUS_SKIP}\\s+Skipped`,
        ),
      );
    },
  );
});
