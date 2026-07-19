import { flatMap } from "remeda";
import { create } from "zustand";
import { BUILT_IN_DOMAIN_ORDER, DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../consts.js";
import type { InstallMode } from "../lib/installation/index.js";
import { deriveInstallMode as sharedDeriveInstallMode } from "../lib/installation/installation.js";
import type { AgentScopeConfig, SkillConfig } from "../types/config.js";
import { matrix, getSkillById, getCategoryDomain } from "../lib/matrix/matrix-provider.js";
import {
  buildCategoriesForDomain,
  isCompatibleWithSelectedFrameworks,
} from "../lib/wizard/index.js";
import type {
  AgentName,
  BoundSkill,
  Domain,
  DomainSelections,
  SkillAlias,
  SkillAssignment,
  SkillId,
  SkillSource,
  Category,
  CategorySelections,
  ResolvedSkill,
} from "../types/index.js";
import type { SourceOption, SourceRow } from "../components/wizard/source-grid.js";
import { isAgentName } from "../utils/type-guards.js";
import { warn } from "../utils/logger.js";
import { typedEntries, typedFromEntries, typedKeys } from "../utils/typed-object.js";

/** First defined source among candidates, else the default public source. */
function resolveEffectiveSource(...candidates: Array<string | undefined>): string {
  return candidates.find((source) => source !== undefined) ?? DEFAULT_PUBLIC_SOURCE_NAME;
}

function createDefaultSkillConfig(id: SkillId): SkillConfig {
  const skill = matrix.skills[id];
  const primarySource = skill?.availableSources?.find((s) => s.primary)?.name;
  return { id, scope: "global", source: primarySource ?? DEFAULT_PUBLIC_SOURCE_NAME };
}

/** Sort domains into canonical order: custom domains first (alphabetically), then built-in domains per BUILT_IN_DOMAIN_ORDER. */
function sortDomainsCanonically(domains: Domain[]): Domain[] {
  const builtInSet = new Set<Domain>(BUILT_IN_DOMAIN_ORDER);
  return [
    ...domains.filter((d) => !builtInSet.has(d)).sort(),
    ...BUILT_IN_DOMAIN_ORDER.filter((d) => domains.includes(d)),
  ];
}

/** Finds framework-incompatible skill IDs in web domain selections, excluding already-excluded skills. */
function findIncompatibleWebSkills(
  webSelections: CategorySelections,
  skillConfigs: SkillConfig[],
): Set<SkillId> {
  const frameworkSelections = webSelections["web-framework"] ?? [];
  if (frameworkSelections.length === 0) return new Set();

  const excludedIds = new Set(skillConfigs.filter((s) => s.excluded).map((s) => s.id));
  const selectedFrameworkIds = frameworkSelections.map((alias) => getSkillById(alias).id);

  return new Set(
    flatMap(typedEntries(webSelections), ([cat, skills]) =>
      cat === "web-framework" || !skills
        ? []
        : skills.filter(
            (id) =>
              !excludedIds.has(id) && !isCompatibleWithSelectedFrameworks(id, selectedFrameworkIds),
          ),
    ),
  );
}

/** Returns selections with the given skill IDs removed from all categories. */
function removeSkillsFromSelections(
  selections: CategorySelections,
  toRemove: Set<SkillId>,
): CategorySelections {
  return typedFromEntries(
    typedEntries(selections).map(([cat, skills]): [Category, SkillId[]] => [
      cat,
      skills?.filter((id) => !toRemove.has(id)) ?? [],
    ]),
  );
}

/** True when configs hold an active (non-excluded) project-scope entry for the id. */
function hasProjectActive(configs: SkillConfig[], id: SkillId): boolean {
  return configs.some((sc) => sc.id === id && sc.scope === "project" && !sc.excluded);
}

/** True when configs hold an active (non-excluded) global-scope entry for the id. */
function hasGlobalActive(configs: SkillConfig[], id: SkillId): boolean {
  return configs.some((sc) => sc.id === id && sc.scope === "global" && !sc.excluded);
}

/** True when configs hold an excluded global-scope tombstone for the id. */
function hasGlobalTombstone(configs: SkillConfig[], id: SkillId): boolean {
  return configs.some((sc) => sc.id === id && sc.scope === "global" && sc.excluded);
}

/**
 * D-233 Scenario B: a dual-scope pair — an active project entry plus a global tombstone for
 * the same skill. The shape the `[P][G]` row renders from; removal collapses it to a single
 * inherited-global entry, re-selection rebuilds it.
 */
function isDualScopePair(configs: SkillConfig[], id: SkillId): boolean {
  return hasProjectActive(configs, id) && hasGlobalTombstone(configs, id);
}

/**
 * Remove project-scope skills; mark global-scope skills as excluded only if previously
 * installed. Dual-scope entries (an active project entry paired with a global tombstone)
 * collapse to a single inherited-global entry so the `[G]` badge keeps rendering after the
 * project half is dropped (D-233 Scenario B).
 */
function applySkillRemoval(
  configs: SkillConfig[],
  removedIds: Iterable<SkillId>,
  installedSkillConfigs: SkillConfig[] | null,
): SkillConfig[] {
  const removed = removedIds instanceof Set ? removedIds : new Set(removedIds);
  const installedIds = installedSkillConfigs
    ? new Set(installedSkillConfigs.map((s) => s.id))
    : null;

  const result: SkillConfig[] = [];
  for (const sc of configs) {
    if (!removed.has(sc.id)) {
      result.push(sc);
      continue;
    }
    // Dual-scope: drop BOTH the active project entry and the global tombstone. The skill
    // stays globally installed, so it is re-surfaced as an inherited-global entry below.
    if (isDualScopePair(configs, sc.id)) {
      continue;
    }
    // Non-dual-scope: keep a previously-installed global skill as an excluded tombstone.
    if (sc.scope === "global" && installedIds?.has(sc.id)) {
      result.push({ ...sc, excluded: true });
    }
    // Otherwise (project scope, or not globally installed): drop entirely.
  }

  for (const id of removed) {
    if (isDualScopePair(configs, id)) {
      const globalEntry = configs.find((sc) => sc.id === id && sc.scope === "global");
      result.push({
        id,
        scope: "global",
        source: globalEntry?.source ?? DEFAULT_PUBLIC_SOURCE_NAME,
      });
    }
  }

  return result;
}

/** All skill IDs across a domain's category selections, in category order. */
function flattenCategorySelections(selections: CategorySelections): SkillId[] {
  return Object.values(selections).filter(Boolean).flat();
}

/** Collects all skill IDs from a domain's category selections. */
function collectSkillIdsFromSelections(selections: CategorySelections): Set<SkillId> {
  return new Set(flattenCategorySelections(selections));
}

/** Reconciles skill configs after selection changes: removes project skills, marks global as excluded, restores excluded on re-select, adds new defaults. */
function reconcileSkillConfigs(
  configs: SkillConfig[],
  added: SkillId[],
  removed: SkillId[],
  installedSkillConfigs: SkillConfig[] | null,
  isEditingFromGlobalScope: boolean,
): SkillConfig[] {
  // Editing from global scope has no project overlay, so a removal is a genuine uninstall.
  // Pass null so applySkillRemoval DROPS the skill rather than leaving a project-local tombstone
  // in the global config — mirroring toggleAgent's effectiveInstalledConfigs (D-233 Scenario C).
  const effectiveInstalled = isEditingFromGlobalScope ? null : installedSkillConfigs;
  let result = applySkillRemoval(configs, removed, effectiveInstalled);

  for (const id of added) {
    // Dual-scope restore: re-selecting a skill that is globally installed (recorded as a
    // tombstone in the project snapshot) with no current project entry re-creates BOTH a
    // fresh project entry and a global tombstone — mirroring toggleSkillScope's G->P path
    // so the row renders `[P][G]` again (D-233 Scenario B second spacebar).
    if (
      !isEditingFromGlobalScope &&
      hasGlobalTombstone(installedSkillConfigs ?? [], id) &&
      !hasProjectActive(result, id)
    ) {
      const globalEntry =
        (installedSkillConfigs ?? []).find((sc) => sc.id === id && sc.scope === "global") ??
        result.find((sc) => sc.id === id && sc.scope === "global");
      const source = globalEntry?.source ?? DEFAULT_PUBLIC_SOURCE_NAME;
      result = [
        ...result.filter((sc) => sc.id !== id),
        { id, scope: "project", source },
        { id, scope: "global", excluded: true, source },
      ];
      continue;
    }

    const existingExcluded = result.find((sc) => sc.id === id && sc.excluded);
    if (existingExcluded) {
      result = result.map((sc) =>
        sc.id === id && sc.excluded ? { ...sc, excluded: undefined } : sc,
      );
    } else if (!result.some((sc) => sc.id === id)) {
      result = [...result, createDefaultSkillConfig(id)];
    }
  }

  return result;
}

/** True when configs hold an active (non-excluded) project-scope entry for the agent. */
function agentHasProjectActive(configs: AgentScopeConfig[], name: AgentName): boolean {
  return configs.some((ac) => ac.name === name && ac.scope === "project" && !ac.excluded);
}

/** True when configs hold an active (non-excluded) global-scope entry for the agent. */
function agentHasGlobalActive(configs: AgentScopeConfig[], name: AgentName): boolean {
  return configs.some((ac) => ac.name === name && ac.scope === "global" && !ac.excluded);
}

/** True when configs hold an excluded global-scope tombstone for the agent. */
function agentHasGlobalTombstone(configs: AgentScopeConfig[], name: AgentName): boolean {
  return configs.some((ac) => ac.name === name && ac.scope === "global" && ac.excluded);
}

/** Agent side of isDualScopePair (D-233): active project entry + global tombstone for the same agent. */
function isDualScopeAgentPair(configs: AgentScopeConfig[], name: AgentName): boolean {
  return agentHasProjectActive(configs, name) && agentHasGlobalTombstone(configs, name);
}

/**
 * Excluded tombstone entries. Preserved across reconcile/preselect merges so a dual-scope
 * pair's tombstone half survives (D-223/D-227) and the pair can be restored later.
 */
function collectTombstones<T extends { excluded?: boolean }>(configs: T[]): T[] {
  return configs.filter((entry) => entry.excluded);
}

/** Applies an agent toggle: deselect marks global as excluded (if previously installed) or removes; select restores excluded or adds new. */
function applyAgentToggle(
  configs: AgentScopeConfig[],
  agent: AgentName,
  isSelected: boolean,
  installedAgentConfigs: AgentScopeConfig[] | null,
): AgentScopeConfig[] {
  if (isSelected) {
    const config = configs.find((ac) => ac.name === agent);
    const wasInstalled = installedAgentConfigs?.some((ac) => ac.name === agent) ?? false;
    if (config?.scope === "global" && wasInstalled) {
      return configs.map((ac) => (ac.name === agent ? { ...ac, excluded: true } : ac));
    }
    return configs.filter((ac) => ac.name !== agent);
  }

  const existingExcluded = configs.find((ac) => ac.name === agent && ac.excluded);
  if (existingExcluded) {
    return configs.map((ac) =>
      ac.name === agent && ac.excluded ? { ...ac, excluded: undefined } : ac,
    );
  }
  return [...configs, { name: agent, scope: "global" as const }];
}

/**
 * D-233: collapses a dual-scope agent (active project entry + global tombstone) to a single
 * inherited-global entry on deselect — dropping BOTH the project entry and the tombstone,
 * mirroring the skill path in applySkillRemoval. The agent is STILL active globally, so it
 * stays in selectedAgents (what a save-and-reopen re-derives); the grid reads its checkbox
 * from selectedAgents, so dropping it would render the still-active agent as unselected.
 */
function collapseDualScopeAgent(
  selectedAgents: AgentName[],
  agentConfigs: AgentScopeConfig[],
  agent: AgentName,
) {
  return {
    selectedAgents: selectedAgents.includes(agent) ? selectedAgents : [...selectedAgents, agent],
    agentConfigs: [
      ...agentConfigs.filter((ac) => ac.name !== agent),
      { name: agent, scope: "global" as const },
    ],
  };
}

/**
 * D-233: restores the `[P][G]` pair when re-selecting an inherited-global agent row whose
 * global install is recorded as a tombstone in the project snapshot — mirrors
 * reconcileSkillConfigs' restore branch. The rebuilt pair is session-authored, so the agent
 * is recorded in _sessionRebuiltScopePairAgents.
 */
function restoreDualScopeAgent(
  selectedAgents: AgentName[],
  agentConfigs: AgentScopeConfig[],
  sessionRebuilt: ReadonlySet<AgentName>,
  agent: AgentName,
) {
  return {
    selectedAgents: [...selectedAgents, agent],
    agentConfigs: [
      ...agentConfigs.filter((ac) => ac.name !== agent),
      { name: agent, scope: "project" as const },
      { name: agent, scope: "global" as const, excluded: true },
    ],
    _sessionRebuiltScopePairAgents: new Set([...sessionRebuilt, agent]),
  };
}

/** Builds a SkillConfig for a resolved skill ID, preferring saved config values. */
function buildSkillConfigForId(id: SkillId, savedConfigs?: SkillConfig[]): SkillConfig {
  // Prefer project-scoped entry over global when duplicates exist (D-198 defensive fix)
  const saved =
    savedConfigs?.find((sc) => sc.id === id && !sc.excluded && sc.scope === "project") ??
    savedConfigs?.find((sc) => sc.id === id && !sc.excluded);
  const skill = matrix.skills[id];
  const primarySource = skill?.availableSources?.find((s) => s.primary)?.name;
  return {
    id,
    scope: saved?.scope ?? "global",
    source: resolveEffectiveSource(saved?.source, primarySource),
  };
}

/**
 * Builds an active AgentScopeConfig for a name, preferring a saved project-scoped
 * active entry. Mirrors buildSkillConfigForId on the agent path so preselection can
 * separate active-entry construction from tombstone preservation (D-227).
 */
function buildAgentConfigForName(
  name: AgentName,
  savedConfigs?: AgentScopeConfig[],
): AgentScopeConfig {
  // Prefer project-scoped active entry over global when duplicates exist.
  const saved =
    savedConfigs?.find((ac) => ac.name === name && !ac.excluded && ac.scope === "project") ??
    savedConfigs?.find((ac) => ac.name === name && !ac.excluded);
  return { name, scope: saved?.scope ?? "global" };
}

/** Restores skill configs for a domain: clears excluded flags on restored skills, adds new defaults for unknown skills. */
function restoreSkillConfigs(
  existingConfigs: SkillConfig[],
  restoredIds: SkillId[],
): SkillConfig[] {
  const restoredSet = new Set(restoredIds);
  const existingIds = new Set(existingConfigs.map((sc) => sc.id));

  const updated = existingConfigs.map((sc) =>
    restoredSet.has(sc.id) && sc.excluded ? { ...sc, excluded: undefined } : sc,
  );

  const newConfigs = restoredIds.filter((id) => !existingIds.has(id)).map(createDefaultSkillConfig);

  return [...updated, ...newConfigs];
}

/** Built-in agent names grouped by domain prefix. Custom domains return no preselected agents. */
const DOMAIN_AGENTS: Partial<Record<Domain, AgentName[]>> = {
  web: [
    "web-developer",
    "web-reviewer",
    "web-researcher",
    "web-tester",
    "web-pm",
    "web-architecture",
  ],
  api: ["api-developer", "api-reviewer", "api-researcher"],
  cli: ["cli-developer", "cli-tester", "cli-reviewer"],
};

/**
 * Fixed source sort tiers (lower = higher priority):
 * 1 = eject/global (installed on disk -- type "eject" or installed via plugin)
 * 2 = scoped marketplace (primary source from --source flag)
 * 3 = default public marketplace (Agents Inc)
 * 4 = third-party marketplaces (extra configured sources)
 */
const SOURCE_SORT_TIER_LOCAL = 1;
const SOURCE_SORT_TIER_SCOPED = 2;
const SOURCE_SORT_TIER_PUBLIC = 3;
const SOURCE_SORT_TIER_THIRD_PARTY = 4;

function getSourceSortTier(source: SkillSource): number {
  if (source.type === "local") return SOURCE_SORT_TIER_LOCAL;
  if (source.primary) return SOURCE_SORT_TIER_SCOPED;
  if (source.type === "public") return SOURCE_SORT_TIER_PUBLIC;
  return SOURCE_SORT_TIER_THIRD_PARTY;
}

function resolveSkillForPopulation(
  skillId: SkillId,
): { domain: Domain; subcat: Category; techId: SkillId } | null {
  const { skills } = matrix;
  const skill = skills[skillId];
  if (!skill?.category) {
    warn(
      `Installed skill '${skillId}' is missing from the marketplace — it may have been removed or renamed`,
    );
    return null;
  }

  const domain = getCategoryDomain(skill.category);
  if (!domain) {
    warn(`Installed skill '${skillId}' has unknown category '${skill.category}' — skipping`);
    return null;
  }

  // Boundary cast: domain lookup confirmed category exists in matrix
  const subcat = skill.category as Category;
  return { domain, subcat, techId: skillId };
}

/** Adds a skill to selections[domain][category] if absent; true when newly added. */
function addToDomainSelections(
  selections: DomainSelections,
  domain: Domain,
  category: Category,
  skillId: SkillId,
): boolean {
  const categorySelections = (selections[domain] ??= {});
  const skillList = (categorySelections[category] ??= []);
  if (skillList.includes(skillId)) return false;
  skillList.push(skillId);
  return true;
}

function buildBoundSkillOptions(
  boundSkills: BoundSkill[],
  alias: SkillAlias,
  selectedSource: string,
): SourceOption[] {
  return boundSkills
    .filter((b) => b.boundTo === alias)
    .map((bound) => ({
      id: bound.sourceName,
      selected: selectedSource === bound.sourceName,
      installed: false,
    }));
}

/** All source options for one skill: eject first, sorted sources (or the public default), then bound skills. */
function buildSkillSourceOptions(
  skill: ResolvedSkill,
  selectedSource: string,
  boundSkills: BoundSkill[],
): SourceOption[] {
  const sortedSources = [...(skill.availableSources || [])].sort(
    (a, b) => getSourceSortTier(a) - getSourceSortTier(b),
  );
  const baseOptions: SourceOption[] =
    sortedSources.length > 0
      ? sortedSources.map((source) => ({
          id: source.name,
          displayName: source.displayName,
          selected: selectedSource === source.name,
          installed: source.installed,
        }))
      : [
          {
            id: DEFAULT_PUBLIC_SOURCE_NAME,
            selected: selectedSource === DEFAULT_PUBLIC_SOURCE_NAME,
            installed: false,
          },
        ];
  const withEject = baseOptions.some((o) => o.id === EJECT_SOURCE)
    ? baseOptions
    : [
        { id: EJECT_SOURCE, selected: selectedSource === EJECT_SOURCE, installed: false },
        ...baseOptions,
      ];
  return [...withEject, ...buildBoundSkillOptions(boundSkills, skill.slug, selectedSource)];
}

type SourceRowContext = {
  configEntry: SkillConfig | undefined;
  installedSkillConfigs: SkillConfig[] | null;
  isEditingFromGlobalScope: boolean;
};

/**
 * Classifies one skill into its source-grid rows: a locked global row for
 * excluded-global entries, locked global + editable project rows for skills
 * re-scoped global→project this session, or a single row otherwise.
 */
function classifySkillSourceRows(
  skillId: SkillId,
  options: SourceOption[],
  context: SourceRowContext,
): SourceRow[] {
  const { configEntry, installedSkillConfigs, isEditingFromGlobalScope } = context;

  const isExcludedGlobal = configEntry?.excluded && configEntry?.scope === "global";
  if (isExcludedGlobal && !isEditingFromGlobalScope) {
    const installedSource =
      installedSkillConfigs?.find(
        (sc) => sc.id === skillId && sc.scope === "global" && !sc.excluded,
      )?.source ?? configEntry.source;
    const excludedOptions = options.map((o) => ({
      ...o,
      selected: o.id === installedSource,
    }));
    return [{ skillId, options: excludedOptions, scope: "global" as const, readOnly: true }];
  }

  const isInstalledGlobal = installedSkillConfigs?.some(
    (sc) => sc.id === skillId && sc.scope === "global" && !sc.excluded,
  );
  const wasReScoped =
    !isEditingFromGlobalScope && !!isInstalledGlobal && configEntry?.scope === "project";

  if (wasReScoped) {
    // Skill toggled from global to project — emit locked global copy + editable project copy
    const installedSource = installedSkillConfigs!.find(
      (sc) => sc.id === skillId && sc.scope === "global" && !sc.excluded,
    )!.source;
    const globalOptions = options.map((o) => ({
      ...o,
      selected: o.id === installedSource,
    }));
    return [
      { skillId, options: globalOptions, scope: "global" as const, readOnly: true },
      { skillId, options, scope: "project" as const },
    ];
  }

  const readOnly = !isEditingFromGlobalScope && !!isInstalledGlobal;
  return [
    {
      skillId,
      options,
      scope: configEntry?.scope as "project" | "global" | undefined,
      ...(readOnly ? { readOnly: true as const } : {}),
    },
  ];
}

/** Visual grouping order in source-grid: global readOnly, global editable, then project. */
function sourceRowSortTier(row: SourceRow): number {
  if (row.scope === "global" && row.readOnly) return 0;
  if (row.scope === "global") return 1;
  return 2;
}

/**
 * Wizard step identifiers for the multi-step init/edit flow.
 *
 * Progression: stack -> domains -> build -> sources -> agents -> confirm
 * The "stack" step shows all stacks + "Start from scratch" in a unified list.
 * The "domains" step shows domain selection (web, api, cli, mobile, shared).
 * Navigation is tracked via the `history` stack for goBack() support.
 */
export type WizardStep =
  | "stack" // Select stack or "Start from scratch"
  | "domains" // Select domains to configure
  | "build" // CategoryGrid for technology selection
  | "sources" // Choose skill sources (recommended vs custom)
  | "agents" // Select which agents to compile
  | "confirm"; // Final confirmation

const WIZARD_STEP_ORDER = [
  "stack",
  "domains",
  "build",
  "sources",
  "agents",
  "confirm",
] as const satisfies readonly WizardStep[];

/**
 * Wizard store state and actions.
 *
 * The store uses a composition pattern: small, focused actions that each mutate
 * one or two state fields. Wizard step components compose these actions to build
 * up the full selection state incrementally (domains -> categories -> skills -> sources).
 *
 * State flow: stack/scratch selection -> domain selection -> per-domain skill
 * selection (build step) -> source customization -> agent selection -> confirmation.
 */
export type WizardState = {
  step: WizardStep;

  approach: "stack" | "scratch" | null;
  selectedStackId: string | null;
  stackAction: "defaults" | "customize" | null;

  selectedDomains: Domain[];

  currentDomainIndex: number;
  domainSelections: DomainSelections;
  /** Snapshot of stack-provided domain selections for restoration on domain re-toggle */
  _stackDomainSelections: DomainSelections | null;

  showLabels: boolean;
  filterIncompatible: boolean;

  skillConfigs: SkillConfig[];
  focusedSkillId: SkillId | null;

  /**
   * Skill ids from the saved config that could NOT be resolved against the currently-loaded
   * source matrix this session (populateFromSkillIds skipped them). The wizard cannot represent
   * these skills, so their absence from the wizard result is NOT a deselection — the merge layer
   * must preserve any existing config entry whose id is in this set, regardless of
   * authoritativeScope (D-233 Scenario C data-loss guard).
   */
  unresolvableSkillIds: SkillId[];

  customizeSources: boolean;

  showSettings: boolean;
  showInfo: boolean;
  enabledSources: Record<string, boolean>;

  selectedAgents: AgentName[];
  agentConfigs: AgentScopeConfig[];
  focusedAgentId: AgentName | null;

  boundSkills: BoundSkill[];

  /** Snapshot of configs that were installed before the wizard opened, used for diff rendering */
  installedSkillConfigs: SkillConfig[] | null;
  installedAgentConfigs: AgentScopeConfig[] | null;

  /**
   * Skill ids whose dual-scope `[P][G]` pair was (re)established by a store action THIS
   * session — via `s` (toggleSkillScope G→P re-adding the global tombstone) or a spacebar
   * re-select that rebuilds the pair. Such a pair is session-authored, not the pristine pair
   * carried in `installedSkillConfigs` from hydration. The "persisted dual-scope pair" guard
   * in toggleSkillScope consults this set so it lets `s` freely round-trip a reconstructed
   * pair instead of locking it: a snapshot/shape comparison alone cannot tell a pristine
   * reopened pair apart from one collapsed and rebuilt within the same session.
   */
  _sessionRebuiltScopePairSkills: Set<SkillId>;
  /** Agent-name equivalent of `_sessionRebuiltScopePairSkills` (toggleAgentScope / toggleAgent restore). */
  _sessionRebuiltScopePairAgents: Set<AgentName>;

  /** True when running init (first-time setup), false when editing an existing installation */
  isInitMode: boolean;

  /** When true, scope toggling is disabled (editing from ~/.claude/ with no project to move items to) */
  isEditingFromGlobalScope: boolean;

  /** Temporary toast message shown in the wizard (auto-cleared after timeout) */
  toastMessage: string | null;

  /** Global skill configs to pre-select when a stack or scratch is chosen in init. Set by use-wizard-initialization. */
  globalPreselections: SkillConfig[] | null;

  /** Global agent preselections to restore after selectStack wipes selectedAgents/agentConfigs. Set by use-wizard-initialization. */
  globalAgentPreselections: { agents: AgentName[]; configs: AgentScopeConfig[] } | null;

  history: WizardStep[];

  /**
   * Navigate to a wizard step, pushing the current step onto history.
   * @param step - Target step to navigate to
   *
   * Side effects: sets `step`, appends previous step to `history`
   */
  setStep: (step: WizardStep) => void;
  /**
   * Set the wizard approach (stack-based or build-from-scratch).
   * @param approach - "stack" to use a pre-built template, "scratch" to select skills manually, null to reset
   *
   * Side effects: sets `approach`
   */
  setApproach: (approach: "stack" | "scratch" | null) => void;
  /**
   * Select a stack by ID, or null to deselect.
   * @param stackId - Stack identifier from suggestedStacks, or null to clear
   *
   * Side effects: sets `selectedStackId`
   */
  selectStack: (stackId: string | null) => void;
  /**
   * Set how to apply the selected stack.
   * @param action - "defaults" to use stack as-is, "customize" to enter the build step
   *
   * Side effects: sets `stackAction`
   */
  setStackAction: (action: "defaults" | "customize") => void;
  /**
   * Pre-populate domainSelections from a stack's agent-to-skill mappings.
   *
   * Iterates all agents in the stack, resolving each category's skill assignments
   * to the appropriate domain. Enables all domains and deduplicates skill IDs.
   *
   * @param stack - Stack definition with agent-level skill assignments
   * @param stack.agents - Record of agent name to `{ category: SkillAssignment[] }` mappings
   * @param categories - Category definitions used to resolve category -> domain mapping
   *
   * Side effects: sets `domainSelections`, sets `selectedDomains` to ALL_DOMAINS
   */
  populateFromStack: (stack: {
    agents: Record<string, Partial<Record<Category, SkillAssignment[]>>>;
  }) => void;
  /**
   * Pre-populate domainSelections from a flat list of installed skill IDs.
   *
   * Used by `agentsinc edit` to restore wizard state from existing project config.
   * Looks up each skill's category and domain, warns for unresolvable skills.
   *
   * @param skillIds - Flat array of currently installed skill IDs
   * @param skills - Skill lookup providing category and displayName per skill ID
   * @param categories - Category definitions used to resolve category -> domain mapping
   *
   * Side effects: sets `domainSelections`, sets `selectedDomains` to domains found in the provided skill IDs
   */
  populateFromSkillIds: (skillIds: SkillId[], savedConfigs?: SkillConfig[]) => void;
  /**
   * Toggle a domain on or off in the selectedDomains list.
   * @param domain - Domain to toggle
   *
   * Side effects: adds or removes from `selectedDomains`
   */
  toggleDomain: (domain: Domain) => void;
  /**
   * Toggle a skill selection within a domain's category.
   *
   * When exclusive is true (radio behavior), selecting a new skill replaces any
   * existing selection in that category. When false (checkbox behavior),
   * the skill is added to or removed from the selection array.
   *
   * @param domain - Domain containing the category
   * @param category - Category within the domain
   * @param technology - Skill ID to toggle
   * @param exclusive - If true, only one skill can be selected per category (radio)
   *
   * Side effects: updates `domainSelections[domain][category]`
   */
  toggleTechnology: (
    domain: Domain,
    category: Category,
    technology: SkillId,
    exclusive: boolean,
  ) => void;
  /**
   * Advance to the next domain in the build step.
   * @returns true if advanced, false if already at the last domain
   *
   * Side effects: increments `currentDomainIndex`
   */
  nextDomain: () => boolean;
  /**
   * Go back to the previous domain in the build step.
   * @returns true if moved back, false if already at the first domain
   *
   * Side effects: decrements `currentDomainIndex`
   */
  prevDomain: () => boolean;
  /**
   * Set the current domain index directly.
   * @param index - Index to set (0-based, must be within selectedDomains range)
   *
   * Side effects: sets `currentDomainIndex` if index is valid, otherwise no-op
   */
  setCurrentDomainIndex: (index: number) => void;
  /** Toggle compatibility label visibility on skill tags in the build step grid. */
  toggleShowLabels: () => void;
  /** Toggle filtering of incompatible skills in the build step grid. */
  toggleFilterIncompatible: () => void;
  /**
   * Derive the install mode from skillConfigs source values.
   * If all skills use "eject" source, returns "eject". If all use non-eject, returns "plugin".
   * If mixed, returns "mixed". Returns "eject" when no skills are configured.
   */
  deriveInstallMode: () => InstallMode;
  /**
   * Toggle the scope of a specific skill between "project" and "global".
   * @param skillId - Skill to toggle scope for
   *
   * Side effects: updates `skillConfigs` entry for the skill
   */
  toggleSkillScope: (skillId: SkillId) => void;
  /**
   * Update the source for a specific skill in skillConfigs.
   * @param skillId - Skill to update
   * @param source - Source identifier (e.g., "eject", marketplace name)
   *
   * Side effects: updates `skillConfigs` entry for the skill
   */
  setSkillSource: (skillId: SkillId, source: string) => void;
  /**
   * Set the currently focused skill ID in the build step (for S hotkey).
   * @param id - Skill ID to focus, or null to clear
   *
   * Side effects: sets `focusedSkillId`
   */
  setFocusedSkillId: (id: SkillId | null) => void;
  /**
   * Seed `focusedSkillId` to the skill the build-step grid focuses first for the
   * active domain (row 0, col 0 of the filtered category rows). Runs synchronously
   * at build-step entry and on every domain change so the `s` scope hotkey — which
   * reads `focusedSkillId` — always resolves the visually-focused skill, with no
   * dependency on CategoryGrid's post-mount effect.
   *
   * Side effects: sets `focusedSkillId` (null when the active domain has no skills)
   */
  seedFocusedSkillForActiveDomain: () => void;
  /**
   * Set which source provides a specific skill.
   * @param skillId - Skill to configure the source for
   * @param sourceId - Source identifier (e.g., "public", "eject", marketplace name)
   *
   * Side effects: updates `skillConfigs` entry for the skill. No-op with warning if either param is empty.
   */
  setSourceSelection: (skillId: SkillId, sourceId: string) => void;
  /**
   * Enable or disable source customization on the sources step.
   * @param customize - true to show per-skill source pickers
   *
   * Side effects: sets `customizeSources`
   */
  setCustomizeSources: (customize: boolean) => void;
  /** Toggle the settings overlay (source management). */
  toggleSettings: () => void;
  /** Toggle the info overlay (selected skills and agents). */
  toggleInfo: () => void;
  /** Set a temporary toast message, or null to clear it. */
  setToastMessage: (message: string | null) => void;
  /**
   * Replace the full set of enabled/disabled sources.
   * @param sources - Record of source name to enabled boolean. Empty-string keys are filtered out.
   *
   * Side effects: sets `enabledSources`
   */
  setEnabledSources: (sources: Record<string, boolean>) => void;
  /**
   * Add a bound skill from search to the wizard's bound skills list.
   * Duplicates (same id + sourceUrl) are silently skipped with a warning.
   *
   * @param skill - Bound skill to add (foreign skill tied to a category alias)
   *
   * Side effects: appends to `boundSkills`
   */
  bindSkill: (skill: BoundSkill) => void;
  /**
   * Navigate to the previous wizard step using the history stack.
   * No-op when history is empty (e.g., edit flow starting at a mid-wizard step).
   *
   * Side effects: pops from `history`, sets `step` to the popped value
   */
  goBack: () => void;
  /**
   * Toggle an agent on or off in the selectedAgents list.
   * @param agent - Agent name to toggle
   *
   * Side effects: adds or removes from `selectedAgents`, syncs `agentConfigs`
   */
  toggleAgent: (agent: AgentName) => void;
  /**
   * Toggle the scope of a specific agent between "project" and "global".
   * @param agentName - Agent to toggle scope for
   *
   * Side effects: updates `agentConfigs` entry for the agent
   */
  toggleAgentScope: (agentName: AgentName) => void;
  /**
   * Set the currently focused agent ID in the agents step (for S hotkey).
   * @param id - Agent name to focus, or null to clear
   *
   * Side effects: sets `focusedAgentId`
   */
  setFocusedAgentId: (id: AgentName | null) => void;
  /**
   * Preselect agents based on selected domains from the first wizard step.
   * Matches domains against DOMAIN_AGENTS mapping.
   * Optional agents (meta/pattern) are excluded.
   *
   * Side effects: replaces `selectedAgents` with computed preselection
   */
  preselectAgentsFromDomains: () => void;
  /**
   * Preselect agents for a chosen stack: merges the stack's agent keys with global
   * agent preselections, preserving dual-scope tombstones. Parallels
   * populateFromSkillIds on the skill path.
   *
   * Side effects: replaces `selectedAgents` and `agentConfigs` with the merged result
   */
  preselectAgentsFromStack: (stackAgents: AgentName[]) => void;
  /** Reset all wizard state to initial values. */
  reset: () => void;

  /**
   * Collect all selected skill IDs across all domains and categories.
   * @returns Flat array of every selected SkillId (may contain duplicates if shared across domains)
   */
  getAllSelectedTechnologies: () => SkillId[];
  /**
   * Group selected skill IDs by domain.
   * @returns Partial record mapping each domain with selections to its skill ID array
   */
  getSelectedTechnologiesPerDomain: () => Partial<Record<Domain, SkillId[]>>;
  /**
   * Get the domain currently visible in the build step.
   * @returns The domain at currentDomainIndex, or null if no domains are selected
   */
  getCurrentDomain: () => Domain | null;
  /**
   * Count total selected technologies across all domains.
   * @returns Number of selected skill IDs
   */
  getTechnologyCount: () => number;
  /**
   * Compute which wizard steps are completed and which are skipped.
   * Used by WizardTabs to render step progress indicators.
   * @returns Object with completedSteps and skippedSteps string arrays
   */
  getStepProgress: () => { completedSteps: WizardStep[]; skippedSteps: WizardStep[] };
  /** @returns true if there is a next domain after the current one */
  canGoToNextDomain: () => boolean;
  /** @returns true if there is a previous domain before the current one */
  canGoToPreviousDomain: () => boolean;
  /** Set all selected skills to "eject" source. */
  setAllSourcesEject: () => void;
  /** Set all selected skills to their first non-local (marketplace) source. */
  setAllSourcesPlugin: () => void;

  /**
   * Build the source selection rows for the sources step UI.
   *
   * For each selected technology, resolves the canonical skill ID, looks up available
   * sources from the matrix, merges in any bound skills from search, and determines
   * which source is currently selected. Sources are sorted: local first, then public,
   * then private/other.
   *
   * @returns Array of row objects, one per selected technology, each containing:
   *   - `skillId` - Canonical resolved skill ID
   *   - `options` - Available sources with selection state and install status
   */
  buildSourceRows: () => {
    skillId: SkillId;
    options: SourceOption[];
    scope?: "global" | "project";
    readOnly?: boolean;
  }[];
};

/** State-only fields from WizardState (excludes actions/getters). Used to type createInitialState(). */
type WizardStateData = Pick<
  WizardState,
  | "step"
  | "approach"
  | "selectedStackId"
  | "stackAction"
  | "selectedDomains"
  | "currentDomainIndex"
  | "domainSelections"
  | "_stackDomainSelections"
  | "showLabels"
  | "filterIncompatible"
  | "skillConfigs"
  | "focusedSkillId"
  | "unresolvableSkillIds"
  | "customizeSources"
  | "showSettings"
  | "showInfo"
  | "enabledSources"
  | "selectedAgents"
  | "agentConfigs"
  | "focusedAgentId"
  | "boundSkills"
  | "installedSkillConfigs"
  | "installedAgentConfigs"
  | "_sessionRebuiltScopePairSkills"
  | "_sessionRebuiltScopePairAgents"
  | "isInitMode"
  | "isEditingFromGlobalScope"
  | "toastMessage"
  | "globalPreselections"
  | "globalAgentPreselections"
  | "history"
>;

export const createInitialState = (overrides?: Partial<WizardStateData>): WizardStateData => ({
  step: "stack",
  approach: null,
  selectedStackId: null,
  stackAction: null,
  selectedDomains: [],
  currentDomainIndex: 0,
  domainSelections: {},
  /** Snapshot of domainSelections from populateFromStack/populateFromSkillIds, used to restore on domain re-toggle */
  _stackDomainSelections: null,
  showLabels: false,
  filterIncompatible: false,
  skillConfigs: [],
  focusedSkillId: null,
  unresolvableSkillIds: [],
  customizeSources: false,
  showSettings: false,
  showInfo: false,
  enabledSources: {},
  selectedAgents: [],
  agentConfigs: [],
  focusedAgentId: null,
  boundSkills: [],
  installedSkillConfigs: null,
  installedAgentConfigs: null,
  _sessionRebuiltScopePairSkills: new Set(),
  _sessionRebuiltScopePairAgents: new Set(),
  isInitMode: false,
  isEditingFromGlobalScope: false,
  toastMessage: null,
  globalPreselections: null,
  globalAgentPreselections: null,
  history: [],
  ...overrides,
});

export const useWizardStore = create<WizardState>((set, get) => ({
  ...createInitialState(),

  setStep: (step) => {
    set((state) => ({
      step,
      history: [...state.history, state.step],
    }));
    if (step === "build") get().seedFocusedSkillForActiveDomain();
  },

  setApproach: (approach) => set({ approach }),

  selectStack: (stackId) =>
    set({
      selectedStackId: stackId,
      domainSelections: {},
      _stackDomainSelections: null,
      selectedDomains: [],
      skillConfigs: [],
      selectedAgents: [],
      agentConfigs: [],
      boundSkills: [],
      currentDomainIndex: 0,
      stackAction: null,
    }),

  setStackAction: (action) => set({ stackAction: action }),

  populateFromStack: (stack) =>
    set(() => {
      const { categories } = matrix;
      const domainSelections: DomainSelections = {};
      const domains = new Set<Domain>();
      const allSkillIds = new Set<SkillId>();

      for (const agentConfig of Object.values(stack.agents)) {
        for (const [subcat, assignments] of typedEntries<Category, SkillAssignment[]>(
          agentConfig,
        )) {
          const category = categories[subcat];
          const domain = category?.domain;

          if (!domain || !assignments) {
            continue;
          }

          domains.add(domain);

          for (const assignment of assignments) {
            if (addToDomainSelections(domainSelections, domain, subcat, assignment.id)) {
              allSkillIds.add(assignment.id);
            }
          }
        }
      }

      const skillConfigs: SkillConfig[] = [...allSkillIds].map(createDefaultSkillConfig);

      // Derive agent preselection from the stack's agent keys
      const stackAgents: AgentName[] = Object.keys(stack.agents).filter(isAgentName).sort();
      const agentConfigs: AgentScopeConfig[] = stackAgents.map((name) => ({
        name,
        scope: "global" as const,
      }));

      return {
        domainSelections,
        _stackDomainSelections: structuredClone(domainSelections),
        selectedDomains: sortDomainsCanonically([...domains]),
        skillConfigs,
        selectedAgents: stackAgents,
        agentConfigs,
      };
    }),

  populateFromSkillIds: (skillIds, savedConfigs) =>
    set(() => {
      const domainSelections: DomainSelections = {};
      const resolvedSkillIds: SkillId[] = [];
      const unresolvableSkillIds: SkillId[] = [];

      for (const skillId of skillIds) {
        const resolved = resolveSkillForPopulation(skillId);
        if (!resolved) {
          unresolvableSkillIds.push(skillId);
          continue;
        }

        const { domain, subcat, techId } = resolved;
        if (addToDomainSelections(domainSelections, domain, subcat, techId)) {
          resolvedSkillIds.push(techId);
        }
      }

      if (unresolvableSkillIds.length > 0) {
        warn(
          `${unresolvableSkillIds.length} installed skill(s) could not be resolved and were skipped`,
        );
      }

      const selectedDomains = sortDomainsCanonically(typedKeys<Domain>(domainSelections));

      const skillConfigs: SkillConfig[] = resolvedSkillIds.map((id) =>
        buildSkillConfigForId(id, savedConfigs),
      );

      // Preserve excluded entries so they flow through to wizard result.
      // D-223: allow an excluded tombstone to coexist with an active entry for the
      // same skill id at a different scope (render layer computes secondaryScope
      // from the pair).
      const excludedConfigs = collectTombstones(savedConfigs ?? []);

      return {
        domainSelections,
        _stackDomainSelections: structuredClone(domainSelections),
        selectedDomains,
        skillConfigs: [...skillConfigs, ...excludedConfigs],
        unresolvableSkillIds,
      };
    }),

  toggleDomain: (domain) =>
    set((state) => {
      const isSelected = state.selectedDomains.includes(domain);
      if (isSelected) {
        const { [domain]: _removed, ...remainingSelections } = state.domainSelections;
        const removedSkillIds = _removed
          ? collectSkillIdsFromSelections(_removed)
          : new Set<SkillId>();

        return {
          selectedDomains: state.selectedDomains.filter((d) => d !== domain),
          domainSelections: remainingSelections,
          // Global-scope edit: no overlay, so deselecting a domain uninstalls its skills cleanly
          // rather than tombstoning them in the global config (D-233 Scenario C).
          skillConfigs: applySkillRemoval(
            state.skillConfigs,
            removedSkillIds,
            state.isEditingFromGlobalScope ? null : state.installedSkillConfigs,
          ),
        };
      }

      // Restore stack selections for this domain if a stack snapshot exists
      const stackSelections = state._stackDomainSelections?.[domain];
      if (stackSelections) {
        const restoredSkillIds = [...collectSkillIdsFromSelections(stackSelections)];

        return {
          selectedDomains: sortDomainsCanonically([...state.selectedDomains, domain]),
          domainSelections: {
            ...state.domainSelections,
            [domain]: structuredClone(stackSelections),
          },
          skillConfigs: restoreSkillConfigs(state.skillConfigs, restoredSkillIds),
        };
      }

      return {
        selectedDomains: sortDomainsCanonically([...state.selectedDomains, domain]),
      };
    }),

  toggleTechnology: (domain, category, technology, exclusive) =>
    set((state) => {
      const installed = state.installedSkillConfigs ?? [];
      const currentSelections = state.domainSelections[domain]?.[category] || [];
      const isSelected = currentSelections.includes(technology);

      // Block a globally-installed skill from being changed at project scope. An active global
      // entry in the hydration snapshot (genuinely global-only) blocks both directions, matching
      // the long-standing read-only behaviour. The tombstone arm additionally blocks a DESELECT
      // of the stale-snapshot state a persisted `[P][G]` reaches after an in-session spacebar
      // collapse (installed still shows the tombstone; the live config now shows a plain active
      // global), whose deselect would silently tombstone the still-real global install. It is
      // gated on `isSelected` so the sanctioned re-select restore path (reconcileSkillConfigs
      // rebuilds `[P][G]`) still runs, does NOT fire while the live config still holds the full
      // `[P][G]` pair (so the FIRST collapse spacebar is allowed), and never touches a skill
      // freshly added this session (absent from the snapshot).
      const isActiveGlobal =
        hasGlobalActive(installed, technology) ||
        (isSelected &&
          hasGlobalTombstone(installed, technology) &&
          hasGlobalActive(state.skillConfigs, technology));
      if (isActiveGlobal && !state.isEditingFromGlobalScope && !state.isInitMode) {
        return { toastMessage: "Global skills cannot be changed from project scope" };
      }

      if (isSelected) {
        const categoryDef = matrix.categories[category];
        if (categoryDef?.exclusive && categoryDef?.required) {
          const categorySkillCount = Object.values(matrix.skills).filter(
            (s) => s?.category === category,
          ).length;
          if (categorySkillCount <= 1) {
            return { toastMessage: "Cannot deselect the only skill in this category" };
          }
        }
      }

      // In exclusive mode, selecting a new skill replaces the current one.
      // Block if that would implicitly deselect a globally-installed skill.
      if (exclusive && !isSelected) {
        const hasGlobalSelection = currentSelections.some(
          (selectedId) =>
            hasGlobalActive(installed, selectedId) ||
            (hasGlobalTombstone(installed, selectedId) &&
              hasGlobalActive(state.skillConfigs, selectedId)),
        );
        if (hasGlobalSelection && !state.isEditingFromGlobalScope && !state.isInitMode) {
          return { toastMessage: "Global skills cannot be changed from project scope" };
        }
      }

      let newSelections: SkillId[];
      if (exclusive) {
        newSelections = isSelected ? [] : [technology];
      } else {
        newSelections = isSelected
          ? currentSelections.filter((t) => t !== technology)
          : [...currentSelections, technology];
      }

      const removed = currentSelections.filter((id) => !newSelections.includes(id));
      const added = newSelections.filter((id) => !currentSelections.includes(id));

      const skillConfigs = reconcileSkillConfigs(
        state.skillConfigs,
        added,
        removed,
        state.installedSkillConfigs,
        state.isEditingFromGlobalScope,
      );

      // A dual-scope deselect collapses to a single active inherited-global entry, so the
      // skill is still genuinely active. Keep it in the domain selection (mirroring what a
      // save-and-reopen re-derives via populateFromSkillIds) instead of dropping it purely
      // because it left the pre-removal selection array. A genuine full removal leaves no
      // active entry and still drops normally.
      const stillActiveAfterRemoval =
        isSelected &&
        !newSelections.includes(technology) &&
        (hasProjectActive(skillConfigs, technology) || hasGlobalActive(skillConfigs, technology));
      const resolvedSelections = stillActiveAfterRemoval
        ? [...newSelections, technology]
        : newSelections;

      // A spacebar re-select that rebuilds a dual-scope `[P][G]` pair marks the id as
      // session-authored, so the toggleSkillScope persisted-pair guard lets `s` round-trip it.
      const rebuiltPairSkills = added.filter((id) => isDualScopePair(skillConfigs, id));
      const nextRebuiltScopePairSkills =
        rebuiltPairSkills.length > 0
          ? new Set([...state._sessionRebuiltScopePairSkills, ...rebuiltPairSkills])
          : state._sessionRebuiltScopePairSkills;

      return {
        skillConfigs,
        _sessionRebuiltScopePairSkills: nextRebuiltScopePairSkills,
        domainSelections: {
          ...state.domainSelections,
          [domain]: {
            ...state.domainSelections[domain],
            [category]: resolvedSelections,
          },
        },
      };
    }),

  nextDomain: () => {
    const state = get();
    if (state.currentDomainIndex < state.selectedDomains.length - 1) {
      set({
        currentDomainIndex: state.currentDomainIndex + 1,
      });
      get().seedFocusedSkillForActiveDomain();
      return true;
    }
    return false;
  },

  prevDomain: () => {
    const state = get();
    if (state.currentDomainIndex > 0) {
      set({
        currentDomainIndex: state.currentDomainIndex - 1,
      });
      get().seedFocusedSkillForActiveDomain();
      return true;
    }
    return false;
  },

  setCurrentDomainIndex: (index) => {
    const state = get();
    if (index >= 0 && index < state.selectedDomains.length) {
      set({ currentDomainIndex: index });
      get().seedFocusedSkillForActiveDomain();
    }
  },

  toggleShowLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  toggleFilterIncompatible: () =>
    set((state) => {
      if (state.filterIncompatible) return { filterIncompatible: false };

      const webSelections = state.domainSelections.web;
      if (!webSelections) return { filterIncompatible: true };

      const removed = findIncompatibleWebSkills(webSelections, state.skillConfigs);
      if (removed.size === 0) return { filterIncompatible: true };

      return {
        filterIncompatible: true,
        domainSelections: {
          ...state.domainSelections,
          web: removeSkillsFromSelections(webSelections, removed),
        },
        // Global-scope edit: clean uninstall, no tombstone (D-233 Scenario C).
        skillConfigs: applySkillRemoval(
          state.skillConfigs,
          removed,
          state.isEditingFromGlobalScope ? null : state.installedSkillConfigs,
        ),
      };
    }),

  deriveInstallMode: (): InstallMode => {
    const { skillConfigs } = get();
    return sharedDeriveInstallMode(skillConfigs);
  },

  toggleSkillScope: (skillId) =>
    set((state) => {
      if (state.isEditingFromGlobalScope) return state;

      const config = state.skillConfigs.find((sc) => sc.id === skillId && !sc.excluded);
      if (!config) return state;

      // A PERSISTED dual-scope pair ([P][G]) reopened for edit and UNTOUCHED this session:
      // the saved snapshot carries the excluded global tombstone, so `s` has no well-defined
      // single target (space is the sanctioned way to change the project half — it drops or
      // restores both). No-op with a toast. Suppressed once the pair has been reconstructed by
      // a store action this session (`_sessionRebuiltScopePairSkills`): a pair collapsed and
      // then rebuilt in-session is session-authored, so `s` must round-trip it normally even
      // though its shape now matches the pristine snapshot. Within-session G↔P round-trips —
      // where the snapshot still holds an ACTIVE global entry — are unaffected either way.
      if (
        !state._sessionRebuiltScopePairSkills.has(skillId) &&
        hasGlobalTombstone(state.installedSkillConfigs ?? [], skillId) &&
        isDualScopePair(state.skillConfigs, skillId)
      ) {
        return { toastMessage: "Installed at both scopes — use space to change project scope" };
      }

      // Guard: block project eject → global when global eject already exists (would overwrite)
      if (config.scope === "project" && config.source === EJECT_SOURCE) {
        const globalEjectInstalled = state.installedSkillConfigs?.some(
          (sc) =>
            sc.id === skillId &&
            sc.scope === "global" &&
            sc.source === EJECT_SOURCE &&
            !sc.excluded,
        );
        if (globalEjectInstalled) {
          const hasExcludedEntry = state.skillConfigs.some(
            (sc) => sc.id === skillId && sc.excluded,
          );
          if (!hasExcludedEntry) {
            return { toastMessage: "Already exists as ejected skill at global scope" };
          }
        }
      }

      // A real global install exists when the snapshot carries EITHER an active global entry
      // or a global tombstone: a tombstone means the skill IS installed globally and this
      // project was overriding it. Both must re-create the tombstone on a G→P toggle, so an
      // in-session collapse→`s` restores a genuine `[P][G]` pair rather than a bare `[P]` that
      // loses the still-real global install. (Matches the agent-path derivation, which already
      // counts tombstones.)
      const wasInstalledGlobally =
        state.installedSkillConfigs?.some((sc) => sc.id === skillId && sc.scope === "global") ??
        false;
      const newScope = config.scope === "project" ? "global" : "project";

      let updatedConfigs = state.skillConfigs.map((sc) =>
        sc.id === skillId && !sc.excluded ? { ...sc, scope: newScope as "project" | "global" } : sc,
      );

      let pairRebuilt = false;
      if (newScope === "project") {
        // Moving global → project: add excluded global entry if not already there.
        // Gated on wasInstalledGlobally so fresh init toggles don't create spurious tombstones.
        if (
          wasInstalledGlobally &&
          !updatedConfigs.some((sc) => sc.id === skillId && sc.excluded)
        ) {
          updatedConfigs = [
            ...updatedConfigs,
            { id: skillId, scope: "global" as const, excluded: true, source: config.source },
          ];
          pairRebuilt = true;
        }
      } else {
        // Moving project → global: always drop any excluded global tombstone for this id.
        // An active entry at global scope supersedes any tombstone at the same scope — the
        // invariant "no active + tombstone at the same (id, scope)" must hold. Unconditional
        // removal (not gated on wasInstalledGlobally) heals the D-224 case where the prior
        // G→P produced a tombstone that installedSkillConfigs-derived wasInstalledGlobally
        // cannot see (because its `!sc.excluded` filter ignores the tombstone itself).
        updatedConfigs = updatedConfigs.filter((sc) => !(sc.id === skillId && sc.excluded));
      }

      // Mark a freshly (re)built `[P][G]` pair as session-authored so a subsequent `s` is not
      // blocked by the persisted-pair guard above — the pair now flips P↔G freely this session.
      return pairRebuilt
        ? {
            skillConfigs: updatedConfigs,
            _sessionRebuiltScopePairSkills: new Set([
              ...state._sessionRebuiltScopePairSkills,
              skillId,
            ]),
          }
        : { skillConfigs: updatedConfigs };
    }),

  setSkillSource: (skillId, source) =>
    set((state) => ({
      skillConfigs: state.skillConfigs.map((sc) => (sc.id === skillId ? { ...sc, source } : sc)),
    })),

  setFocusedSkillId: (id) => set({ focusedSkillId: id }),

  seedFocusedSkillForActiveDomain: () => {
    const state = get();
    const domain = state.getCurrentDomain();
    if (!domain) {
      set({ focusedSkillId: null });
      return;
    }
    const categories = buildCategoriesForDomain(
      domain,
      state.getAllSelectedTechnologies(),
      state.domainSelections[domain] ?? {},
      undefined,
      state.skillConfigs,
      state.filterIncompatible,
    );
    set({ focusedSkillId: categories[0]?.options[0]?.id ?? null });
  },

  setSourceSelection: (skillId, sourceId) =>
    set((state) => {
      if (!skillId) {
        warn("Ignoring setSourceSelection call with empty skillId");
        return state;
      }
      if (!sourceId) {
        warn(`Ignoring setSourceSelection call with empty sourceId for skill '${skillId}'`);
        return state;
      }
      return {
        skillConfigs: state.skillConfigs.map((sc) =>
          sc.id === skillId ? { ...sc, source: sourceId } : sc,
        ),
      };
    }),

  setCustomizeSources: (customize) => set({ customizeSources: customize }),

  toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),

  toggleInfo: () => set((state) => ({ showInfo: !state.showInfo })),

  setToastMessage: (message) => set({ toastMessage: message }),

  setEnabledSources: (sources) => {
    const invalidKeys = Object.keys(sources).filter((key) => !key.trim());
    if (invalidKeys.length > 0) {
      warn("Ignoring setEnabledSources call with empty source name(s)");
    }
    const validSources = Object.fromEntries(Object.entries(sources).filter(([key]) => key.trim()));
    return set({ enabledSources: validSources });
  },

  bindSkill: (skill) =>
    set((state) => {
      const exists = state.boundSkills.some(
        (b) => b.id === skill.id && b.sourceUrl === skill.sourceUrl,
      );
      if (exists) {
        warn(`Skill '${skill.id}' from '${skill.sourceUrl}' is already bound — skipping duplicate`);
        return state;
      }
      return { boundSkills: [...state.boundSkills, skill] };
    }),

  goBack: () =>
    set((state) => {
      if (state.history.length === 0) return state;
      const history = [...state.history];
      const previousStep = history.pop()!;
      return {
        step: previousStep,
        history,
      };
    }),

  toggleAgent: (agent) =>
    set((state) => {
      const installed = state.installedAgentConfigs ?? [];

      const isDualScopeDeselect =
        !state.isEditingFromGlobalScope && isDualScopeAgentPair(state.agentConfigs, agent);
      if (isDualScopeDeselect) {
        return collapseDualScopeAgent(state.selectedAgents, state.agentConfigs, agent);
      }

      const isInheritedGlobalReselect =
        !state.isEditingFromGlobalScope &&
        agentHasGlobalActive(state.agentConfigs, agent) &&
        !agentHasProjectActive(state.agentConfigs, agent) &&
        !state.selectedAgents.includes(agent) &&
        agentHasGlobalTombstone(installed, agent);
      if (isInheritedGlobalReselect) {
        return restoreDualScopeAgent(
          state.selectedAgents,
          state.agentConfigs,
          state._sessionRebuiltScopePairAgents,
          agent,
        );
      }

      // Block a globally-installed agent from being changed at project scope. Mirrors the
      // skill-path guard in toggleTechnology: fire on an active global entry in the snapshot,
      // or on a snapshot tombstone paired with a LIVE plain active global entry (the stale
      // state a persisted `[P][G]` reaches after an in-session collapse). A freshly-added
      // global agent (absent from the snapshot) stays freely deselectable.
      const isActiveGlobal =
        agentHasGlobalActive(installed, agent) ||
        (agentHasGlobalTombstone(installed, agent) &&
          agentHasGlobalActive(state.agentConfigs, agent));
      if (isActiveGlobal && !state.isEditingFromGlobalScope && !state.isInitMode) {
        return { toastMessage: "Global agents cannot be changed from project scope" };
      }

      const isInList = state.selectedAgents.includes(agent);
      const hasExcludedTombstone = state.agentConfigs.some(
        (ac) => ac.name === agent && ac.excluded,
      );
      // An agent is effectively selected only if it's in the list WITHOUT an excluded tombstone.
      // When it has an excluded tombstone, it's visually "off" and toggling means "re-enable".
      const isSelected = isInList && !hasExcludedTombstone;

      // Treat as fresh (clean add/remove, no tombstones) when there is no project overlay:
      //  - init mode without a pre-existing global config, or
      //  - editing FROM global scope (cwd === ~), where the config being edited IS the global
      //    config. A tombstone there is meaningless (nothing to override) and would leave the
      //    agent visually selected while producing a save-path invariant violation, so a
      //    deselect must be a genuine removal (D-233 Scenario C setup).
      const effectiveInstalledConfigs =
        state.isEditingFromGlobalScope || (state.isInitMode && !state.installedAgentConfigs?.length)
          ? null
          : state.installedAgentConfigs;

      const updatedAgentConfigs = applyAgentToggle(
        state.agentConfigs,
        agent,
        isSelected,
        effectiveInstalledConfigs,
      );

      // When toggling off a globally-installed agent, keep it in selectedAgents.
      // It gets an excluded tombstone in agentConfigs but must remain in selectedAgents
      // so SelectedAgentName stays correct for other projects sharing the global config.
      const wasInstalledGlobal =
        effectiveInstalledConfigs?.some((ac) => ac.name === agent && ac.scope === "global") ??
        false;
      const isExcludedToggleOff = isSelected && wasInstalledGlobal;

      return {
        selectedAgents: isExcludedToggleOff
          ? state.selectedAgents
          : isSelected
            ? state.selectedAgents.filter((a) => a !== agent)
            : isInList
              ? state.selectedAgents
              : [...state.selectedAgents, agent],
        agentConfigs: updatedAgentConfigs,
      };
    }),

  toggleAgentScope: (agentName) =>
    set((state) => {
      if (state.isEditingFromGlobalScope) return state;

      const config = state.agentConfigs.find((ac) => ac.name === agentName && !ac.excluded);
      if (!config) return state;

      // Persisted dual-scope pair reopened for edit and UNTOUCHED this session — mirrors
      // toggleSkillScope. Suppressed once the pair has been reconstructed by a store action
      // this session (`_sessionRebuiltScopePairAgents`) so a collapse→`s` rebuild flips P↔G
      // freely. Within-session G↔P round-trips (snapshot still holds an ACTIVE global entry)
      // keep working regardless.
      if (
        !state._sessionRebuiltScopePairAgents.has(agentName) &&
        agentHasGlobalTombstone(state.installedAgentConfigs ?? [], agentName) &&
        isDualScopeAgentPair(state.agentConfigs, agentName)
      ) {
        return { toastMessage: "Installed at both scopes — use space to change project scope" };
      }

      // Counts a global tombstone as "installed globally" (a tombstone means a real global
      // install this project overrides), so an in-session collapse→`s` restores a genuine
      // `[P][G]` pair.
      const wasInstalledGlobally =
        state.installedAgentConfigs?.some((ac) => ac.name === agentName && ac.scope === "global") ??
        false;
      const newScope = config.scope === "project" ? ("global" as const) : ("project" as const);

      let updatedConfigs = state.agentConfigs.map((ac) =>
        ac.name === agentName && !ac.excluded ? { ...ac, scope: newScope } : ac,
      );

      let pairRebuilt = false;
      if (newScope === "project") {
        // Moving global → project: add excluded global entry if not already there.
        // Gated on wasInstalledGlobally so fresh init toggles don't create spurious tombstones.
        if (
          wasInstalledGlobally &&
          !updatedConfigs.some((ac) => ac.name === agentName && ac.excluded)
        ) {
          updatedConfigs = [
            ...updatedConfigs,
            { name: agentName, scope: "global" as const, excluded: true },
          ];
          pairRebuilt = true;
        }
      } else {
        // Moving project → global: always drop any excluded global tombstone for this name.
        // Symmetric with toggleSkillScope — see its comment for the invariant.
        updatedConfigs = updatedConfigs.filter((ac) => !(ac.name === agentName && ac.excluded));
      }

      // Mark a freshly (re)built `[P][G]` pair as session-authored so a subsequent `s` is not
      // blocked by the persisted-pair guard above.
      return pairRebuilt
        ? {
            agentConfigs: updatedConfigs,
            _sessionRebuiltScopePairAgents: new Set([
              ...state._sessionRebuiltScopePairAgents,
              agentName,
            ]),
          }
        : { agentConfigs: updatedConfigs };
    }),

  setFocusedAgentId: (id) => set({ focusedAgentId: id }),

  preselectAgentsFromDomains: () =>
    set((state) => {
      const sorted = state.selectedDomains.flatMap((domain) => DOMAIN_AGENTS[domain] ?? []).sort();
      const merged = sorted.map((name) => buildAgentConfigForName(name, state.agentConfigs));
      // Preserve ALL excluded tombstones so a dual-scope pair (active + tombstone at a
      // different scope) survives preselection — mirrors the skill-side D-223 fix in
      // populateFromSkillIds. Do NOT filter by `!sorted.includes` (D-227).
      const excludedConfigs = collectTombstones(state.agentConfigs);
      return {
        selectedAgents: sorted,
        agentConfigs: [...merged, ...excludedConfigs],
      };
    }),

  preselectAgentsFromStack: (stackAgents) =>
    set((state) => {
      const savedConfigs = state.globalAgentPreselections?.configs ?? [];
      const globalAgents = state.globalAgentPreselections?.agents ?? [];
      const mergedAgents = [...new Set([...stackAgents, ...globalAgents])].sort();
      const merged = mergedAgents.map((name) => buildAgentConfigForName(name, savedConfigs));
      // Preserve dual-scope tombstones, same invariant as preselectAgentsFromDomains (D-227).
      const excludedConfigs = collectTombstones(savedConfigs);
      return {
        selectedAgents: mergedAgents,
        agentConfigs: [...merged, ...excludedConfigs],
      };
    }),

  reset: () => set(createInitialState()),

  getAllSelectedTechnologies: () => {
    return Object.values(get().domainSelections).filter(Boolean).flatMap(flattenCategorySelections);
  },

  getSelectedTechnologiesPerDomain: () => {
    const entries = typedEntries(get().domainSelections)
      .map(([domain, domainSel]) => [domain, flattenCategorySelections(domainSel)] as const)
      .filter(([, techs]) => techs.length > 0);
    return typedFromEntries(entries);
  },

  getCurrentDomain: () => {
    const state = get();
    return state.selectedDomains[state.currentDomainIndex] || null;
  },

  getTechnologyCount: () => {
    return get().getAllSelectedTechnologies().length;
  },

  getStepProgress: () => {
    const state = get();
    const isStackDefaults =
      state.approach === "stack" && !!state.selectedStackId && state.stackAction === "defaults";
    const skippedSteps: WizardStep[] = isStackDefaults ? ["build", "sources", "agents"] : [];
    const precedingSteps = WIZARD_STEP_ORDER.slice(0, WIZARD_STEP_ORDER.indexOf(state.step));
    const completedSteps = precedingSteps.filter((step) => !skippedSteps.includes(step));
    return { completedSteps, skippedSteps };
  },

  canGoToNextDomain: () => {
    const state = get();
    return state.currentDomainIndex < state.selectedDomains.length - 1;
  },

  canGoToPreviousDomain: () => {
    const state = get();
    return state.currentDomainIndex > 0;
  },

  setAllSourcesEject: () => {
    set((state) => ({
      skillConfigs: state.skillConfigs.map((sc) => ({ ...sc, source: EJECT_SOURCE })),
    }));
  },

  setAllSourcesPlugin: () => {
    set((state) => ({
      skillConfigs: state.skillConfigs.map((sc) => {
        const marketplaceSource = getSkillById(sc.id).availableSources?.find(
          (source) => source.type !== "local",
        );
        return marketplaceSource ? { ...sc, source: marketplaceSource.name } : sc;
      }),
    }));
  },

  buildSourceRows: () => {
    const state = get();
    const selectedTechnologies = get().getAllSelectedTechnologies();
    const { skillConfigs, boundSkills } = state;

    // Include inherited global skills (in skillConfigs but not in domainSelections)
    const selectedSet = new Set(selectedTechnologies);
    const inheritedSkillIds = skillConfigs
      .filter((sc) => !sc.excluded && !selectedSet.has(sc.id))
      .map((sc) => sc.id);
    const allActiveIds = new Set([...inheritedSkillIds, ...selectedTechnologies]);
    const excludedGlobalIds = skillConfigs
      .filter((sc) => sc.excluded && sc.scope === "global" && !allActiveIds.has(sc.id))
      .map((sc) => sc.id);
    const allSkillIds = [...inheritedSkillIds, ...selectedTechnologies, ...excludedGlobalIds];

    const rows: SourceRow[] = allSkillIds.flatMap((tech) => {
      const skill = getSkillById(tech);
      const skillId = skill.id;
      const configEntry = skillConfigs.find((sc) => sc.id === skillId);
      const primarySource = skill.availableSources?.find((s) => s.primary)?.name;
      const selectedSource = resolveEffectiveSource(
        configEntry?.source,
        skill.activeSource?.name,
        primarySource,
      );
      const options = buildSkillSourceOptions(skill, selectedSource, boundSkills);
      return classifySkillSourceRows(skillId, options, {
        configEntry,
        installedSkillConfigs: state.installedSkillConfigs,
        isEditingFromGlobalScope: state.isEditingFromGlobalScope,
      });
    });

    // Stable sort: global readOnly first, global editable second, project last.
    // Matches visual grouping in source-grid so navigation indices align with render order.
    rows.sort((a, b) => sourceRowSortTier(a) - sourceRowSortTier(b));

    return rows;
  },
}));

