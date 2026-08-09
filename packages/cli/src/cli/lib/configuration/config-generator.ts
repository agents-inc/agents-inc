import type {
  AgentName,
  CategoryPath,
  ProjectConfig,
  SkillAssignment,
  SkillId,
  Stack,
  StackAgentConfig,
  Category,
} from "../../types";
import { groupBy, indexBy, partition } from "remeda";
import { resolveAssignment, resolveLoadState, type LoadState } from "@workspace/matrix";

import type { AgentScopeConfig, SkillConfig, SkillScope } from "../../types/config";
import { matrix } from "../matrix/matrix-provider";
import { EJECT_SOURCE, GLOBAL_CONFIG_NAME, LOCAL_PSEUDO_CATEGORY } from "../../consts";
import { isActiveAt, activeAgentScopeMap, effectivelyExcludedSkillIds } from "./scope-predicates";
import { verbose, warn } from "../../utils/logger";
import { isAgentName, isSkillId } from "../../utils/type-guards";
import { typedEntries, typedFromEntries, typedKeys } from "../../utils/typed-object";

export type SplitConfigResult = {
  global: ProjectConfig;
  project: ProjectConfig;
};

export type ProjectConfigOptions = {
  description?: string;
  author?: string;
};

function extractCategoryFromPath(categoryPath: CategoryPath): Category | undefined {
  if (categoryPath === LOCAL_PSEUDO_CATEGORY) return undefined;
  // TypeScript narrows CategoryPath to Category after excluding "local"
  return categoryPath;
}

type StackBuildInputs = {
  agentList: AgentName[];
  activeSkillsByCategory: Map<Category, SkillId[]>;
  skillScope: Map<SkillId, SkillScope>;
  agentScope: Map<AgentName, SkillScope>;
  existingStack: Partial<Record<AgentName, StackAgentConfig>>;
  /**
   * Skills that are new to this session's top-level selection (not in the prior
   * `existing.config.skills`). When `undefined`, the D-220 per-agent curation
   * preservation rule is disabled and every scope-compatible, resolver-relevant
   * skill lands on every existing agent (legacy behavior). When defined
   * (possibly empty), the preservation rule applies: skills NOT in an agent's
   * prior stack entry and NOT in this set are omitted from that agent's stack —
   * respecting the user's curation.
   */
  newlyAddedSkillIds?: ReadonlySet<SkillId>;
  /**
   * Keys of `(agent, skillId)` pairs whose scope-compatibility was GAINED this
   * session — either the skill's scope was flipped so it now reaches this
   * agent, or the agent's scope was flipped so previously-filtered skills now
   * reach it. Parallel to `newlyAddedSkillIds`: when the caller opts into
   * D-220 preservation semantics, this set admits triples that the skill-id
   * diff would miss. Keys are produced by `scopeEligibilityKey()`.
   */
  scopeEligibilityGained?: ReadonlySet<string>;
};

/**
 * Encodes an `(agent, skillId)` pair as a single string for set-membership
 * lookups. Both arguments are typed string unions so a `|` delimiter produces
 * a unique, stable key.
 */
export function scopeEligibilityKey(agent: AgentName, skillId: SkillId): string {
  return `${agent}|${skillId}`;
}

/**
 * What the prior save said about this triple, or `undefined` when it carried
 * no entry for it at all. An entry with no flag is not silence: the generator
 * only ever writes `preloaded` where it is true, so a bare `{ id }` read back
 * off disk is the user's curated lazy and outranks any default.
 */
function priorLoadState(
  existingStack: Partial<Record<AgentName, StackAgentConfig>>,
  agent: AgentName,
  category: Category,
  skillId: SkillId,
): LoadState | undefined {
  const prior = existingStack[agent]?.[category]?.find((a) => a.id === skillId);
  if (prior === undefined) return undefined;

  return prior.preloaded === true ? "preloaded" : "lazy";
}

/**
 * The shared mapping's word for a triple nobody has decided on yet — the same
 * table the editor's default assignments read, so a skill picked in either
 * place arrives loaded the same way.
 *
 * Only catalog skills on roster agents are put to it. The mapping is keyed by
 * generated skill id and agent role, so a local skill, a marketplace one or a
 * hand-written agent has no entry it could ever match — those are lazy by
 * rule, not by rescue. `resolveLoadState` throws on ids it does not know, and
 * catching that throw is what would make this a silent fallback.
 */
