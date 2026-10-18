import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/logger");

import { deleteLocalSkill, migrateLocalSkillScope } from "./local-skill-mover";
import { resolveInstallPaths } from "../installation/install-base-dir";
import { writeTestSkill } from "../__tests__/helpers/disk-writers";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { cleanupTempDir, createTempDir, directoryExists } from "../__tests__/test-fs-utils";
import { SKILLS } from "../__tests__/test-fixtures";
import { verbose, warn } from "../../utils/logger";
import type { SkillId } from "../../types";

/**
 * Real filesystem: which directories a delete or a migration touches is the subject. Ids are
 * refused before any path is built from them, each refusal beside an id the same call accepts.
 */

const SKILL_ID = SKILLS.react.id;
const SIBLING_ID = SKILLS.vitest.id;

/** Each id breaks exactly one rule, so a check that stopped asking one of them lets it through. */
const MALFORMED_IDS = [
  ["empty", ""],
  ["null byte", "web-skill\0name"],
  ["parent segment", "web..skill"],
  ["forward slash", "web/skill"],
  ["backslash", "web\\skill"],
  ["the directory itself", "."],
] as const satisfies readonly (readonly [rule: string, id: string])[];

describe("local skill ids", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-local-skill-ids-");
    projectDir = path.join(tempDir, "project");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  const projectSkillsDir = (): string => resolveInstallPaths(projectDir, "project").skillsDir;
  const globalSkillsDir = (): string => resolveInstallPaths(projectDir, "global").skillsDir;

  describe("deleteLocalSkill", () => {
    it.each(MALFORMED_IDS)(
      "refuses an id with %s and deletes nothing",
      async (_rule, malformedId) => {
        const sibling = await writeTestSkill(projectSkillsDir(), SIBLING_ID, {
          skipMetadata: true,
        });

        // Boundary cast: deliberately malformed id, as a hand-edited config can carry
        await deleteLocalSkill(projectDir, malformedId as SkillId);

        expect(warn).toHaveBeenCalledWith(`Invalid skill ID for deletion: '${malformedId}'`);
        expect(await directoryExists(sibling), "nothing may be deleted for a refused id").toBe(
          true,
        );
      },
    );

    it("deletes the skill a well-formed id names and says so", async () => {
      const skill = await writeTestSkill(projectSkillsDir(), SKILL_ID, { skipMetadata: true });

      await deleteLocalSkill(projectDir, SKILL_ID);

      expect(await directoryExists(skill)).toBe(false);
      expect(verbose).toHaveBeenCalledWith(`Deleted local skill '${SKILL_ID}'`);
    });
  });

  describe("migrateLocalSkillScope", () => {
    it.each(MALFORMED_IDS)(
      "refuses an id with %s and moves nothing",
      async (_rule, malformedId) => {
        const sibling = await writeTestSkill(projectSkillsDir(), SIBLING_ID, {
          skipMetadata: true,
        });

        // Boundary cast: deliberately malformed id, as a hand-edited config can carry
        await migrateLocalSkillScope(malformedId as SkillId, "project", projectDir);

        expect(warn).toHaveBeenCalledWith(`Invalid skill ID for scope migration: '${malformedId}'`);
        expect(await directoryExists(sibling)).toBe(true);
        expect(await directoryExists(globalSkillsDir())).toBe(false);
      },
    );

    it("moves a project skill to the global scope, leaving no project copy", async () => {
      const projectCopy = await writeTestSkill(projectSkillsDir(), SKILL_ID, {
        skipMetadata: true,
      });

      await migrateLocalSkillScope(SKILL_ID, "project", projectDir);

      expect(await directoryExists(path.join(globalSkillsDir(), SKILL_ID))).toBe(true);
      expect(await directoryExists(projectCopy)).toBe(false);
      expect(verbose).toHaveBeenCalledWith(`Migrated skill '${SKILL_ID}' from project to global`);
    });

    it("copies a global skill into the project, keeping the global copy", async () => {
      const globalCopy = await writeTestSkill(globalSkillsDir(), SKILL_ID, { skipMetadata: true });

      await migrateLocalSkillScope(SKILL_ID, "global", projectDir);

      expect(await directoryExists(path.join(projectSkillsDir(), SKILL_ID))).toBe(true);
      expect(await directoryExists(globalCopy)).toBe(true);
      expect(verbose).toHaveBeenCalledWith(`Migrated skill '${SKILL_ID}' from global to project`);
    });

    it("does nothing, quietly, for a skill already at the destination", async () => {
      await writeTestSkill(globalSkillsDir(), SKILL_ID, { skipMetadata: true });

      await migrateLocalSkillScope(SKILL_ID, "project", projectDir);

      expect(warn).not.toHaveBeenCalled();
      expect(verbose).toHaveBeenCalledWith(
        `Skill '${SKILL_ID}' already at global scope — no migration needed`,
      );
    });

    it("warns about a skill at neither scope", async () => {
      await migrateLocalSkillScope(SKILL_ID, "global", projectDir);

      expect(warn).toHaveBeenCalledWith(
        `Could not migrate skill '${SKILL_ID}' — not found at either scope`,
      );
    });
  });
});
