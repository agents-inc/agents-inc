import { seatCatalog } from "@workspace/compile";

import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import type {
  Category,
  Domain,
  MergedSkillsMatrix,
  ResolvedSkill,
  ResolvedStack,
  SkillId,
} from "../../types";
import { typedValues } from "../../utils/typed-object";

/** The current matrix — starts as BUILT_IN_MATRIX, replaced after local skill merge on startup */
export let matrix: MergedSkillsMatrix = BUILT_IN_MATRIX;

/**
 * Merge local/custom skills on top of BUILT_IN_MATRIX. Called once on CLI startup.
 *
 * Also seats `@workspace/compile`'s catalogue, which is what `generateProjectConfigFromSkills`
 * reads — one writer for both, so the CLI and the shared builder can never hold different
 * catalogues. Everything else in that package takes its catalogue as an argument; the reason
 * this one does not is in `packages/compile/src/catalog-seat.ts`.
 */
export function initializeMatrix(merged: MergedSkillsMatrix): void {
  matrix = merged;
  seatCatalog(merged);
}

/** Asserting skill lookup by ID — throws if not found. */
export function getSkillById(id: SkillId): ResolvedSkill {
  const skill = matrix.skills[id];
  if (!skill) throw new Error(`Skill not found: ${id}`);
  return skill;
}

/**
 * Display label for a skill ID, falling back to the raw ID. Optional chaining is
 * sanctioned here (unlike getSkillById) because callers render IDs that may be
 * absent from the current matrix — e.g. a removed skill, or a foreign/local id
 * not present in this source — and want a graceful label rather than a throw.
 */
export function getSkillDisplayName(id: SkillId): string {
  return matrix.skills[id]?.displayName ?? id;
}

/** All resolved skills in the current matrix (skips sparse-record holes). */
export function allSkills(): ResolvedSkill[] {
  return typedValues(matrix.skills);
}

/** Look up a category's domain from the matrix (handles auto-synthesized categories for custom skills). */
export function getCategoryDomain(category: string): Domain | undefined {
  // Boundary cast: matrix categories include auto-synthesized entries for custom skills
  return matrix.categories[category as Category]?.domain;
}

/** Check if a skill ID exists in the current matrix (built-in + custom). */
export function hasSkill(id: string): boolean {
  return id in matrix.skills;
}

/** Optional stack lookup by ID. */
export function findStack(stackId: string): ResolvedStack | undefined {
  return matrix.suggestedStacks.find((s) => s.id === stackId);
}
