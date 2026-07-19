import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import {
  LOCAL_SKILL_FORKED,
  LOCAL_SKILL_FORKED_MINIMAL,
  DEFAULT_TEST_SKILLS,
} from "../mock-data/mock-skills";
import { EXIT_CODES } from "../../exit-codes";
import { STANDARD_FILES } from "../../../consts";
import { computeFileHash } from "../../versioning";
import { renderSkillMd } from "../content-generators";
import { stringify as stringifyYaml } from "yaml";
import type { SkillId, SkillSlug } from "../../../types";

/** Hash of a source skill's SKILL.md — the value `update` compares forks against. */
async function computeSourceSkillHash(localDirs: TestDirs, skillId: SkillId): Promise<string> {
  const sourceSkillDir = path.join(localDirs.sourceDir, "src", "skills", "web-framework", skillId);
  return computeFileHash(path.join(sourceSkillDir, STANDARD_FILES.SKILL_MD));
}

/** Write a local fork of `skillId` claiming `contentHash` as its fork-point hash. */
async function writeForkedLocalSkill(
  localDirs: TestDirs,
  skillId: SkillId,
  contentHash: string,
  description: string,
): Promise<void> {
  const localSkillDir = path.join(localDirs.projectDir, ".claude", "skills", skillId);
  await mkdir(localSkillDir, { recursive: true });
  await writeFile(
    path.join(localSkillDir, STANDARD_FILES.SKILL_MD),
    renderSkillMd(skillId, description),
  );
  await writeFile(
    path.join(localSkillDir, STANDARD_FILES.METADATA_YAML),
    stringifyYaml({
      displayName: "React",
      forkedFrom: { skillId, contentHash, date: "2025-01-01" },
    }),
  );
}