function mappedLoadState(skillId: SkillId, agent: AgentName): LoadState {
  if (!isSkillId(skillId) || !isAgentName(agent)) return "lazy";

  return resolveLoadState({ skillId, agentId: agent });
}

/**
 * The shared resolver's word on whether this sub-agent would reasonably use
 * this skill — the same targeting the editor's default assignments read, so a
 * pick lands on the same agents from either surface.
 *
 * An id outside the catalog — local, marketplace, or added this session —
 * targets nobody: relevance unknown, assignment the user's to make.
 */
function isRelevantPair(skillId: SkillId, agent: AgentName): boolean {
  return resolveAssignment(skillId).some((target) => target.agentId === agent);
}

/**
 * The relevance rule as it applies inside a stack build: a triple the prior
 * save carries is the user's curation — D-220 — and rides through wherever it
 * sits, cross-domain included; a triple arriving this session lands only where
 * the shared resolver targets it.
 */
function isPreservedOrRelevant(
  agent: AgentName,
  category: Category,
  skillId: SkillId,
  inputs: StackBuildInputs,
): boolean {
  const hasPriorEntry =
    priorLoadState(inputs.existingStack, agent, category, skillId) !== undefined;
  return hasPriorEntry || isRelevantPair(skillId, agent);
}

function getScopeOrThrow<K>(map: Map<K, SkillScope>, key: K, kind: "skill" | "agent"): SkillScope {
  const scope = map.get(key);
  if (scope === undefined) {
    throw new Error(
      `generateProjectConfigFromSkills: ${kind} '${String(key)}' missing from ` +
        `${kind === "skill" ? "skillConfigs" : "agentConfigs"}. ` +
        `Caller must pass a ${kind === "skill" ? "SkillConfig" : "AgentScopeConfig"} ` +
        `for every selected ${kind}.`,
    );
  }
  return scope;
}

/** Project skills never reach global agents; global skills reach any agent. */
export function isScopePairCompatible(skillScope: SkillScope, agentScope: SkillScope): boolean {
  return !(skillScope === "project" && agentScope === "global");
}

function isScopeCompatible(
  skillId: SkillId,
  agent: AgentName,
  skillScope: Map<SkillId, SkillScope>,
  agentScope: Map<AgentName, SkillScope>,
): boolean {
  const sScope = getScopeOrThrow(skillScope, skillId, "skill");
  const aScope = getScopeOrThrow(agentScope, agent, "agent");
  return isScopePairCompatible(sScope, aScope);
}

/**
 * Decides whether a given `(agent, category, skillId)` triple lands in the
 * agent's stack for this save. The scope filter has already run in the caller
 * — this function only enforces D-220's per-agent curation rule.
 *
 * Branches:
 *   - `agent ∉ existingStack`  → seed branch (new agent); every scope-compatible
 *     skill the shared resolver targets at this agent lands, and with no prior
 *     entry to inherit a `preloaded` flag from, each one takes the shared
 *     mapping's default (see `toStackAssignment`).
 *   - `agent ∈ existingStack`  → preservation branch:
 *       * skillId was in `existingStack[agent][category]` → KEEP (idempotent).
 *       * skillId ∈ `newlyAddedSkillIds` OR `(agent, skillId)` ∈
 *         `scopeEligibilityGained` → APPEND (user's session-level addition or
 *         scope-compat flip).
 *       * otherwise → OMIT (respect user's prior per-agent curation removal).
 *
 * Legacy path: when `newlyAddedSkillIds` is not provided, the D-220 check is
 * disabled — every scope-compatible skill passes this gate (the relevance
 * filter in `buildAgentStack` still applies). This preserves the contract of
 * callers that pre-date D-220.
 */
function shouldIncludeTriple(
  agent: AgentName,
  category: Category,
  skillId: SkillId,
  inputs: StackBuildInputs,
): boolean {
  // Legacy path: callers that don't opt in keep the pre-D-220 behavior.
  if (inputs.newlyAddedSkillIds === undefined) return true;

  const agentExistingStack = inputs.existingStack[agent];
  if (agentExistingStack === undefined) {
    // Seeding branch: agent is new this session → full ownership-derived stack.
    return true;
  }

  const priorCategory = agentExistingStack[category];
  if (priorCategory && priorCategory.some((a) => a.id === skillId)) return true;

  if (inputs.newlyAddedSkillIds.has(skillId)) return true;
  const scopeEligibility = inputs.scopeEligibilityGained;
  if (scopeEligibility && scopeEligibility.has(scopeEligibilityKey(agent, skillId))) {
    return true;
  }
  return false;
}

