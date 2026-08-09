import path from "path";
import { readdir, readFile, writeFile } from "fs/promises";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  ensureBinaryExists,
} from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/** Longer than CLI_DESCRIPTION_MAX_LENGTH, which downgrades to an advisory warning. */
const OVER_LENGTH_CLI_DESCRIPTION = "x".repeat(75);

/** Absolute path to one installed skill's metadata.yaml under the wizard's global HOME. */
async function firstInstalledSkillMetadata(globalHome: string): Promise<string> {
  const installedSkillsDir = path.join(globalHome, DIRS.CLAUDE, DIRS.SKILLS);
  const skillDirs = await readdir(installedSkillsDir);
  expect(skillDirs.length).toBeGreaterThan(0);
  return path.join(installedSkillsDir, firstElement(skillDirs), FILES.METADATA_YAML);
}

describe("doctor layered output", () => {
  let wizard: InitWizard | undefined;

  beforeAll(ensureBinaryExists);

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
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONTENT_ERRORS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SUMMARY);
    },
  );

  it(
    "should stop at the content layer and exit non-zero when an installed skill is corrupt",
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
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONTENT_ERRORS);
      expect(
        stdout,
        "operational findings on broken content are downstream cascades and must not be printed",
      ).not.toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
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
      expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONTENT_ERRORS);
    },
  );
});

describe("doctor in a skills source repository", () => {
  let source: E2ESource | undefined;

  beforeAll(ensureBinaryExists);

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
});