export type HydrateOptions = {
  initialStep?: WizardStep;
  initialDomains?: Domain[];
  initialAgents?: AgentName[];
  installedSkillIds?: SkillId[];
  installedSkillConfigs?: SkillConfig[];
  installedAgentConfigs?: AgentScopeConfig[];
  isEditingFromGlobalScope?: boolean;
};

/**
 * Imperatively hydrates the wizard store before the first render.
 *
 * Must be called BEFORE render(<Wizard ... />) so React captures the correct
 * initial snapshot on the first frame. Running this inside a render-phase hook
 * causes a one-frame flash of the default "stack" step before the jump to the
 * intended step is committed to stdout.
 */
export function hydrateWizardStore(options: HydrateOptions): void {
  useWizardStore.setState(createInitialState());

  const { initialStep } = options;
  const isEditFlow = initialStep !== undefined;
  if (isEditFlow) {
    hydrateForEdit(initialStep, options);
  } else {
    hydrateForInit(options);
  }
}

/** Edit flow: populate from installed skills, then jump straight to the saved step. */
function hydrateForEdit(initialStep: WizardStep, options: HydrateOptions): void {
  const {
    initialDomains,
    initialAgents,
    installedSkillIds,
    installedSkillConfigs,
    installedAgentConfigs,
    isEditingFromGlobalScope,
  } = options;

  if (installedSkillIds?.length) {
    useWizardStore.getState().populateFromSkillIds(installedSkillIds, installedSkillConfigs);
  }

  useWizardStore.setState({
    isInitMode: false,
    // Jump directly to initialStep with empty history. The user is starting
    // fresh at this step — no prior steps to navigate back through.
    step: initialStep,
    history: [],
    approach: "scratch",
    // Saved domains/agents from config override what populateFromSkillIds derived.
    ...(initialDomains?.length ? { selectedDomains: initialDomains, currentDomainIndex: 0 } : {}),
    ...(initialAgents?.length ? { selectedAgents: initialAgents } : {}),
    ...(initialAgents?.length && installedAgentConfigs?.length
      ? { agentConfigs: installedAgentConfigs }
      : {}),
    // Snapshot installed configs for diff rendering in SkillAgentSummary
    ...(installedSkillConfigs?.length || installedAgentConfigs?.length
      ? {
          installedSkillConfigs: installedSkillConfigs ?? null,
          installedAgentConfigs: installedAgentConfigs ?? null,
        }
      : {}),
    ...(isEditingFromGlobalScope ? { isEditingFromGlobalScope: true } : {}),
  });

  useWizardStore.getState().seedFocusedSkillForActiveDomain();
}