/** The prior stack's word for this triple, or the mapping's when it is new. */
function toStackAssignment(
  id: SkillId,
  agent: AgentName,
  category: Category,
  inputs: StackBuildInputs,
): SkillAssignment {
  const prior = priorLoadState(inputs.existingStack, agent, category, id);
  const load = prior ?? mappedLoadState(id, agent);

  return load === "preloaded" ? { id, preloaded: true } : { id };
}

function buildAgentStack(agent: AgentName, inputs: StackBuildInputs): StackAgentConfig | undefined {
  const agentStack: StackAgentConfig = {};
  for (const [category, skillIds] of inputs.activeSkillsByCategory) {
    const assignments = skillIds
      .filter((id) => isScopeCompatible(id, agent, inputs.skillScope, inputs.agentScope))
      .filter((id) => shouldIncludeTriple(agent, category, id, inputs))
      .filter((id) => isPreservedOrRelevant(agent, category, id, inputs))
      .map((id) => toStackAssignment(id, agent, category, inputs));
    if (assignments.length > 0) {
      agentStack[category] = assignments;
    }
  }
  return typedKeys<Category>(agentStack).length > 0 ? agentStack : undefined;
}

function buildStackForSelection(
  inputs: StackBuildInputs,
): Partial<Record<AgentName, StackAgentConfig>> | undefined {
  // No agents in play → this caller is not managing the stack. Return
  // `undefined` (key omitted) so the merger preserves any existing stack.
  if (inputs.agentList.length === 0) {
    verbose(`buildStackForSelection: no agents — returning undefined (stack untouched)`);
    return undefined;
  }

  // Agents are in play → the generator authoritatively rebuilt the stack from
  // the current selection. An empty result is a real "nothing preloads" outcome
  // (e.g. the last categorized skill was removed), so return `{}` — NOT
  // `undefined`. The merger trusts `{}` and drops the stale existing stack,
  // whereas `undefined` would resurrect it (the removed-last-skill bug).
  const result: Partial<Record<AgentName, StackAgentConfig>> = {};
  for (const agent of inputs.agentList) {
    const built = buildAgentStack(agent, inputs);
    if (built) result[agent] = built;
  }
  return result;
}

/**
 * Generates a ProjectConfig from a list of selected skill IDs, rebuilding the
 * stack property (agent -> category -> SkillAssignment[]) from the current
 * wizard selection plus any previously-saved stack entries.
 *
 * Ownership rules (what lands in each agent's stack):
 * - agent is selected AND skill is non-excluded AND agent is non-excluded
 * - scope filter: a project-scoped skill never lands on a global-scoped agent
 * - relevance filter: a NEW triple lands only where the shared resolver targets
 *   the (skill, agent) pair — a sub-agent carries only skills it would
 *   reasonably use. Prior entries are preserved verbatim (D-220), wherever
 *   they sit.
 *
 * Load state per (agent, category, skill) triple: a triple `options.existingStack`
 * already carries keeps exactly what it carried — flag or no flag, that entry is
 * the author's stack YAML or the user's own curation. A triple that is new to
 * this save has nobody's word to inherit and takes the shared mapping's default,
 * which is what the editor resolves against too.
 *
 * @param name - Project name for the config
 * @param selectedSkillIds - Skill IDs selected by the user in the wizard
 * @param options - Optional description, author, selectedAgents, skillConfigs,
 *                  agentConfigs, and existingStack fields. When skillConfigs is
 *                  provided, it is used directly as `skills` in the config;
 *                  otherwise SkillConfig entries are synthesized with defaults.
 * @returns Complete ProjectConfig ready to be saved to config.ts
 */
type ResolvedSkillEntry = { skillId: SkillId; category: Category };

/**
 * Resolves selected ids against the matrix: warns and drops unknown ids, extracts
 * each skill's category, and drops ids whose every config entry is excluded.
 * A skill with an excluded global entry AND an active project entry is KEPT —
 * the active entry still needs to reach the stack builder.
 */
