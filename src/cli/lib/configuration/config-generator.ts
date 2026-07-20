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

import type { AgentScopeConfig, SkillConfig, SkillScope } from "../../types/config";
import { matrix } from "../matrix/matrix-provider";
import { EJECT_SOURCE, GLOBAL_CONFIG_NAME, LOCAL_PSEUDO_CATEGORY } from "../../consts";
import { isActiveAt, activeAgentScopeMap, effectivelyExcludedSkillIds } from "./scope-predicates";
import { verbose, warn } from "../../utils/logger";
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
   * preservation rule is disabled and every scope-compatible skill lands on
   * every existing agent (legacy behavior). When defined (possibly empty), the
   * preservation rule applies: skills NOT in an agent's prior stack entry and
   * NOT in this set are omitted from that agent's stack — respecting the
   * user's curation.
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

function wasPreviouslyPreloaded(
  existingStack: Partial<Record<AgentName, StackAgentConfig>>,
  agent: AgentName,
  category: Category,
  skillId: SkillId,
): boolean {
  const prior = existingStack[agent]?.[category]?.find((a) => a.id === skillId);
  return prior?.preloaded === true;
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
 *     skill lands with `preloaded: false` (or preserved if present for another
 *     reason, which cannot happen here).
 *   - `agent ∈ existingStack`  → preservation branch:
 *       * skillId was in `existingStack[agent][category]` → KEEP (idempotent).
 *       * skillId ∈ `newlyAddedSkillIds` OR `(agent, skillId)` ∈
 *         `scopeEligibilityGained` → APPEND (user's session-level addition or
 *         scope-compat flip).
 *       * otherwise → OMIT (respect user's prior per-agent curation removal).
 *
 * Legacy path: when `newlyAddedSkillIds` is not provided, the D-220 check is
 * disabled — every scope-compatible skill lands. This preserves the contract
 * of callers that pre-date D-220.
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

function buildAgentStack(agent: AgentName, inputs: StackBuildInputs): StackAgentConfig | undefined {
  const agentStack: StackAgentConfig = {};
  for (const [category, skillIds] of inputs.activeSkillsByCategory) {
    const assignments = skillIds
      .filter((id) => isScopeCompatible(id, agent, inputs.skillScope, inputs.agentScope))
      .filter((id) => shouldIncludeTriple(agent, category, id, inputs))
      .map<SkillAssignment>((id) => ({
        id,
        preloaded: wasPreviouslyPreloaded(inputs.existingStack, agent, category, id),
      }));
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
 *
 * Preloaded flags are inherited from `options.existingStack` when the same
 * (agent, category, skill) triple was present before. New pairs default to
 * `preloaded: false` — preloaded is author-asserted via stack YAML at init
 * time and is never auto-set here.
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
 * Extracts the stack property (agent -> category -> SkillAssignment[]) from a Stack definition.
 *
 * Stack values are already normalized to SkillAssignment[] by loadStacks().
 * Preserves all assignments and preloaded flags for round-trip fidelity.
 *
 * @param stack - Loaded Stack definition with normalized agent configs
 * @returns Partial mapping of agent names to category-skill assignment mappings
 */
export function buildStackProperty(stack: Stack): Partial<Record<AgentName, StackAgentConfig>> {
  return typedFromEntries(
    typedEntries<AgentName, StackAgentConfig>(stack.agents)
      .filter(([, agentConfig]) => agentConfig && typedKeys<Category>(agentConfig).length > 0)
      .map(([agentId, agentConfig]) => {
        const resolvedMappings: StackAgentConfig = typedFromEntries(
          typedEntries<Category, SkillAssignment[]>(agentConfig).filter(
            ([, assignments]) => assignments && assignments.length > 0,
          ),
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
 * Domains are preserved in both configs as-is (the project config extends global at runtime).
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
      if (config.stack[agent.name]) {
        projectStack[agent.name] = config.stack[agent.name];
      }
    }
  }

  // Split selectedAgents by scope: global agents go to global config, project agents to project config
  const globalAgentNames = new Set(globalAgents.map((a) => a.name));
  const [globalSelectedAgents, projectSelectedAgents] = partition(
    config.selectedAgents ?? [],
    (a) => globalAgentNames.has(a),
  );

  // Domains are a UI/preference concept — all selected domains go in global config.
  // Project config inherits domains from global at runtime, so it gets none.
  const globalConfig: ProjectConfig = {
    ...config,
    name: GLOBAL_CONFIG_NAME,
    agents: globalAgents,
    skills: globalSkills,
    ...(Object.keys(globalStack).length > 0 ? { stack: globalStack } : { stack: undefined }),
    domains: config.domains,
    selectedAgents: globalSelectedAgents.length > 0 ? globalSelectedAgents : undefined,
  };

  const projectConfig: ProjectConfig = {
    ...config,
    name: config.name,
    agents: projectAgents,
    skills: projectSkills,
    ...(Object.keys(projectStack).length > 0 ? { stack: projectStack } : { stack: undefined }),
    domains: undefined,
    selectedAgents: projectSelectedAgents.length > 0 ? projectSelectedAgents : undefined,
  };

  return { global: globalConfig, project: projectConfig };
}
