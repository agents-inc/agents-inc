import { verbose, warn } from "../../utils/logger";
import { uniqueBy } from "remeda";
import { LOCAL_PSEUDO_CATEGORY } from "../../consts";
import type {
  CategoryDefinition,
  CategoryMap,
  Domain,
  ExtractedSkillMetadata,
  MergedSkillsMatrix,
  RelationshipDefinitions,
  ResolvedSkill,
  SkillAlternative,
  SkillId,
  SkillRelation,
  SkillRequirement,
  SkillSlug,
  SkillSlugMap,
  Category,
} from "../../types";

/** Resolves a slug to a canonical SkillId, or null if unresolvable */
type ResolveId = (slug: SkillSlug, context?: string) => SkillId | null;

const AUTO_SYNTH_ORDER = 999;

/**
 * Synthesizes a basic CategoryDefinition for a category not defined in any
 * skill-categories.ts. This is a safety net — the preferred path is for
 * skill authors to maintain proper skill-categories.ts entries.
 */
export function synthesizeCategory(category: Category, domain: Domain): CategoryDefinition {
  verbose(
    `Category '${category}' has no definition in skill-categories.ts — using auto-generated placeholder`,
  );
  const displayName = category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return {
    id: category,
    displayName,
    description: `Auto-generated category for ${category}`,
    domain,
    exclusive: false,
    required: false,
    order: AUTO_SYNTH_ORDER,
  };
}

/**
 * Builds a bidirectional slug <-> ID map from extracted skill metadata.
 * Warns on duplicate slugs (first one wins).
 */
function buildSlugMap(skills: ExtractedSkillMetadata[]): SkillSlugMap {
  const slugToId: Partial<Record<SkillSlug, SkillId>> = {};
  const idToSlug: Partial<Record<SkillId, SkillSlug>> = {};

  for (const skill of skills) {
    const existingId = slugToId[skill.slug];
    if (existingId) {
      warn(
        `Duplicate slug '${skill.slug}': already mapped to '${existingId}', ignoring '${skill.id}'`,
      );
      continue;
    }

    slugToId[skill.slug] = skill.id;
    idToSlug[skill.id] = skill.slug;
  }

  return { slugToId, idToSlug };
}

function resolveToCanonicalId(
  slug: SkillSlug,
  slugToId: SkillSlugMap["slugToId"],
  context?: string,
): SkillId | null {
  const slugResult = slugToId[slug];
  if (slugResult) {
    return slugResult;
  }
  const location = context ? ` in ${context}` : "";
  warn(`Unresolved slug '${slug}'${location} — skipping`);
  return null;
}

/**
 * Merges category definitions, relationship rules, and extracted skill metadata
 * into a fully resolved MergedSkillsMatrix.
 *
 * This is the core resolution step that combines:
 * - Category definitions from skill-categories.ts
 * - Slug-based alias maps derived from metadata
 * - Relationship rules from skill-rules.ts
 * - Extracted skill metadata (from scanning skill directories)
 *
 * Each skill's raw relationship references are resolved to canonical SkillIds.
 * The result is the complete data structure consumed by the wizard UI and validation logic.
 */
export function mergeMatrixWithSkills(
  categories: CategoryMap,
  relationships: RelationshipDefinitions,
  skills: ExtractedSkillMetadata[],
): MergedSkillsMatrix {
  const slugMap = buildSlugMap(skills);
  const resolvedSkills: Partial<Record<SkillId, ResolvedSkill>> = {};

  for (const skill of skills) {
    const resolved = buildResolvedSkill(skill, categories, relationships, slugMap);
    resolvedSkills[skill.id] = resolved;
  }

  // Auto-synthesize missing categories for skills that reference undefined categories
  const synthesizedCategories = { ...categories };
  for (const skill of skills) {
    // Skip "local" pseudo-category — it's not a real Category union member
    if (skill.category === LOCAL_PSEUDO_CATEGORY) continue;
    if (!synthesizedCategories[skill.category]) {
      const synthesized = synthesizeCategory(skill.category, skill.domain);
      synthesizedCategories[skill.category] = synthesized;
      verbose(`Auto-synthesized category '${skill.category}' for skill '${skill.id}'`);
    }
  }

  const merged: MergedSkillsMatrix = {
    version: "1.0.0",
    categories: synthesizedCategories,
    skills: resolvedSkills,
    suggestedStacks: [],
    slugMap,
    generatedAt: new Date().toISOString(),
  };

  return merged;
}

