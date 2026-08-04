import os from "os";
import { compareLocalSkillsWithSource, type SkillComparisonResult } from "../../skills/index.js";
import { typedEntries } from "../../../utils/typed-object.js";
import { collectScopedSkillDirs } from "./collect-scoped-skill-dirs.js";
import type { MergedSkillsMatrix, ResolvedSkill, SkillId } from "../../../types/index.js";

export type SkillComparisonResults = {
  projectResults: SkillComparisonResult[];
  globalResults: SkillComparisonResult[];
  /** Merged results with project taking precedence over global. */
  merged: SkillComparisonResult[];
};

/**
 * Builds a map of source skill IDs to their paths, excluding local-only skills.
 * Used by both compareSkillsWithSource and diff command.
 */
export function buildSourceSkillsMap(
  matrix: MergedSkillsMatrix,
): Partial<Record<SkillId, Pick<ResolvedSkill, "path">>> {
  const sourceSkills: Partial<Record<SkillId, Pick<ResolvedSkill, "path">>> = {};
  for (const [skillId, skill] of typedEntries(matrix.skills)) {
    if (!skill) continue;
    if (!skill.local) {
      sourceSkills[skillId] = { path: skill.path };
    }
  }
  return sourceSkills;
}

/**
 * Compares local skills (project + global scope) against their source versions.
 *
 * Builds a source skills map from the matrix (excluding local-only skills),
 * runs compareLocalSkillsWithSource for both project and global scopes,
 * and merges results with project taking precedence.
 */
export async function compareSkillsWithSource(
  projectDir: string,
  sourcePath: string,
  matrix: MergedSkillsMatrix,
): Promise<SkillComparisonResults> {
  const sourceSkills = buildSourceSkillsMap(matrix);

  const { hasProject, hasGlobal } = await collectScopedSkillDirs(projectDir);
  const homeDir = os.homedir();

  const projectResults = hasProject
    ? await compareLocalSkillsWithSource(projectDir, sourcePath, sourceSkills)
    : [];

  const globalResults = hasGlobal
    ? await compareLocalSkillsWithSource(homeDir, sourcePath, sourceSkills)
    : [];

  const seenIds = new Set(projectResults.map((r) => r.id));
  const merged = [...projectResults, ...globalResults.filter((r) => !seenIds.has(r.id))];

  return { projectResults, globalResults, merged };
}
