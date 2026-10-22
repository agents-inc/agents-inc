import { seatCatalog } from "@workspace/compile";

import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { stripTerminalControls } from "../../utils/string";
import type { Category, Domain, MergedSkillsMatrix, ResolvedSkill, SkillId } from "../../types";

/** The current matrix — starts as BUILT_IN_MATRIX, replaced after local skill merge on startup */
export let matrix: MergedSkillsMatrix = BUILT_IN_MATRIX;

/**
 * Also seats `@workspace/compile`'s catalogue, so the CLI and the shared builder never disagree.
 */
export function initializeMatrix(merged: MergedSkillsMatrix): void {
  matrix = merged;
  seatCatalog(merged);
}

export function getSkillById(id: SkillId): ResolvedSkill {
  const skill = matrix.skills[id];
  if (!skill) throw new Error(`Skill not found: ${id}`);
  return skill;
}

/**
 * Falls back to the raw id: callers render ids that may be absent from the current matrix. Inert,
 * since every caller prints it and a marketplace or a shared link wrote it.
 */
export function getSkillDisplayName(id: SkillId): string {
  return stripTerminalControls(matrix.skills[id]?.displayName ?? id);
}

export function getCategoryDomain(category: string): Domain | undefined {
  // Boundary cast: matrix categories include auto-synthesized entries for custom skills
  return matrix.categories[category as Category]?.domain;
}
