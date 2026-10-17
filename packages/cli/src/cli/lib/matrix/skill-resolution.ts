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

type ResolveId = (slug: SkillSlug, context?: string) => SkillId | null;

const AUTO_SYNTH_ORDER = 999;

/** Warns when skills file an undeclared category under different domains; the first wins. */
function warnOnDomainDisagreement(
  skill: ExtractedSkillMetadata,
  decidedBy: ExtractedSkillMetadata,
): void {
  if (skill.domain === decidedBy.domain) return;

  warn(
    `Category '${skill.category}' has no definition, so its domain was taken from the first skill ` +
      `naming it — '${decidedBy.id}' (${decidedBy.domain}). '${skill.id}' declares ` +
      `'${skill.domain}' and will be filed under '${decidedBy.domain}'. Declare the category in ` +
      `the marketplace's own config, or make the two skills agree.`,
  );
}

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
    order: AUTO_SYNTH_ORDER,
  };
}

/** A held slug keeps its holder silently: another marketplace's skill may share it. */
export function claimSlug(slugMap: SkillSlugMap, slug: SkillSlug, id: SkillId): void {
  slugMap.slugToId[slug] ??= id;
}

/** First claim wins, later ones named: in one marketplace a shared slug is the author's bug. */
function buildSlugMap(skills: ExtractedSkillMetadata[]): SkillSlugMap {
  const slugMap: SkillSlugMap = { slugToId: {} };

  for (const { slug, id } of skills) {
    const incumbent = slugMap.slugToId[slug];
    if (incumbent !== undefined && incumbent !== id) {
      warn(`Duplicate slug '${slug}': already mapped to '${incumbent}', ignoring '${id}'`);
    }
    claimSlug(slugMap, slug, id);
  }

  return slugMap;
}

/** Warns on duplicate ids (first wins), which would otherwise resolve in glob order. */
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

/** Asked of the rules, not per skill, so a typo is reported once. */
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
 * Keeps requirements a present skill declares over present skills; one left needing nothing goes.
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

/** The source's own rules verbatim, plus the built-ins narrowed to the slugs this source ships. */
export function relationshipsForSource(
  skills: ExtractedSkillMetadata[],
  sourceRules?: SkillRulesConfig,
): RelationshipDefinitions {
  const shipped = new Set(skills.map((skill) => skill.slug));
  const builtIn = narrowToShippedSlugs(defaultRules.relationships, shipped);
  return sourceRules ? mergeRelationships(sourceRules.relationships, builtIn) : builtIn;
}

export function mergeMatrixWithSkills(
  categories: CategoryMap,
  relationships: RelationshipDefinitions,
  skills: ExtractedSkillMetadata[],
): MergedSkillsMatrix {
  const slugMap = buildSlugMap(skills);
  const resolvedSkills = buildResolvedSkillMap(skills, categories, relationships, slugMap);

  const synthesizedCategories = { ...categories };
  const synthesizedFrom = new Map<string, ExtractedSkillMetadata>();
  for (const skill of skills) {
    // Skip "local" pseudo-category — it's not a real Category union member
    if (skill.category === LOCAL_PSEUDO_CATEGORY) continue;

    // A declared category is neither synthesized nor judged here; `checkCategoryDomains` owns it.
    if (categories[skill.category]) continue;

    const already = synthesizedFrom.get(skill.category);
    if (already === undefined) {
      synthesizedCategories[skill.category] = synthesizeCategory(skill.category, skill.domain);
      synthesizedFrom.set(skill.category, skill);
      verbose(`Auto-synthesized category '${skill.category}' for skill '${skill.id}'`);
      continue;
    }

    warnOnDomainDisagreement(skill, already);
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

/** Null when any need names no skill: keeping the rest would apply a rule nobody wrote. */
function resolveEveryNeed(needs: SkillSlug[], resolve: ResolveId): SkillId[] | null {
  // A rule needing nothing states no requirement.
  if (needs.length === 0) return null;

  const resolved = resolveSlugsOrSkip(needs, resolve, "requires.needs");
  return resolved.length === needs.length ? resolved : null;
}

/** Members of the groups containing `skillId`, deduped, each paired with its group's rule. */
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

function resolveRelationships(
  skillId: SkillId,
  relationships: RelationshipDefinitions,
  resolve: ResolveId,
): ResolvedRelationships {
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
    ...(skill.activationDescription !== undefined && {
      activationDescription: skill.activationDescription,
    }),
    ...(skill.usageGuidance !== undefined && { usageGuidance: skill.usageGuidance }),
    category: skill.category,
    author: skill.author,
    ...resolved,
    path: skill.path,
    ...(skill.custom === true ? { custom: true } : {}),
  };
}
