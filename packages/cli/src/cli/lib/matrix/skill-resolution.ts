import { verbose, warn } from "../../utils/logger";
import { unique, uniqueBy } from "remeda";
import { toTitleCase } from "../../utils/string";
import { DEFAULT_VERSION, LOCAL_PSEUDO_CATEGORY } from "../../consts";
import { defaultRules } from "../configuration/default-rules";
import type {
  CategoryDefinition,
  CategoryMap,
  Domain,
  ExtractedSkillMetadata,
  MergedSkillsMatrix,
  RelationshipDefinitions,
  RequireRule,
  ResolvedSkill,
  SkillAlternative,
  SkillId,
  SkillRelation,
  SkillRequirement,
  SkillRulesConfig,
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
  const displayName = toTitleCase(category);

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
 * Registers a skill's claim on a slug, first claim winning and every later one
 * named. Exported because the merge is not the only writer: `source-loader`
 * merges a project's local skills into an already-built map, and two writers
 * deciding a collision differently is how a slug comes to mean one skill here
 * and another there.
 *
 * A skill re-stating a claim it already holds is not a collision — a local skill
 * overriding a matrix id inherits that id's slug and arrives back here with it.
 */
export function claimSlug(slugMap: SkillSlugMap, slug: SkillSlug, id: SkillId): void {
  const incumbent = slugMap.slugToId[slug];
  if (incumbent === id) return;
  if (incumbent !== undefined) {
    warn(`Duplicate slug '${slug}': already mapped to '${incumbent}', ignoring '${id}'`);
    return;
  }

  slugMap.slugToId[slug] = id;
  slugMap.idToSlug[id] = slug;
}

/** Builds a bidirectional slug <-> ID map from extracted skill metadata. */
function buildSlugMap(skills: ExtractedSkillMetadata[]): SkillSlugMap {
  const slugMap: SkillSlugMap = { slugToId: {}, idToSlug: {} };

  for (const skill of skills) {
    claimSlug(slugMap, skill.slug, skill.id);
  }

  return slugMap;
}

/**
 * Resolves every skill into the map the matrix is read through, keyed by id.
 * Warns on duplicate ids (first one wins) — the identity axis {@link buildSlugMap}
 * guards for slugs. Two directories whose SKILL.md declares the same name would
 * otherwise resolve in glob order, and the loser would leave no trace.
 */
function buildResolvedSkillMap(
  skills: ExtractedSkillMetadata[],
  categories: CategoryMap,
  relationships: RelationshipDefinitions,
  slugMap: SkillSlugMap,
): Partial<Record<SkillId, ResolvedSkill>> {
  const resolvedSkills: Partial<Record<SkillId, ResolvedSkill>> = {};

  for (const skill of skills) {
    const existing = resolvedSkills[skill.id];
    if (existing) {
      warn(
        `Duplicate skill id '${skill.id}': already resolved from '${existing.path}', ignoring '${skill.path}'`,
      );
      continue;
    }

    resolvedSkills[skill.id] = buildResolvedSkill(skill, categories, relationships, slugMap);
  }

  return resolvedSkills;
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

/** Every slug the rules name, in the order the four rule kinds declare them. */
function slugsNamedByRules(relationships: RelationshipDefinitions): SkillSlug[] {
  return [
    ...relationships.conflicts.flatMap((rule) => rule.skills),
    ...relationships.discourages.flatMap((rule) => rule.skills),
    ...relationships.requires.flatMap((rule) => [rule.skill, ...rule.needs]),
    ...relationships.alternatives.flatMap((rule) => rule.skills),
  ];
}

/**
 * The slugs the rules name that no skill carries, deduplicated.
 *
 * Asked of the rules rather than counted off the resolution pass, because that
 * pass walks every rule once per skill: one typo would otherwise be reported as
 * many findings as the source has skills, which is the noise this removed.
 */
function collectUnresolvedSlugs(
  relationships: RelationshipDefinitions,
  slugToId: SkillSlugMap["slugToId"],
): SkillSlug[] {
  return unique(slugsNamedByRules(relationships).filter((slug) => slugToId[slug] === undefined));
}

/** Merges relationship rule sets: source rules first, so they win first-match lookups. */
function mergeRelationships(
  source: RelationshipDefinitions,
  defaults: RelationshipDefinitions,
): RelationshipDefinitions {
  return {
    conflicts: [...source.conflicts, ...defaults.conflicts],
    discourages: [...source.discourages, ...defaults.discourages],
    requires: [...source.requires, ...defaults.requires],
    alternatives: [...source.alternatives, ...defaults.alternatives],
  };
}

/** Below two present members a group rule relates nothing, so it is dropped whole. */
const MIN_RELATABLE_GROUP_MEMBERS = 2;

/** Group rules — conflicts, discourages, alternatives — keeping only present slugs. */
function narrowGroupsToSlugs<Rule extends { skills: SkillSlug[] }>(
  rules: Rule[],
  shipped: ReadonlySet<SkillSlug>,
): Rule[] {
  return rules
    .map((rule) => ({ ...rule, skills: rule.skills.filter((slug) => shipped.has(slug)) }))
    .filter((rule) => rule.skills.length >= MIN_RELATABLE_GROUP_MEMBERS);
}

/**
 * Requirements, keeping only those a present skill declares over present skills.
 * A rule left needing nothing states no requirement — resolution already treats it
 * that way — so it goes rather than resolving to an empty `needs`.
 */
function narrowRequirementsToSlugs(
  rules: RequireRule[],
  shipped: ReadonlySet<SkillSlug>,
): RequireRule[] {
  return rules
    .filter((rule) => shipped.has(rule.skill))
    .map((rule) => ({ ...rule, needs: rule.needs.filter((slug) => shipped.has(slug)) }))
    .filter((rule) => rule.needs.length > 0);
}

function narrowToShippedSlugs(
  rules: RelationshipDefinitions,
  shipped: ReadonlySet<SkillSlug>,
): RelationshipDefinitions {
  return {
    conflicts: narrowGroupsToSlugs(rules.conflicts, shipped),
    discourages: narrowGroupsToSlugs(rules.discourages, shipped),
    requires: narrowRequirementsToSlugs(rules.requires, shipped),
    alternatives: narrowGroupsToSlugs(rules.alternatives, shipped),
  };
}

/**
 * The relationships a source's skills can actually express: the source's own rules
 * verbatim, plus the built-ins narrowed to the slugs this source ships.
 *
 * The built-in rules are written against the whole public catalogue — 176 slugs — so
 * a source shipping ten of them left the rest dangling. Resolution dropped those
 * references either way; what it ALSO did was warn once per reference per skill, and
 * since the startup band those warnings are painted over the wizard's step. Narrowing
 * first removes the noise and nothing else: a member that resolves to no skill
 * contributed nothing to the resolved matrix to begin with.
 *
 * A source's OWN rules are never narrowed. A slug its author typed and its skills do
 * not carry is that source's defect, and the warning is the only place it is reported.
 */
export function relationshipsForSource(
  skills: ExtractedSkillMetadata[],
  sourceRules?: SkillRulesConfig,
): RelationshipDefinitions {
  const shipped = new Set(skills.map((skill) => skill.slug));
  const builtIn = narrowToShippedSlugs(defaultRules.relationships, shipped);
  return sourceRules ? mergeRelationships(sourceRules.relationships, builtIn) : builtIn;
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
  const resolvedSkills = buildResolvedSkillMap(skills, categories, relationships, slugMap);

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

  const unresolvedSlugs = collectUnresolvedSlugs(relationships, slugMap.slugToId);

  const merged: MergedSkillsMatrix = {
    version: DEFAULT_VERSION,
    categories: synthesizedCategories,
    skills: resolvedSkills,
    suggestedStacks: [],
    slugMap,
    ...(unresolvedSlugs.length > 0 && { unresolvedSlugs }),
    generatedAt: new Date().toISOString(),
  };

  return merged;
}

/** All resolved relationship data for a single skill */
type ResolvedRelationships = {
  conflictsWith: SkillRelation[];
  discourages: SkillRelation[];
  requires: SkillRequirement[];
  alternatives: SkillAlternative[];
};

/** Resolves a rule's slugs to canonical ids, warning and skipping any that don't resolve. */
function resolveSlugsOrSkip(slugs: SkillSlug[], resolve: ResolveId, context: string): SkillId[] {
  return slugs.map((slug) => resolve(slug, context)).filter((id): id is SkillId => id !== null);
}

/**
 * A requirement's needs, or null when any one of them names no skill.
 *
 * Keeping what resolved would apply a requirement nobody wrote: under AND an
 * unresolved need narrows the rule to the survivors, under OR it takes an
 * alternative away — and either is presented to the user under the author's own
 * `reason`. A source's rules are its own (the CLI's built-ins are narrowed to
 * what a source ships, and the source's are left untouched), so they are taken
 * whole or not at all. The slug is warned here and reported by
 * `checkMatrixHealth`, which is where the author reads it.
 */
function resolveEveryNeed(needs: SkillSlug[], resolve: ResolveId): SkillId[] | null {
  // A rule needing nothing states no requirement, as it did before any of its
  // members could fail to resolve.
  if (needs.length === 0) return null;

  const resolved = resolveSlugsOrSkip(needs, resolve, "requires.needs");
  return resolved.length === needs.length ? resolved : null;
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
    relationships.discourages,
    skillId,
    resolve,
    "discourages",
  ).map(({ memberId, rule }) => ({ skillId: memberId, reason: rule.reason }));

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
    const resolvedNeeds = resolveEveryNeed(rule.needs, resolve);
    if (!resolvedNeeds) continue;
    requires.push({
      skillIds: resolvedNeeds,
      needsAny: rule.needsAny ?? false,
      reason: rule.reason,
    });
  }

  return {
    conflictsWith,
    discourages,
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

  const resolved = resolveRelationships(skill.id, relationships, resolve);

  return {
    id: skill.id,
    slug,
    displayName: skill.displayName,
    description: skill.description,
    ...(skill.usageGuidance !== undefined && { usageGuidance: skill.usageGuidance }),
    category: skill.category,
    author: skill.author,
    ...resolved,
    path: skill.path,
    ...(skill.custom === true ? { custom: true } : {}),
  };
}