/** All resolved relationship data for a single skill */
type ResolvedRelationships = {
  conflictsWith: SkillRelation[];
  discourages: SkillRelation[];
  compatibleWith: SkillId[];
  requires: SkillRequirement[];
  alternatives: SkillAlternative[];
};

/** Resolves a rule's slugs to canonical ids, warning and skipping any that don't resolve. */
function resolveSlugsOrSkip(slugs: SkillSlug[], resolve: ResolveId, context: string): SkillId[] {
  return slugs.map((slug) => resolve(slug, context)).filter((id): id is SkillId => id !== null);
}

/**
 * Members of the symmetric groups containing `skillId` (excluding itself),
 * deduplicated on first occurrence, each paired with its group's rule so the
 * caller can lift the annotation (reason/purpose).
 */
function collectSymmetricGroupMembers<Rule extends { skills: SkillSlug[] }>(
  rules: readonly Rule[],
  skillId: SkillId,
  resolve: ResolveId,
  context: string,
): Array<{ memberId: SkillId; rule: Rule }> {
  const members = rules.flatMap((rule) => {
    const resolved = resolveSlugsOrSkip(rule.skills, resolve, context);
    if (!resolved.includes(skillId)) return [];
    return resolved.filter((id) => id !== skillId).map((memberId) => ({ memberId, rule }));
  });
  return uniqueBy(members, (m) => m.memberId);
}

/**
 * Resolves all relationship data for a single skill in one pass across all
 * relationship rule types (conflicts, discourages, compatibility, requirements, alternatives).
 */
function resolveRelationships(
  skillId: SkillId,
  relationships: RelationshipDefinitions,
  resolve: ResolveId,
): ResolvedRelationships {
  // Symmetric groups: members of every group containing this skill, first-occurrence deduped
  const conflictsWith: SkillRelation[] = collectSymmetricGroupMembers(
    relationships.conflicts,
    skillId,
    resolve,
    "conflicts",
  ).map(({ memberId, rule }) => ({ skillId: memberId, reason: rule.reason }));

  const discourages: SkillRelation[] = collectSymmetricGroupMembers(
    relationships.discourages ?? [],
    skillId,
    resolve,
    "discourages",
  ).map(({ memberId, rule }) => ({ skillId: memberId, reason: rule.reason }));

  const compatibleWith: SkillId[] = collectSymmetricGroupMembers(
    relationships.compatibleWith ?? [],
    skillId,
    resolve,
    "compatibleWith",
  ).map(({ memberId }) => memberId);

  const alternatives: SkillAlternative[] = collectSymmetricGroupMembers(
    relationships.alternatives,
    skillId,
    resolve,
    "alternatives",
  ).map(({ memberId, rule }) => ({ skillId: memberId, purpose: rule.purpose }));

  // Requirements — directional, skill field identifies the dependent
  const requires: SkillRequirement[] = [];
  for (const rule of relationships.requires) {
    const ruleSkillId = resolve(rule.skill, "requires.skill");
    if (ruleSkillId !== skillId) continue;
    const resolvedNeeds = resolveSlugsOrSkip(rule.needs, resolve, "requires.needs");
    if (resolvedNeeds.length === 0) continue;
    requires.push({
      skillIds: resolvedNeeds,
      needsAny: rule.needsAny ?? false,
      reason: rule.reason,
    });
  }

  return {
    conflictsWith,
    discourages,
    compatibleWith,
    requires,
    alternatives,
  };
}

function buildResolvedSkill(
  skill: ExtractedSkillMetadata,
  _categories: CategoryMap,
  relationships: RelationshipDefinitions,
  slugMap: SkillSlugMap,
): ResolvedSkill {
  const resolve: ResolveId = (slug, context) =>
    resolveToCanonicalId(slug, slugMap.slugToId, context ? `${skill.id} ${context}` : undefined);

  const slug = skill.slug;

  // Look up isRecommended/recommendedReason from flat recommends list (now slug-based)
  const recommendation = relationships.recommends.find((r) => r.skill === skill.slug);

  const resolved = resolveRelationships(skill.id, relationships, resolve);

  return {
    id: skill.id,
    slug,
    displayName: skill.displayName,
    description: skill.description,
    usageGuidance: skill.usageGuidance,
    category: skill.category,
    author: skill.author,
    ...resolved,
    isRecommended: recommendation != null,
    recommendedReason: recommendation?.reason,
    path: skill.path,
    ...(skill.custom === true ? { custom: true } : {}),
  };
}
