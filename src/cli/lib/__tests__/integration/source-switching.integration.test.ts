import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "fs/promises";

import { deleteLocalSkill } from "../../skills/source-switcher";
import { installEject } from "../../installation/local-installer";
import {
  createTestSource,
  cleanupTestSource,
  type TestDirs,
  type TestSkill,
} from "../fixtures/create-test-source";
import type { ProjectConfig, SkillId } from "../../../types";
import { LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../../consts";
import { createMatrixFromTestSkills } from "../factories/matrix-factories.js";
import { buildWizardResult, initMatrixAndSource } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { readTestTsConfig } from "../helpers/config-io.js";
import { fileExists, directoryExists } from "../test-fs-utils";
import { expectConfigSkills, expectInstallResult } from "../assertions/index.js";
import { SWITCHABLE_SKILLS, LOCAL_SKILL_VARIANTS } from "../mock-data/mock-skills.js";
import type { SkillConfig } from "../../../types/config";

const REACT_SKILL_ID: SkillId = "web-framework-react";
// Boundary cast: TestSkill.id is string, but SWITCHABLE_SKILLS contains valid SkillIds
const ALL_SKILL_NAMES = SWITCHABLE_SKILLS.map((s) => s.id) as SkillId[];

/** Re-runs the eject install for every switchable skill (the re-copy path). */
async function reinstallAllSkills(dirs: TestDirs) {
  const matrix = createMatrixFromTestSkills(SWITCHABLE_SKILLS);
  const wizardResult = buildWizardResult(buildSkillConfigs(ALL_SKILL_NAMES, { source: "eject" }), {
    selectedAgents: ["web-developer"],
  });
  const sourceResult = initMatrixAndSource(matrix, dirs.sourceDir);
  return installEject({ wizardResult, sourceResult, projectDir: dirs.projectDir });
}

describe("Integration: Source Switching with Delete", () => {
  let dirs: TestDirs;

  beforeEach(async () => {
    dirs = await createTestSource({
      skills: SWITCHABLE_SKILLS,
      localSkills: LOCAL_SKILL_VARIANTS,
    });
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  describe("Delete local skill", () => {
    it("should delete a local skill directory completely", async () => {
      const skillDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, REACT_SKILL_ID);

      // Verify skill exists before deleting
      expect(await directoryExists(skillDir)).toBe(true);
      expect(await fileExists(path.join(skillDir, STANDARD_FILES.SKILL_MD))).toBe(true);

      // Delete
      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);

      // Verify skill directory is gone
      expect(await directoryExists(skillDir)).toBe(false);

      // Verify NO _archived directory was created
      const archivedDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, "_archived");
      expect(await directoryExists(archivedDir)).toBe(false);
    });

    it("should handle deleting a non-existent skill silently", async () => {
      // Boundary cast: intentionally testing nonexistent skill ID
      const nonExistentSkill = "web-framework-nonexistent" as SkillId;

      // Should not throw
      await deleteLocalSkill(dirs.projectDir, nonExistentSkill);
    });

    it("should handle deleting the same skill twice", async () => {
      // Delete once
      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);

      const skillDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, REACT_SKILL_ID);
      expect(await directoryExists(skillDir)).toBe(false);

      // Delete again - should not throw
      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);
    });
  });

  describe("Delete and re-copy from source", () => {
    it("should delete local skill then re-copy from source (content matches source, not local edits)", async () => {
      const skillDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, REACT_SKILL_ID);

      // Read local content first (should contain "Local Version")
      const localContent = await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(localContent).toContain("Local Version");

      // Delete the local skill
      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);
      expect(await directoryExists(skillDir)).toBe(false);

      // Re-copy from source using installEject
      await reinstallAllSkills(dirs);

      // Read the re-copied content - should contain "Marketplace Version" (from source), NOT "Local Version"
      const reCopiedContent = await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(reCopiedContent).toContain("Marketplace Version");
      expect(reCopiedContent).not.toContain("Local Version");
    });

    it("should handle full install pipeline after deleting local skills", async () => {
      // Delete react skill
      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);

      // Run installEject with all skills
      const installResult = await reinstallAllSkills(dirs);

      // Verify install result shape
      expectInstallResult(installResult, {
        copiedSkillIds: [...ALL_SKILL_NAMES],
        compiledAgents: ["web-developer"],
      });

      // Verify config generated with exact skill list
      expect(await fileExists(installResult.configPath)).toBe(true);
      const config = await readTestTsConfig<ProjectConfig>(installResult.configPath);
      expectConfigSkills(config, [...ALL_SKILL_NAMES]);

      // Verify NO _archived directory exists
      const archivedDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, "_archived");
      expect(await directoryExists(archivedDir)).toBe(false);
    });
  });

  describe("Mode migration: eject to plugin to eject round-trip", () => {
    it("should delete eject skills when switching to plugin, re-copy when switching back", async () => {
      const skillDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, REACT_SKILL_ID);

      // Read original local content
      const originalContent = await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(originalContent).toContain("Local Version");

      // Delete (simulates eject -> plugin switch)
      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);
      expect(await directoryExists(skillDir)).toBe(false);

      // Re-copy from source (simulates plugin -> eject switch)
      await reinstallAllSkills(dirs);

      // Content should be marketplace version (NOT preserved local edits)
      const reCopiedContent = await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(reCopiedContent).toContain("Marketplace Version");
      expect(reCopiedContent).not.toContain("Local Version");
    });
  });
});
