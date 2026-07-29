import { describe, it, expect, beforeAll, afterEach } from "vitest";
import path from "path";
import { readdir, writeFile } from "fs/promises";
import { CLI } from "../fixtures/cli.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  createTempDir,
  ensureBinaryExists,
} from "../helpers/test-utils.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";

describe("validate command", () => {
  let wizard: InitWizard | undefined;
  let tempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("help", () => {
    it("should display validate help without removed flags", async () => {
      tempDir = await createTempDir();

      const { exitCode, stdout } = await CLI.run(["validate", "--help"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Validate");
      expect(stdout).not.toContain("--plugins");
      expect(stdout).not.toContain("--all");
      expect(stdout).not.toContain("--verbose");
    });
  });

  describe("installed project", () => {
    describe("no-args flow", () => {
      it(
        "should validate a registered source after `cc init` and exit 0",
        { timeout: TIMEOUTS.LIFECYCLE },
        async () => {
          wizard = await InitWizard.launchInProject();
          const result = await completeWithLocalSources(wizard);
          expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

          const { exitCode, stdout } = await CLI.run(["validate"], result.project);

          expect(exitCode).toBe(EXIT_CODES.SUCCESS);
          expect(stdout).toContain("Validating sources");
          expect(stdout).toContain("Validating plugins");
          expect(stdout).toMatch(/Result: 0 error\(s\), \d+ warning\(s\)/);
          // Human displayNames in id-named directories are the marketplace convention —
          // the source pass must not warn about them (dirname is checked against the skill id)
          expect(stdout).not.toContain("does not match");
        },
      );
    });

    describe("installed skills and agents", () => {
      it(
        "should report valid installed skills with exit 0",
        { timeout: TIMEOUTS.LIFECYCLE },
        async () => {
          wizard = await InitWizard.launchInProject();
          const result = await completeWithLocalSources(wizard);
          expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

          const { exitCode, stdout } = await CLI.run(["validate"], result.project);

          expect(exitCode).toBe(EXIT_CODES.SUCCESS);
          expect(stdout).toContain("Validating skills");
          // Eject mode copies skills to `<project>/.claude/skills/` — the installed-
          // skill validator emits a per-directory line of the form:
          //   <path>  <N> skill(s), 0 invalid, <M> with warnings
          expect(stdout).toMatch(/\d+ skill\(s\), 0 invalid, \d+ with warnings/);
          expect(stdout).toMatch(/Result: 0 error\(s\), \d+ warning\(s\)/);
        },
      );

      it(
        "should exit 1 when an installed skill has broken metadata.yaml",
        { timeout: TIMEOUTS.LIFECYCLE },
        async () => {
          wizard = await InitWizard.launchInProject();
          const result = await completeWithLocalSources(wizard);
          expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

          // Corrupt one installed skill's metadata.yaml so the installed-skill
          // validator rejects it. Default-scope installs eject to the wizard's
          // global HOME, so the installed skills live under globalHome/.claude.
          const installedSkillsDir = path.join(wizard.globalHome, DIRS.CLAUDE, DIRS.SKILLS);
          const skillDirs = await readdir(installedSkillsDir);
          expect(skillDirs.length).toBeGreaterThan(0);
          const corruptedMetadata = path.join(
            installedSkillsDir,
            skillDirs[0],
            FILES.METADATA_YAML,
          );
          await writeFile(corruptedMetadata, ":\n  [unclosed: yaml\n    bad\n");

          const { exitCode, stdout } = await CLI.run(["validate"], result.project);

          expect(exitCode).toBe(EXIT_CODES.ERROR);
          expect(stdout).toContain("Validating skills");
          expect(stdout).toMatch(/Result: [1-9]\d* error\(s\)/);
        },
      );

      it(
        "should report the Validating agents section with an agent count",
        { timeout: TIMEOUTS.LIFECYCLE },
        async () => {
          wizard = await InitWizard.launchInProject();
          const result = await completeWithLocalSources(wizard);
          expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

          const { exitCode, stdout } = await CLI.run(["validate"], result.project);

          expect(exitCode).toBe(EXIT_CODES.SUCCESS);
          expect(stdout).toContain("Validating agents");
          expect(stdout).toMatch(/\d+ agent\(s\)/);
        },
      );

      it(
        "should emit all four section headers (sources, plugins, skills, agents) in a fully installed project",
        { timeout: TIMEOUTS.LIFECYCLE },
        async () => {
          wizard = await InitWizard.launchInProject();
          const result = await completeWithLocalSources(wizard);
          expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

          const { exitCode, stdout } = await CLI.run(["validate"], result.project);

          expect(exitCode).toBe(EXIT_CODES.SUCCESS);
          // All four validation passes must render their headers in a fully installed project
          expect(stdout).toContain("Validating sources");
          expect(stdout).toContain("Validating plugins");
          expect(stdout).toContain("Validating skills");
          expect(stdout).toContain("Validating agents");
        },
      );
    });
  });
});