function resolveValidSkills(
  selectedSkillIds: SkillId[],
  skillConfigs: SkillConfig[],
): { validSkills: ResolvedSkillEntry[]; foundCount: number; skippedCount: number } {
  const looked = selectedSkillIds.map((skillId) => {
    const skill = matrix.skills[skillId];
    if (!skill) warn(`Skill '${skillId}' NOT FOUND in matrix`, { suppressInTest: true });
    return { skillId, skill };
  });
  const found = looked.filter(
    (entry): entry is typeof entry & { skill: NonNullable<typeof entry.skill> } =>
      entry.skill != null,
  );
  const skippedCount = looked.length - found.length;

  if (skippedCount > 0) {
    const matrixSample = typedKeys<SkillId>(matrix.skills).slice(0, 5).join(", ");
    warn(
      `${skippedCount}/${selectedSkillIds.length} skills not found in matrix. ` +
        `Matrix keys sample: [${matrixSample}]`,
      { suppressInTest: true },
    );
  }

  const excludedSkillIds = effectivelyExcludedSkillIds(skillConfigs);

  const validSkills = found
    .map(({ skillId, skill }) => ({
      skillId,
      category: extractCategoryFromPath(skill.category),
    }))
    .filter((entry): entry is typeof entry & { category: Category } => entry.category != null)
    .filter((entry) => !excludedSkillIds.has(entry.skillId));

  return { validSkills, foundCount: found.length, skippedCount };
}

/**
 * Per-skill scope, active-entry-authoritative: when a skill has both an excluded
 * and an active entry (excluded global + active project), excluded entries spread
 * first so active entries overwrite them.
 */
function buildSkillScopeMap(skillConfigs: SkillConfig[]): Map<SkillId, SkillScope> {
  const [excludedConfigs, activeConfigs] = partition(skillConfigs, (s) => Boolean(s.excluded));
  return new Map([...excludedConfigs, ...activeConfigs].map((s) => [s.id, s.scope]));
}

/**
 * One active AgentScopeConfig per selected agent. When the caller provided
 * agentConfigs, every selected agent MUST have a non-excluded entry (invariant
 * throw); otherwise agents default to project scope.
 */
function resolveActiveAgentConfigs(
  agentList: AgentName[],
  providedConfigs: AgentScopeConfig[] | undefined,
): AgentScopeConfig[] {
  const providedByName = providedConfigs
    ? indexBy(
        providedConfigs.filter((a) => !a.excluded),
        (a) => a.name,
      )
    : {};
  return agentList.map((agentName) => {
    if (providedConfigs) {
      const provided = providedByName[agentName];
      if (!provided) {
        throw new Error(
          `generateProjectConfigFromSkills: selected agent '${agentName}' has no ` +
            `non-excluded AgentScopeConfig in agentConfigs.`,
        );
      }
      return provided;
    }
    return { name: agentName, scope: "project" as const };
  });
}

