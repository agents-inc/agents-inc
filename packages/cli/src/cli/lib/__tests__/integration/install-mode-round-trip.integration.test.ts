import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "fs/promises";

import { deleteLocalSkill } from "../../skills/local-skill-mover";
import { buildAgentScopeMap } from "../../installation/local-installer";
import {
  compileAgentsAllScopes,
  copyLocalSkills,
  discoverInstalledSkills,
  loadAgentDefs,
  writeProjectConfig,
} from "../../operations/index.js";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import type { ProjectConfig, SkillId } from "../../../types";
import { LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../../consts";
import { createMatrixFromTestSkills } from "../factories/matrix-factories.js";
import { buildInstallSelection, initMatrixAndSource } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { readTestTsConfig } from "../helpers/config-io.js";
import { fileExists, directoryExists } from "../test-fs-utils";
import { expectSkillConfigs } from "../assertions/index.js";
import { INSTALL_MODE_SKILLS, LOCAL_SKILL_VARIANTS } from "../mock-data/mock-skills.js";

const REACT_SKILL_ID: SkillId = "web-framework-react";
// Boundary cast: TestSkill.id is string, but INSTALL_MODE_SKILLS contains valid SkillIds
const ALL_SKILL_NAMES = INSTALL_MODE_SKILLS.map((s) => s.id) as SkillId[];

/** The three operations `commands/init.tsx` runs, in its order. */
async function reinstallAllSkills(dirs: TestDirs) {
  const matrix = createMatrixFromTestSkills(INSTALL_MODE_SKILLS);
  const skills = buildSkillConfigs(ALL_SKILL_NAMES, { origin: "eject" });
  const selection = buildInstallSelection(skills, { selectedAgents: ["web-developer"] });
  const sourceResult = initMatrixAndSource(matrix, dirs.sourceDir);

  const copied = await copyLocalSkills(skills, dirs.projectDir, sourceResult);
  const config = await writeProjectConfig({
    selection,
    sourceResult,
    projectDir: dirs.projectDir,
  });

  const agentDefs = await loadAgentDefs();
  const { allSkills } = await discoverInstalledSkills(dirs.projectDir);
  const compilation = await compileAgentsAllScopes({
    projectDir: dirs.projectDir,
    sourcePath: agentDefs.sourcePath,
    skills: allSkills,
    agentScopeMap: buildAgentScopeMap(config.config),
  });

  return { copied, config, compilation };
}

describe("Integration: install-mode round trip with delete and re-copy", () => {
  let dirs: TestDirs;

  beforeEach(async () => {
    dirs = await createTestSource({
      skills: INSTALL_MODE_SKILLS,
      localSkills: LOCAL_SKILL_VARIANTS,
    });
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  describe("Delete local skill", () => {
    it("should delete a local skill directory completely", async () => {
      const skillDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, REACT_SKILL_ID);

      expect(await directoryExists(skillDir)).toBe(true);
      expect(await fileExists(path.join(skillDir, STANDARD_FILES.SKILL_MD))).toBe(true);

      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);

      expect(await directoryExists(skillDir)).toBe(false);

      const archivedDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, "_archived");
      expect(await directoryExists(archivedDir)).toBe(false);
    });

    it("should handle deleting a non-existent skill silently", async () => {
      // Boundary cast: intentionally testing nonexistent skill ID
      const nonExistentSkill = "web-framework-nonexistent" as SkillId;

      await deleteLocalSkill(dirs.projectDir, nonExistentSkill);
    });

    it("should handle deleting the same skill twice", async () => {
      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);

      const skillDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, REACT_SKILL_ID);
      expect(await directoryExists(skillDir)).toBe(false);

      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);
    });
  });

  describe("Delete and re-copy from source", () => {
    it("should delete local skill then re-copy from source (content matches source, not local edits)", async () => {
      const skillDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, REACT_SKILL_ID);

      const localContent = await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(localContent).toContain("Local Version");

      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);
      expect(await directoryExists(skillDir)).toBe(false);

      await reinstallAllSkills(dirs);

      const reCopiedContent = await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(reCopiedContent).toContain("Marketplace Version");
      expect(reCopiedContent).not.toContain("Local Version");
    });

    it("should handle full install pipeline after deleting local skills", async () => {
      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);

      const { copied, config: configResult, compilation } = await reinstallAllSkills(dirs);

      expect(copied.projectCopied.map((skill) => skill.skillId).sort()).toStrictEqual(
        [...ALL_SKILL_NAMES].sort(),
      );
      expect(compilation.compiled).toStrictEqual(["web-developer"]);
      expect(compilation.failed).toStrictEqual([]);

      expect(await fileExists(configResult.configPath)).toBe(true);
      const config = await readTestTsConfig<ProjectConfig>(configResult.configPath);
      expectSkillConfigs(config, buildSkillConfigs(ALL_SKILL_NAMES, { origin: "eject" }));

      const archivedDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, "_archived");
      expect(await directoryExists(archivedDir)).toBe(false);
    });
  });

  describe("Mode migration: eject to plugin to eject round-trip", () => {
    it("should delete eject skills when switching to plugin, re-copy when switching back", async () => {
      const skillDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH, REACT_SKILL_ID);

      const originalContent = await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(originalContent).toContain("Local Version");

      // Simulates eject -> plugin.
      await deleteLocalSkill(dirs.projectDir, REACT_SKILL_ID);
      expect(await directoryExists(skillDir)).toBe(false);

      // Simulates plugin -> eject.
      await reinstallAllSkills(dirs);

      const reCopiedContent = await readFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(reCopiedContent).toContain("Marketplace Version");
      expect(reCopiedContent).not.toContain("Local Version");
    });
  });
});