/**
 * Init flow: skills are not populated yet — the stack step runs first, so saved
 * selections are stored as preselections for stack-selection.tsx to merge after
 * the stack/scratch choice (selectStack wipes agents).
 */
function hydrateForInit(options: HydrateOptions): void {
  const {
    initialDomains,
    initialAgents,
    installedSkillConfigs,
    installedAgentConfigs,
    isEditingFromGlobalScope,
  } = options;

  useWizardStore.setState({
    isInitMode: true,
    ...(initialDomains?.length ? { selectedDomains: initialDomains, currentDomainIndex: 0 } : {}),
    ...(initialAgents?.length ? { selectedAgents: initialAgents } : {}),
    ...(initialAgents?.length && installedAgentConfigs?.length
      ? { agentConfigs: installedAgentConfigs }
      : {}),
    // Snapshot installed configs for diff rendering in SkillAgentSummary
    ...(installedSkillConfigs?.length || installedAgentConfigs?.length
      ? {
          installedSkillConfigs: installedSkillConfigs ?? null,
          installedAgentConfigs: installedAgentConfigs ?? null,
        }
      : {}),
    ...(isEditingFromGlobalScope ? { isEditingFromGlobalScope: true } : {}),
    ...(installedSkillConfigs?.length ? { globalPreselections: installedSkillConfigs } : {}),
    ...(initialAgents?.length || installedAgentConfigs?.length
      ? {
          globalAgentPreselections: {
            agents: initialAgents ?? [],
            configs: installedAgentConfigs ?? [],
          },
        }
      : {}),
  });

  useWizardStore.getState().seedFocusedSkillForActiveDomain();
}