export function generateProjectConfigFromSkills(
  name: string,
  selectedSkillIds: SkillId[],
  options?: ProjectConfigOptions & {
    selectedAgents?: AgentName[];
    skillConfigs?: SkillConfig[];
    agentConfigs?: AgentScopeConfig[];
    existingStack?: Partial<Record<AgentName, StackAgentConfig>>;
    /**
     * Skills new to this session (not present in the prior on-disk config).
     * Passing this field (even as an empty array) opts into D-220's per-agent
     * curation preservation: existing agents' stack entries are treated as
     * authoritative, and skills absent from a given agent's prior stack are
     * only appended when they appear in this set (or in `scopeEligibilityGained`).
     * When undefined, behavior falls back to pre-D-220 semantics.
     */
    newlyAddedSkillIds?: readonly SkillId[];
    /**
     * `(agent, skillId)` keys whose scope-compat transitioned from incompatible
     * to compatible this session. Admits scope-flip cases that `newlyAddedSkillIds`
     * (keyed by skill id only) cannot express. Keys are built with
     * {@link scopeEligibilityKey}.
     */
    scopeEligibilityGained?: ReadonlySet<string>;
  },
): ProjectConfig {
  const agentList = options?.selectedAgents ? [...options.selectedAgents].sort() : [];

  // Invariant: when selectedAgents is provided, callers must also supply the
  // authoritative SkillConfig and AgentScopeConfig entries so scope lookups
  // never silently default. Enforced here to prevent Bug 1-class regressions
  // where a missing config silently resolves every scope to "project".
  if (agentList.length > 0) {
    if (!options?.skillConfigs) {
      throw new Error(
        `generateProjectConfigFromSkills: selectedAgents was passed without skillConfigs. ` +
          `Callers must pass a SkillConfig for every selected skill.`,
      );
    }
    if (!options.agentConfigs) {
      throw new Error(
        `generateProjectConfigFromSkills: selectedAgents was passed without agentConfigs. ` +
          `Callers must pass an AgentScopeConfig for every selected agent.`,
      );
    }
  }

  // Safe after invariant: when agentList is non-empty these are guaranteed present.
  // When agentList is empty, no scope/ownership work runs so `[]` is a valid no-op.
  const skillConfigs = options?.skillConfigs ?? [];
  const agentConfigs = options?.agentConfigs ?? [];

  verbose(
    `generateProjectConfigFromSkills: ${selectedSkillIds.length} skills, ` +
      `matrix has ${typedKeys<SkillId>(matrix.skills).length} entries, ` +
      `agents=[${agentList.join(", ")}]`,
  );

  const { validSkills, foundCount, skippedCount } = resolveValidSkills(
    selectedSkillIds,
    skillConfigs,
  );

  verbose(
    `generateProjectConfigFromSkills: ${foundCount} found, ${skippedCount} not found, ` +
      `${agentList.length} agents in stack`,
  );

  const activeSkillsByCategory = new Map(
    typedEntries(groupBy(validSkills, (entry) => entry.category)).map(([category, entries]) => [
      category,
      entries.map((entry) => entry.skillId),
    ]),
  );

  const skillScope = buildSkillScopeMap(skillConfigs);
  const agentScope = activeAgentScopeMap(agentConfigs);

  // Opt-in D-220 preservation: only when the caller provides the delta set.
  // `newlyAddedSkillIds === undefined` triggers legacy seed-everything behavior
  // (preserves pre-D-220 callers and existing unit tests that set up
  // `existingStack` without the new field).
  const newlyAddedSkillIdsSet: ReadonlySet<SkillId> | undefined =
    options?.newlyAddedSkillIds === undefined ? undefined : new Set(options.newlyAddedSkillIds);

  const stackProperty = buildStackForSelection({
    agentList,
    activeSkillsByCategory,
    skillScope,
    agentScope,
    existingStack: options?.existingStack ?? {},
    ...(newlyAddedSkillIdsSet !== undefined && { newlyAddedSkillIds: newlyAddedSkillIdsSet }),
    ...(options?.scopeEligibilityGained !== undefined && {
      scopeEligibilityGained: options.scopeEligibilityGained,
    }),
  });

  const skills: SkillConfig[] =
    options?.skillConfigs ??
    selectedSkillIds.map((id) => ({ id, scope: "project" as const, source: EJECT_SOURCE }));

  const activeAgentConfigs = resolveActiveAgentConfigs(agentList, options?.agentConfigs);
  // Excluded agents aren't in selectedAgents but must be preserved in config
  const excludedAgentConfigs = agentConfigs.filter((ac) => ac.excluded);
  const finalAgentConfigs: AgentScopeConfig[] = [...activeAgentConfigs, ...excludedAgentConfigs];

  return {
    name,
    agents: finalAgentConfigs,
    skills,
    ...(stackProperty && { stack: stackProperty }),
    ...(options?.description && { description: options.description }),
    ...(options?.author && { author: options.author }),
  };
}

/**
 * One stack entry's load. A flag the author wrote is somebody's word and rides
 * through untouched — a third-party source's stacks file is the explicit tier,
 * and `loadStacks` gives even its bare strings an explicit `preloaded: false`.
 * An entry with no flag at all is a stack stating only WHICH skill an agent
 * gets, so HOW it loads is the shared mapping's answer, exactly as it is for a
 * skill picked by hand. The built-in stacks carry no flags, by design.
 */
function toStackPropertyAssignment(assignment: SkillAssignment, agent: AgentName): SkillAssignment {
  if (assignment.preloaded !== undefined) return assignment;
  if (mappedLoadState(assignment.id, agent) === "lazy") return assignment;

  return { ...assignment, preloaded: true };
}

/**
 * Extracts the stack property (agent -> category -> SkillAssignment[]) from a Stack definition.
 *
 * Stack values are already normalized to SkillAssignment[] by loadStacks().
 * Preserves every assignment, and every load its author stated; an assignment
 * that states none takes the shared mapping's, per `(skill, agent)` pair.
 *
 * @param stack - Loaded Stack definition with normalized agent configs
 * @returns Partial mapping of agent names to category-skill assignment mappings
 */