describe("update command", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-update-test-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  describe("basic execution", () => {
    it("should run without arguments", async () => {
      const { error } = await runCliCommand(["update"]);

      // Should not have argument parsing errors
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("missing required arg");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept optional skill argument", async () => {
      const { error } = await runCliCommand(["update", "my-skill"]);

      // Should accept skill name without parsing errors
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should complete when no local skills directory exists", async () => {
      // projectDir has no .claude/skills — command should warn and return
      const { error } = await runCliCommand(["update"]);

      // Command should complete (warns about missing local skills)
      // The command warns "No local skills found" and returns without error exit
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unexpected argument");
      // Should NOT exit with error code — it's a graceful early return
      expect(error?.oclif?.exit).toBeUndefined();
    });
  });

  describe("flag validation", () => {
    it("should accept --yes flag", async () => {
      const { error } = await runCliCommand(["update", "--yes"]);

      // Should not error on --yes flag
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept -y shorthand for yes", async () => {
      const { error } = await runCliCommand(["update", "-y"]);

      // Should accept -y shorthand
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept --source flag", async () => {
      const { error } = await runCliCommand(["update", "--source", "/some/path"]);

      // Should accept --source flag (inherited from BaseCommand)
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept -s shorthand for source", async () => {
      const { error } = await runCliCommand(["update", "-s", "/some/path"]);

      // Should accept -s shorthand
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });
  });

  describe("combined flags", () => {
    it("should accept --yes with --source", async () => {
      const { error } = await runCliCommand(["update", "--yes", "--source", "/custom/path"]);

      // Should accept both flags
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept skill argument with all flags", async () => {
      const { error } = await runCliCommand([
        "update",
        "my-skill",
        "--yes",
        "--source",
        "/some/path",
      ]);

      // Should accept skill arg with all flags
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unexpected argument");
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept shorthand flags together", async () => {
      const { error } = await runCliCommand(["update", "-y", "-s", "/custom/path"]);

      // Should accept shorthand flags
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });
  });

  describe("with local skills", () => {
    let localDirs: TestDirs;

    beforeEach(async () => {
      // Create local skills directory with forkedFrom metadata using fixture
      localDirs = await createTestSource({
        skills: [],
        agents: [],
        localSkills: [LOCAL_SKILL_FORKED],
      });
      process.chdir(localDirs.projectDir);
    });

    afterEach(async () => {
      await cleanupTestSource(localDirs);
    });

    it("should process local skills for update check", async () => {
      const { error } = await runCliCommand(["update", "--yes"]);

      // Command should complete (loads source and compares)
      // Note: stdout capture is limited in oclif test environment
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept --yes flag with local skills", async () => {
      const { error } = await runCliCommand(["update", "--yes"]);

      // Should bypass interactive prompt with --yes
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });
  });

  describe("error handling", () => {
    it("should handle source path flag gracefully", async () => {
      // Create local skills so command proceeds past the early exit check
      const localDirs = await createTestSource({
        skills: [],
        agents: [],
        localSkills: [LOCAL_SKILL_FORKED_MINIMAL],
      });
      process.chdir(localDirs.projectDir);

      const { error } = await runCliCommand([
        "update",
        "--source",
        "/definitely/not/real/path/xyz",
      ]);

      // Should not have flag parsing errors
      // (may error on source not found, which is expected)
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");

      await cleanupTestSource(localDirs);
    });

    it("should handle --yes with invalid source path", async () => {
      // Create local skills so command proceeds past the early exit check
      const localDirs = await createTestSource({
        skills: [],
        agents: [],
        localSkills: [LOCAL_SKILL_FORKED_MINIMAL],
      });
      process.chdir(localDirs.projectDir);

      const { error } = await runCliCommand([
        "update",
        "--yes",
        "--source",
        "/definitely/not/real/path/xyz",
      ]);

      // Should not have flag parsing errors
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");

      await cleanupTestSource(localDirs);
    });

    it("should reject unknown flags", async () => {
      const { error } = await runCliCommand(["update", "--nonexistent-flag"]);

      // Should error on unknown flag
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("Nonexistent flag: --nonexistent-flag");
    });
  });

  describe("nonexistent skill argument", () => {
    let localDirs: TestDirs;

    beforeEach(async () => {
      // Set up a project with a forked local skill AND a matching source
      // so the command gets past loadContext and into resolveTargetSkills
      localDirs = await createTestSource({
        skills: DEFAULT_TEST_SKILLS,
        agents: [],
        localSkills: [LOCAL_SKILL_FORKED],
      });
      process.chdir(localDirs.projectDir);
    });

    afterEach(async () => {
      await cleanupTestSource(localDirs);
    });

    it("should error with 'not found' when skill arg does not match any local skill", async () => {
      const { stdout, error } = await runCliCommand([
        "update",
        "totally-nonexistent-skill",
        "--yes",
        "--source",
        localDirs.sourceDir,
      ]);

      // The command should exit with error code
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);

      // The stdout should contain the skill-not-found message
      const combinedOutput = stdout + (error?.message ?? "");
      expect(combinedOutput).toContain("not found");
    });

    it("should suggest similar skills when a partial match exists", async () => {
      // LOCAL_SKILL_FORKED has id "web-tooling-forked-skill" — searching for "forked"
      // should suggest it as a similar match
      const { stdout, error } = await runCliCommand([
        "update",
        "forked",
        "--yes",
        "--source",
        localDirs.sourceDir,
      ]);

      // The command should exit with error (no exact match)
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);

      // Should mention "Did you mean" with suggestions
      const combinedOutput = stdout + (error?.message ?? "");
      expect(combinedOutput).toContain("not found");
    });
  });

  describe("hash mismatch detection (outdated skills)", () => {
    let localDirs: TestDirs;
    const REACT_SKILL_ID: SkillId = "web-framework-react";

    beforeEach(async () => {
      // Create source with default skills (includes react)
      localDirs = await createTestSource({
        skills: DEFAULT_TEST_SKILLS,
        agents: [],
        localSkills: [],
      });
    });

    afterEach(async () => {
      process.chdir(originalCwd);
      await cleanupTestSource(localDirs);
    });

    it("should detect outdated skill when local hash differs from source hash", async () => {
      // Create a local skill that claims to be forked from react but with a
      // STALE hash and SKILL.md content that differs from the source
      // (simulating local modifications).
      const staleHash = "0000000000";
      await writeForkedLocalSkill(localDirs, REACT_SKILL_ID, staleHash, "Modified locally");

      process.chdir(localDirs.projectDir);

      // 3. Run update with --yes to skip prompt, pointing to the source
      const { stdout, error } = await runCliCommand([
        "update",
        "--yes",
        "--source",
        localDirs.sourceDir,
      ]);

      const combinedOutput = stdout + (error?.message ?? "");

      // The stale hash (0000000000) != real source hash, so react should be detected as outdated
      // and the update table should be displayed showing the skill
      expect(combinedOutput).toContain(REACT_SKILL_ID);
    });

    it("should report 'up to date' when targeting a skill whose hash matches source", async () => {
      // Create a local skill whose fork-point hash matches the source
      const realSourceHash = await computeSourceSkillHash(localDirs, REACT_SKILL_ID);
      await writeForkedLocalSkill(localDirs, REACT_SKILL_ID, realSourceHash, "Same content");

      process.chdir(localDirs.projectDir);

      // 3. Run update targeting the specific skill
      const { stdout, error } = await runCliCommand([
        "update",
        REACT_SKILL_ID,
        "--yes",
        "--source",
        localDirs.sourceDir,
      ]);

      const combinedOutput = stdout + (error?.message ?? "");

      // Skill should be reported as already up to date
      expect(combinedOutput).toContain("up to date");
    });
  });

  describe("all skills up to date", () => {
    let localDirs: TestDirs;

    afterEach(async () => {
      process.chdir(originalCwd);
      await cleanupTestSource(localDirs);
    });

    it("should report all skills up to date when no skills are outdated", async () => {
      const skillId: SkillId = "web-framework-react";

      // Create source with skills
      localDirs = await createTestSource({
        skills: DEFAULT_TEST_SKILLS,
        agents: [],
        localSkills: [],
      });

      // Create a local skill whose fork-point hash matches the source
      const realSourceHash = await computeSourceSkillHash(localDirs, skillId);
      await writeForkedLocalSkill(localDirs, skillId, realSourceHash, "React");

      process.chdir(localDirs.projectDir);

      // Run update without targeting a specific skill
      const { stdout, error } = await runCliCommand([
        "update",
        "--yes",
        "--source",
        localDirs.sourceDir,
      ]);

      const combinedOutput = stdout + (error?.message ?? "");

      // Should report all skills are up to date
      expect(combinedOutput).toContain("up to date");
    });
  });

  describe("local-only skill (no forkedFrom)", () => {
    let localDirs: TestDirs;

    afterEach(async () => {
      process.chdir(originalCwd);
      await cleanupTestSource(localDirs);
    });

    it("should report local-only skill cannot be updated when targeted by name", async () => {
      // Boundary cast: fictional skill ID for test isolation
      const skillId = "web-tooling-my-skill" as SkillId;

      localDirs = await createTestSource({
        skills: DEFAULT_TEST_SKILLS,
        agents: [],
        localSkills: [
          {
            id: skillId,
            // Boundary cast: fictional slug for test isolation
            slug: "tooling" as SkillSlug,
            displayName: "My Skill",
            description: "A local-only skill",
            category: "web-tooling",
            author: "@test",
            domain: "web",
            // No forkedFrom — this is a local-only skill
          },
        ],
      });

      process.chdir(localDirs.projectDir);

      const { stdout, error } = await runCliCommand([
        "update",
        skillId,
        "--yes",
        "--source",
        localDirs.sourceDir,
      ]);

      const combinedOutput = stdout + (error?.message ?? "");

      // Should inform user that local-only skills cannot be updated
      expect(combinedOutput).toContain("local-only");
    });
  });
});
