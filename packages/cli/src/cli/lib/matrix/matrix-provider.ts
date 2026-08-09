import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import type {
  Category,
  Domain,
  MergedSkillsMatrix,
  ResolvedSkill,
  ResolvedStack,
  SkillId,
  SkillSlug,
} from "../../types";
import { typedEntries, typedValues } from "../../utils/typed-object";

/** The current matrix — starts as BUILT_IN_MATRIX, replaced after local skill merge on startup */
export let matrix: MergedSkillsMatrix = BUILT_IN_MATRIX;

/** Merge local/custom skills on top of BUILT_IN_MATRIX. Called once on CLI startup. */
export function initializeMatrix(merged: MergedSkillsMatrix): void {
  matrix = merged;
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

/** Asserting skill lookup by slug — resolves slug to ID, throws if not found. */
export function getSkillBySlug(slug: SkillSlug): ResolvedSkill {
  const id = matrix.slugMap.slugToId[slug];
  if (!id) throw new Error(`Skill not found for slug: ${slug}`);
  return getSkillById(id);
}

/** All resolved skills in the current matrix (skips sparse-record holes). */
export function allSkills(): ResolvedSkill[] {
  return typedValues(matrix.skills);
}

/** Returns IDs of all custom skills in the current matrix. */
export function getCustomSkillIds(): Set<SkillId> {
  return new Set(
    typedEntries(matrix.skills)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      .filter(([_, skill]) => skill?.custom)
      .map(([id]) => id),
  );
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