export function buildStackProperty(stack: Stack): Partial<Record<AgentName, StackAgentConfig>> {
  return typedFromEntries(
    typedEntries<AgentName, StackAgentConfig>(stack.agents)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      .filter(([, agentConfig]) => agentConfig && typedKeys<Category>(agentConfig).length > 0)
      .map(([agentId, agentConfig]) => {
        const resolvedMappings: StackAgentConfig = typedFromEntries(
          typedEntries<Category, SkillAssignment[]>(agentConfig)
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
            .filter(([, assignments]) => assignments && assignments.length > 0)
            .map(([category, assignments]) => [
              category,
              assignments.map((assignment) => toStackPropertyAssignment(assignment, agentId)),
            ]),
        );
        return [agentId, resolvedMappings] as const;
      })
      .filter(([, mappings]) => typedKeys<Category>(mappings).length > 0),
  );
}

/** Splits one agent's stack per category: global skills → global config, project skills → project config. */
function splitAgentStack(
  agentStack: StackAgentConfig,
  globalSkillIds: ReadonlySet<SkillId>,
): { global: StackAgentConfig; project: StackAgentConfig } {
  const perCategory = typedEntries<Category, SkillAssignment[]>(agentStack)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    .filter(([, assignments]) => assignments !== undefined)
    .map(([category, assignments]) => {
      const [globalOnly, projectOnly] = partition(assignments, (a) => globalSkillIds.has(a.id));
      return { category, globalOnly, projectOnly };
    });
  return {
    global: Object.fromEntries(
      perCategory.filter((c) => c.globalOnly.length > 0).map((c) => [c.category, c.globalOnly]),
    ),
    project: Object.fromEntries(
      perCategory.filter((c) => c.projectOnly.length > 0).map((c) => [c.category, c.projectOnly]),
    ),
  };
}

/**
 * Splits a ProjectConfig by scope into global and project partitions.
 * Skills with `scope: "global"` go to the global partition, `scope: "project"` to the project partition.
 * Agents are split based on which skills reference them in the stack.
 * Selected domains go to the global partition only — the project config inherits them from
 * global at runtime, so its own key is cleared rather than duplicated.
 */
export function splitConfigByScope(config: ProjectConfig): SplitConfigResult {
  // Every entry is either active-global or project-owned (project-scoped, or an
  // excluded-global tombstone routed to the project partition as an override).
  const [globalSkills, projectSkills] = partition(config.skills, (s) => isActiveAt(s, "global"));
  const [globalAgents, projectAgents] = partition(config.agents, (a) => isActiveAt(a, "global"));

  // Split stack by agent partition, filtering global agents' stacks to only reference global skills.
  // Project agents keep ALL skill references (both project and global) since global skills are available everywhere.
  const globalSkillIds = new Set(globalSkills.map((s) => s.id));
  const globalStack: typeof config.stack = {};
  const projectStack: typeof config.stack = {};

  if (config.stack) {
    for (const agent of globalAgents) {
      const agentStack = config.stack[agent.name];
      if (!agentStack) continue;
      const split = splitAgentStack(agentStack, globalSkillIds);
      if (typedKeys<Category>(split.global).length > 0) {
        globalStack[agent.name] = split.global;
      }
      if (typedKeys<Category>(split.project).length > 0) {
        projectStack[agent.name] = split.project;
      }
    }
    for (const agent of projectAgents) {
      const agentStack = config.stack[agent.name];
      if (agentStack) {
        projectStack[agent.name] = agentStack;
      }
    }
  }

  // Domains are a UI/preference concept — all selected domains go in global config.
  // Project config inherits domains from global at runtime, so it gets none.
  const globalConfig: ProjectConfig = {
    ...config,
    name: GLOBAL_CONFIG_NAME,
    agents: globalAgents,
    skills: globalSkills,
    ...(Object.keys(globalStack).length > 0 && { stack: globalStack }),
    ...(config.selectedDomains !== undefined && { selectedDomains: config.selectedDomains }),
  };

  const projectConfig: ProjectConfig = {
    ...config,
    name: config.name,
    agents: projectAgents,
    skills: projectSkills,
    ...(Object.keys(projectStack).length > 0 && { stack: projectStack }),
  };

  return { global: globalConfig, project: projectConfig };
}
