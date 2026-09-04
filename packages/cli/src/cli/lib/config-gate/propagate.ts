import fs from "fs";
import { isDeepEqual, unique } from "remeda";
import type {
  AgentDefinition,
  AgentName,
  Category,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillAssignment,
  SkillId,
  StackAgentConfig,
} from "../../types";
import type { AgentScopeConfig, SkillConfig } from "../../types/config";
import { getProjectConfigPath } from "../installation/install-base-dir";
import { loadProjectConfigFromDir } from "../configuration/project-config";
import { mergeConfigs, type AuthoritativeScope } from "../configuration/config-merger";
import {
  activeProjectAgentNames,
  isActiveAt,
  isGlobalTombstone,
  type ScopedEntry,
} from "../configuration/scope-predicates";
import { generateConfigSource, type ConfigSourceOptions } from "../configuration/config-writer";
import {
  buildConfigTypesBackgroundData,
  type ConfigTypesExtras,
  deriveCategories,
  deriveDomains,
  regenerateConfigTypes,
} from "../configuration/config-types-writer";
// The catalogue the renderers take as a parameter. It is the singleton this CLI seats at
// startup, which is what `generateConfigSource` read directly before the renderers moved into
// `@workspace/compile` and the editor became a second caller with a catalogue of its own.
// Inside the fan-out it is the seat `withCatalogueSeatedFor` has put the current project's
// catalogue in, which is why the config half needs no catalogue argument to follow the types
// half onto the right one.
import { matrix as activeMatrix } from "../matrix/matrix-provider";
import { withCatalogueSeatedFor } from "../loading/catalogue-seat.js";
import { fileExists, writeFile } from "../../utils/fs";
import { getErrorMessage } from "../../utils/errors";
import { verbose } from "../../utils/logger";
import { typedEntries, typedKeys } from "../../utils/typed-object";
import { GLOBAL_CONFIG_NAME, LOCAL_PSEUDO_CATEGORY } from "../../consts";

export async function writeConfigFile(
  config: ProjectConfig,
  configPath: string,
  options?: ConfigSourceOptions,
): Promise<void> {
  const source = generateConfigSource(config, activeMatrix, options);
  await writeFile(configPath, source);
}

/**
 * Deep-additive stack merge: appends any (agent, category, skill) triple present in
 * `incoming` but missing in `existing`. Never removes or overwrites existing entries
 * (including their `preloaded` flags). Returns a fresh stack object — inputs are not
 * mutated. `changed` is true iff at least one new agent, category, or skill assignment
 * was appended.
 */
function additiveMergeStack(
  existing: Partial<Record<AgentName, StackAgentConfig>> | undefined,
  incoming: Partial<Record<AgentName, StackAgentConfig>> | undefined,
): { stack: Partial<Record<AgentName, StackAgentConfig>>; changed: boolean } {
  const merged: Partial<Record<AgentName, StackAgentConfig>> = existing
    ? structuredClone(existing)
    : {};
  if (!incoming) return { stack: merged, changed: false };

  let changed = false;
  for (const [agentName, incomingAgentStack] of typedEntries<AgentName, StackAgentConfig>(
    incoming,
  )) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    if (!incomingAgentStack) continue;

    const existingAgentStack = merged[agentName];
    if (!existingAgentStack) {
      merged[agentName] = structuredClone(incomingAgentStack);
      changed = true;
      continue;
    }

    if (mergeAgentCategories(existingAgentStack, incomingAgentStack)) {
      changed = true;
    }
  }

  return { stack: merged, changed };
}

/**
 * Mutates `existingAgentStack` in place by appending any category or skill assignment
 * from `incomingAgentStack` that is not already present. Returns true if anything was
 * appended. Caller must pass a cloned `existingAgentStack` — this function is only
 * called on the merged copy, never on the original input.
 */
function mergeAgentCategories(
  existingAgentStack: StackAgentConfig,
  incomingAgentStack: StackAgentConfig,
): boolean {
  let changed = false;
  for (const [category, incomingAssignments] of typedEntries<Category, SkillAssignment[]>(
    incomingAgentStack,
  )) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    if (!incomingAssignments) continue;

    const existingAssignments = existingAgentStack[category];
    if (!existingAssignments) {
      existingAgentStack[category] = incomingAssignments.map((a) => ({ ...a }));
      changed = true;
      continue;
    }

    const existingIds = new Set(existingAssignments.map((a) => a.id));
    for (const assignment of incomingAssignments) {
      if (!existingIds.has(assignment.id)) {
        existingAssignments.push({ ...assignment });
        existingIds.add(assignment.id);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Merges new global-scoped items into an existing global config.
 * Adds skills/agents that don't already exist. Never removes existing items.
 *
 * Exported for unit testing. See `mergeGlobalConfigs` describe block in
 * `local-installer.test.ts`.
 */
export function mergeGlobalConfigs(
  existing: ProjectConfig,
  incoming: ProjectConfig,
): { config: ProjectConfig; changed: boolean } {
  const existingSkillIds = new Set(existing.skills.map((s) => s.id));
  const existingAgentNames = new Set(existing.agents.map((a) => a.name));

  const incomingActiveSkills = incoming.skills.filter((s) => !s.excluded);
  const incomingActiveAgents = incoming.agents.filter((a) => !a.excluded);
  const newSkills = incomingActiveSkills.filter((s) => !existingSkillIds.has(s.id));
  const newAgents = incomingActiveAgents.filter((a) => !existingAgentNames.has(a.name));

  const mergedSkills = [...existing.skills, ...newSkills];
  const mergedAgents = [...existing.agents, ...newAgents];

  // Per-agent stack merge policy: deep-additive. Project-context edits must NEVER remove
  // or overwrite global state; individual projects express their local view via tombstones
  // in the PROJECT config, not by rewriting the GLOBAL config (see commit 403df46:
  // "never modify global config from project-level operations").
  //
  // Merge rule per triple (agent, category, skill):
  //   - agent absent in existing    -> add from incoming
  //   - category absent in existing -> add from incoming
  //   - skill id absent in existing -> append from incoming
  //   - everything already present  -> keep existing as-is (including its preloaded flag)
  // Anything present only in `existing` is left untouched.
  const { stack: mergedStack, changed: stackChanged } = additiveMergeStack(
    existing.stack,
    incoming.stack,
  );

  // Merge selected domains (union, no duplicates)
  const mergedSelectedDomains = [
    ...new Set([...(existing.selectedDomains ?? []), ...(incoming.selectedDomains ?? [])]),
  ];

  // Marketplace identity (`marketplace`, `marketplaceName`) travels on the global partition of
  // `splitConfigByScope` but was previously lost here, leaving the global config with no
  // record of where its plugins came from. `uninstall` reads `config.marketplaceName` to build
  // the `<id>@<marketplace name>` registry key (getCliInstalledPluginKeys) — without it a global
  // uninstall silently owns nothing and leaves registered plugins behind.
  //
  // Precedence is FILL-ONLY: existing wins, incoming is used solely when the global config
  // has no value yet. Both fields are scalar but the merged config is multi-marketplace by
  // construction — this merge never removes skills, so after a second project init from a
  // different marketplace the skills array holds plugins from BOTH, and whichever label is
  // recorded orphans the other's registry key. Repointing is therefore never a strict
  // improvement, and doing it from a project context would silently rewrite global state on
  // behalf of every other registered project (commit 403df46). This also matches
  // `mergeConfigs`, which preserves `existingConfig.marketplaceName` on the home-root install
  // path. Changing global marketplace identity stays an explicit global-scope operation
  // (`init` run from ~), which writes the global config directly and bypasses this merge.
  const mergedMarketplaceName = existing.marketplaceName ?? incoming.marketplaceName;
  const mergedMarketplace = existing.marketplace ?? incoming.marketplace;

  // Newly-filled marketplace identity must mark the merge dirty: this flag becomes
  // `resolveEffectiveGlobalConfig`'s `changed`, which is the condition `writeFromProjectContext`
  // (lib/config-gate/index.ts) tests before calling `writeGlobalPair`, so a run whose only delta
  // is the now-known marketplace would otherwise skip the global write and drop the field again.
  const changed =
    newSkills.length > 0 ||
    newAgents.length > 0 ||
    stackChanged ||
    !isDeepEqual(existing.selectedDomains ?? [], mergedSelectedDomains) ||
    mergedMarketplaceName !== existing.marketplaceName ||
    mergedMarketplace !== existing.marketplace;

  return {
    config: {
      ...existing,
      skills: mergedSkills,
      agents: mergedAgents,
      stack: mergedStack,
      selectedDomains: mergedSelectedDomains,
      ...(mergedMarketplaceName !== undefined && { marketplaceName: mergedMarketplaceName }),
      ...(mergedMarketplace !== undefined && { marketplace: mergedMarketplace }),
    },
    changed,
  };
}

/**
 * The single normalization for every value compared against the global config's
 * `projects` array — the one written by {@link registerProjectPath}, the one the
 * gate's `deregister-project` mutation filters against, and the current-project
 * skip in {@link propagateGlobalChangesToProjects}. Symlinks are resolved, so an entry
 * stored under one of them matches byte-for-byte under the others. The two ends
 * normalizing differently is what left symlinked layouts (macOS `/tmp`, a
 * `~/dev/repo` pointing at `/data/repo`) registered forever after an uninstall.
 *
 * Throws when the directory does not exist. That is deliberate: a path that
 * cannot be resolved is an error, not a cue to fall back to a weaker
 * normalization — a second tier would reintroduce exactly the asymmetry this
 * helper exists to remove. The one caller that must survive it (`uninstall`'s
 * deregistration) already wraps the call in a warn-and-continue guard.
 */
export function normalizeProjectPath(projectDir: string): string {
  return fs.realpathSync(projectDir);
}

/**
 * Registers a project directory in the global config's `projects` array.
 * Paths are normalized via {@link normalizeProjectPath} to resolve symlinks.
 * Filters stale entries (where .claude-src/config.ts no longer exists).
 */
async function registerProjectPath(
  globalConfig: ProjectConfig,
  projectDir: string,
): Promise<{ config: ProjectConfig; changed: boolean }> {
  const normalizedPath = normalizeProjectPath(projectDir);
  const existing = globalConfig.projects ?? [];

  // Filter stale entries
  const staleChecks = await Promise.all(
    existing.map(async (p) => ({
      path: p,
      hasConfig: await fileExists(getProjectConfigPath(p)),
    })),
  );
  const valid = staleChecks.filter((c) => c.hasConfig).map((c) => c.path);

  if (valid.includes(normalizedPath)) {
    const changed = valid.length !== existing.length;
    return { config: changed ? { ...globalConfig, projects: valid } : globalConfig, changed };
  }

  return { config: { ...globalConfig, projects: [...valid, normalizedPath] }, changed: true };
}

function isProjectScopedEntry(entry: ScopedEntry): boolean {
  return entry.scope === "project";
}

/** True when the global config still has an active (non-excluded) skill for this id. */
function globalHasActiveSkill(globalConfig: ProjectConfig, id: SkillId): boolean {
  return globalConfig.skills.some((s) => s.id === id && isActiveAt(s, "global"));
}

/** True when the global config still has an active (non-excluded) agent for this name. */
function globalHasActiveAgent(globalConfig: ProjectConfig, name: AgentName): boolean {
  return globalConfig.agents.some((a) => a.name === name && isActiveAt(a, "global"));
}

/**
 * Keeps a project's own skill entries when re-inlining fresh global data, dropping
 * tombstones that no longer correspond to a real global install.
 *
 * A tombstone (`scope === "global" && excluded`) only has meaning while the global entry
 * it masks still exists. Once the skill has been removed from the global config, the
 * tombstone is stale — carrying it forward would leave the project showing a masked
 * global item that no longer exists. Project-scoped entries are always retained.
 */
function retainProjectOwnedSkills(
  skills: SkillConfig[],
  globalConfig: ProjectConfig,
): SkillConfig[] {
  return skills.filter(
    (entry) =>
      isProjectScopedEntry(entry) ||
      (isGlobalTombstone(entry) && globalHasActiveSkill(globalConfig, entry.id)),
  );
}

/** Agent mirror of {@link retainProjectOwnedSkills}. */
function retainProjectOwnedAgents(
  agents: AgentScopeConfig[],
  globalConfig: ProjectConfig,
): AgentScopeConfig[] {
  return agents.filter(
    (entry) =>
      isProjectScopedEntry(entry) ||
      (isGlobalTombstone(entry) && globalHasActiveAgent(globalConfig, entry.name)),
  );
}

/**
 * Category a skill belongs to according to the MERGED matrix. `undefined` when the
 * matrix has no entry for the id (a user-authored local skill carries no matrix
 * record) or when the entry sits in the `local` pseudo-category — neither
 * participates in category rules, and neither may throw.
 */
function categoryOfSkill(id: SkillId, matrix: MergedSkillsMatrix): Category | undefined {
  const category = matrix.skills[id]?.category;
  if (category === undefined || category === LOCAL_PSEUDO_CATEGORY) return undefined;
  return category;
}

/**
 * True when the merged matrix DECLARES this category as holding at most one skill.
 * Read from the matrix passed in rather than `defaultCategories` so a source repo's
 * category overrides are honoured.
 *
 * A category the matrix does not declare is deliberately NOT treated as exclusive.
 * The wizard's toggle handler defaults an undeclared one to exclusive
 * (`use-build-step-props.ts` uses `matrix.categories[categoryId]?.exclusive ?? true`),
 * but a rule that MASKS persisted entries must only fire on a flag the data
 * actually carries.
 */
function isExclusiveCategory(category: Category, matrix: MergedSkillsMatrix): boolean {
  return matrix.categories[category]?.exclusive === true;
}

/** Categories occupied by an active project-scoped skill, per the merged matrix. */
function activeProjectCategories(
  projectOwnedSkills: SkillConfig[],
  matrix: MergedSkillsMatrix,
): Set<Category> {
  return new Set(
    projectOwnedSkills
      .filter((s) => isActiveAt(s, "project"))
      .map((s) => categoryOfSkill(s.id, matrix))
      .filter((category): category is Category => category !== undefined),
  );
}

/**
 * The collision that justifies masking a live global skill. Two kinds, both read from the
 * project's OWN entries: IDENTITY — the project owns the same id at project scope; CATEGORY —
 * the project owns a different active skill in the same category and the matrix declares that
 * category exclusive.
 *
 * Shared by the mask producer ({@link maskCollidingGlobalSkills}) and the self-heal that
 * removes a mask once its collision clears ({@link dropOrphanedDerivedMasks}), so the two can
 * never disagree about what a mask means.
 */
function buildProjectCollisionTest(
  projectOwnedSkills: SkillConfig[],
  matrix: MergedSkillsMatrix,
): (id: SkillId) => boolean {
  const ownedIds = new Set(
    projectOwnedSkills.filter((s) => isActiveAt(s, "project")).map((s) => s.id),
  );
  const occupiedExclusiveCategories = new Set(
    [...activeProjectCategories(projectOwnedSkills, matrix)].filter((category) =>
      isExclusiveCategory(category, matrix),
    ),
  );

  return (id) => {
    if (ownedIds.has(id)) return true;
    const category = categoryOfSkill(id, matrix);
    return category !== undefined && occupiedExclusiveCategories.has(category);
  };
}

/**
 * Drops a derived mask that no longer masks anything, so the global install becomes
 * visible again once the collision that produced it is gone.
 *
 * A derived mask and a user-authored tombstone are BYTE-IDENTICAL in config.ts — both are
 * `{ id, scope: "global", excluded: true }` — but the wizard can no longer mint
 * the second kind on its own: a project-scope deselect of a globally-installed skill is
 * refused, and a domain deselect only drops what the project owns. The one user route to a
 * global tombstone is the `s` scope toggle (G→P), which always pairs the tombstone with an
 * active project entry for the same id — an IDENTITY collision. So every bare mask is
 * machine-derived, and a single retention test suffices: keep it iff the collision that
 * would re-derive it is still there.
 */
function dropOrphanedDerivedMasks(
  projectOwnedSkills: SkillConfig[],
  matrix: MergedSkillsMatrix,
): SkillConfig[] {
  const collidesWithProjectOwnership = buildProjectCollisionTest(projectOwnedSkills, matrix);
  return projectOwnedSkills.filter(
    (entry) => !isGlobalTombstone(entry) || collidesWithProjectOwnership(entry.id),
  );
}

/**
 * Agent mirror of {@link dropOrphanedDerivedMasks}, identity collisions only: agents
 * have no categories, so the project-scoped sibling with the same name is the only thing a
 * mask can be justified by.
 */
function dropOrphanedDerivedAgentMasks(projectOwnedAgents: AgentScopeConfig[]): AgentScopeConfig[] {
  const ownedNames = new Set(activeProjectAgentNames(projectOwnedAgents));
  return projectOwnedAgents.filter(
    (entry) => !isGlobalTombstone(entry) || ownedNames.has(entry.name),
  );
}

/**
 * Builds the tombstones that mask live global skills this project cannot show
 * alongside what it already owns at project scope. Two collision kinds, both keyed
 * against the SAME live global config:
 *
 * 1. IDENTITY — the project owns the same id at project scope. Without the
 *    mask, `partitionInlinedConfigEntries` re-inlines the global copy as a SECOND
 *    active entry, leaving one id active at BOTH scopes instead of rendering the
 *    dual-scope `[P][G]` pair.
 * 2. CATEGORY — the project owns a DIFFERENT active skill in the same category and
 *    the matrix declares that category exclusive. Reconciliation keyed on identity
 *    alone cannot see this, so a project owning Vue plus a global install of React
 *    ends up with two active skills in a category that permits one.
 *
 * The project-owned skill wins locally. This is DELIBERATELY ASYMMETRIC with the `s`
 * round trip, where a user-initiated radio swap in `toggleTechnology` refuses to displace a
 * globally-locked skill: there the user is actively trying to drop a shared install,
 * whereas here the collision is PUSHED IN by a global install landing on pre-existing
 * project state. Letting global win would silently uninstall the user's own skill.
 *
 * Tombstones are spread from the global entry so they carry the global install's
 * `origin`. A skill the project merely inherits (no active project-scope entry, no
 * exclusive-category collision) is skipped — it stays a single active global entry.
 * A skill the project already tombstones is skipped so re-running is idempotent.
 */
function maskCollidingGlobalSkills(
  projectOwnedSkills: SkillConfig[],
  globalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): SkillConfig[] {
  const collidesWithProjectOwnership = buildProjectCollisionTest(projectOwnedSkills, matrix);
  const alreadyTombstoned = new Set(projectOwnedSkills.filter(isGlobalTombstone).map((s) => s.id));

  return globalConfig.skills
    .filter(
      (globalEntry) =>
        isActiveAt(globalEntry, "global") &&
        collidesWithProjectOwnership(globalEntry.id) &&
        !alreadyTombstoned.has(globalEntry.id),
    )
    .map((globalEntry) => ({ ...globalEntry, excluded: true }));
}

/**
 * Agent mirror of {@link maskCollidingGlobalSkills}, identity collisions only.
 * Agents have no categories, so there is no grouping dimension to reconcile.
 */
function maskCollidingGlobalAgents(
  projectOwnedAgents: AgentScopeConfig[],
  globalConfig: ProjectConfig,
): AgentScopeConfig[] {
  const ownedNames = new Set(activeProjectAgentNames(projectOwnedAgents));
  const alreadyTombstoned = new Set(
    projectOwnedAgents.filter(isGlobalTombstone).map((a) => a.name),
  );

  return globalConfig.agents
    .filter(
      (globalEntry) =>
        isActiveAt(globalEntry, "global") &&
        ownedNames.has(globalEntry.name) &&
        !alreadyTombstoned.has(globalEntry.name),
    )
    .map((globalEntry) => ({ ...globalEntry, excluded: true }));
}

/**
 * Reconciles a project's OWN entries against the live global config, immediately
 * before the inlining writer merges the two.
 *
 * Applied at BOTH sites that write a project `config.ts` with `globalConfig` inlined:
 * `propagateGlobalChangesToProjects` (a global change fanning out to registered
 * projects) and the project-scope save branch of `writeScopedFromWizard` (an ordinary
 * project `init`/`edit` performed while the colliding skill is already active
 * globally). Either site alone can produce the malformed shape, so both must run it.
 *
 * Self-heal runs BEFORE masking on BOTH axes so a mask whose collision has cleared is
 * removed rather than immediately re-derived, and so masking's `alreadyTombstoned` guard
 * only sees tombstones that are still warranted.
 *
 * Masking is PROJECT-LOCAL: it is applied to the project split only. The global
 * config passed in is read, never rewritten — tombstones never belong in
 * `~/.claude-src/config.ts`.
 */
export function reconcileProjectSplitAgainstGlobal(
  projectSplit: ProjectConfig,
  globalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): ProjectConfig {
  const healedSkills = dropOrphanedDerivedMasks(projectSplit.skills, matrix);
  const healedAgents = dropOrphanedDerivedAgentMasks(projectSplit.agents);
  return {
    ...projectSplit,
    skills: [...healedSkills, ...maskCollidingGlobalSkills(healedSkills, globalConfig, matrix)],
    agents: [...healedAgents, ...maskCollidingGlobalAgents(healedAgents, globalConfig)],
  };
}

/**
 * Computes the skill ids that this project inherited from global scope but that are
 * no longer active at global scope after the change being propagated — and that the
 * project does not own at project scope. These are the only ids that should be pruned
 * from the project's stack: a project-scoped agent may legitimately reference a
 * globally-installed skill, and once that skill is removed at global scope the
 * reference becomes dangling.
 *
 * `priorProjectSkills` is the project's pre-reconciliation (on-disk, inlined) skills.
 * A global skill that was just removed still appears here as a `scope: "global"`,
 * non-excluded entry, which is the signal we key on. Project-scoped skills and
 * user-authored local skills (which carry no SkillConfig entry at all) are never in
 * this set, so they are always preserved.
 */
function computeRemovedGlobalSkillIds(
  priorProjectSkills: SkillConfig[],
  globalConfig: ProjectConfig,
): Set<SkillId> {
  const activeGlobalIds = new Set(
    globalConfig.skills.filter((s) => isActiveAt(s, "global")).map((s) => s.id),
  );
  const projectOwnedIds = new Set(
    priorProjectSkills.filter((s) => isActiveAt(s, "project")).map((s) => s.id),
  );
  return new Set(
    priorProjectSkills
      .filter(
        (s) =>
          s.scope === "global" &&
          !s.excluded &&
          !activeGlobalIds.has(s.id) &&
          !projectOwnedIds.has(s.id),
      )
      .map((s) => s.id),
  );
}

/**
 * Prunes stack references to global skills that were just removed at global scope,
 * so a project-scoped agent stops referencing a skill that no longer exists anywhere.
 * Only ids in `removedGlobalSkillIds` are dropped — every other assignment is kept
 * verbatim, in order, with its `preloaded` flag untouched. Categories and agents left
 * empty by the pruning are removed. When nothing was removed, the stack is returned
 * unchanged so unaffected projects produce byte-identical config output.
 */
function retainReconciledStack(
  stack: Record<string, StackAgentConfig> | undefined,
  removedGlobalSkillIds: Set<SkillId>,
): Record<string, StackAgentConfig> | undefined {
  if (!stack || removedGlobalSkillIds.size === 0) return stack;

  const reconciled: Record<string, StackAgentConfig> = {};
  for (const [agent, agentStack] of Object.entries(stack)) {
    const reconciledAgentStack: StackAgentConfig = {};
    for (const [category, assignments] of typedEntries<Category, SkillAssignment[]>(agentStack)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      if (!assignments) continue;
      const kept = assignments.filter((assignment) => !removedGlobalSkillIds.has(assignment.id));
      if (kept.length > 0) reconciledAgentStack[category] = kept;
    }
    if (typedKeys<Category>(reconciledAgentStack).length > 0) {
      reconciled[agent] = reconciledAgentStack;
    }
  }
  return reconciled;
}

/** The registered projects one fan-out rewrote, and the ones it could not reach. */
export type PropagationResult = {
  updated: string[];
  skipped: string[];
};

export type PropagationOptions = {
  /**
   * Whether each project's config-types.ts is rewritten alongside its config.ts.
   * False for a change that moves no type union — a project inlines the global
   * scalars into its config half, but no union is derived from them.
   */
  regenerateTypes?: boolean;
};

/**
 * The single writer for a project's config pair, used by BOTH sites that emit
 * one: the per-project propagation step below and the project branch of the
 * wizard write.
 *
 * `buildProjectTypesExtras` is fed the EFFECTIVE config — the project's own
 * reconciled rows plus the active global rows the writer is about to inline —
 * at both sites. The emitted config.ts names every one of those rows, so extras
 * derived from the project split alone declare fewer literals than the sibling
 * config.ts uses, and the pair stops type-checking against itself.
 */
export async function writeProjectConfigPair(
  projectDir: string,
  reconciledSplit: ProjectConfig,
  effectiveGlobal: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  options: PropagationOptions = {},
): Promise<void> {
  // Reconcile-before-both-writes: the two halves are derived from the same
  // reconciled data in the same call, so neither can describe a config the other
  // does not.
  await writeConfigFile(reconciledSplit, getProjectConfigPath(projectDir), {
    isProjectConfig: true,
    globalConfig: effectiveGlobal,
  });

  if (options.regenerateTypes === false) return;

  // Uses the same global-aware path for project types — emits
  // `import type { SkillId as GlobalSkillId, ... }` and extends with any
  // project-scoped items the project owns. Without this, a global-scope install
  // would overwrite the project's import-form types with the standalone/inlined
  // form.
  await regenerateConfigTypes(
    projectDir,
    Promise.resolve(buildConfigTypesBackgroundData(matrix, agents)),
    buildProjectTypesExtras(inlinedProjectView(reconciledSplit, effectiveGlobal), matrix),
  );
}

/**
 * The rows the inlining writer draws a project's config.ts from: the project's
 * own reconciled entries plus everything the global config contributes. Union
 * membership is decided downstream by `buildProjectTypesExtras`, which reads the
 * active entries — a tombstone's id always arrives via the live global row it
 * masks.
 */
function inlinedProjectView(
  reconciledSplit: ProjectConfig,
  effectiveGlobal: ProjectConfig,
): ProjectConfig {
  return {
    ...reconciledSplit,
    skills: [...effectiveGlobal.skills, ...reconciledSplit.skills],
    agents: [...effectiveGlobal.agents, ...reconciledSplit.agents],
    selectedDomains: unique([
      ...(effectiveGlobal.selectedDomains ?? []),
      ...(reconciledSplit.selectedDomains ?? []),
    ]),
    stack: { ...(effectiveGlobal.stack ?? {}), ...(reconciledSplit.stack ?? {}) },
  };
}

/**
 * The project's OWN entries, reconciled against the now-current global config — the
 * half the inlining writer is about to merge fresh global data into.
 *
 * Project-scoped entries, plus tombstones that still correspond to a live global
 * install. Tombstones whose global entry has been removed are dropped here so the
 * project stops referencing a global item that no longer exists. The stack is
 * reconciled against the same now-current global data so a project-scoped agent stops
 * referencing a global skill that was just removed at global scope.
 *
 * `onDisk.skills` (pre-reconciliation) is what detects the removed globals, because a
 * skill the global scope just lost is still present there as a `scope: "global"`
 * reference.
 */
function reconcileAgainstGlobal(
  onDisk: ProjectConfig,
  globalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): ProjectConfig {
  const removedGlobalSkillIds = computeRemovedGlobalSkillIds(onDisk.skills, globalConfig);
  const reconciledStack = retainReconciledStack(onDisk.stack, removedGlobalSkillIds);

  return reconcileProjectSplitAgainstGlobal(
    {
      ...onDisk,
      skills: retainProjectOwnedSkills(onDisk.skills, globalConfig),
      agents: retainProjectOwnedAgents(onDisk.agents, globalConfig),
      ...(reconciledStack !== undefined && { stack: reconciledStack }),
    },
    globalConfig,
    matrix,
  );
}

/**
 * Rewrites ONE registered project's pair against the now-current global config.
 * Answers false when the project has a config file the loader returns nothing for,
 * which is the caller's cue to record it as unreached.
 *
 * Every catalogue lookup this makes is against the catalogue
 * {@link withCatalogueSeatedFor} loads for THIS project — its own local skills, and the
 * skills of the marketplace its own config names — rather than the one belonging to the
 * command that triggered the fan-out. Three readers depend on it and none of them can be
 * satisfied by the triggering command's: {@link reconcileAgainstGlobal} decides which of
 * the project's entries survive by their categories, `buildProjectTypesExtras` derives
 * the project's `Category` and `Domain` unions from them, and the config half's writer
 * reads the seated singleton directly. A skill only this project's catalogue carries used
 * to resolve to nothing in all three.
 */
async function propagateToProject(
  projectPath: string,
  globalConfig: ProjectConfig,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  options: PropagationOptions,
): Promise<boolean> {
  return withCatalogueSeatedFor(projectPath, async (catalogue) => {
    const existingProject = await loadProjectConfigFromDir(projectPath);
    if (!existingProject?.config) return false;

    const projectSplit = reconcileAgainstGlobal(existingProject.config, globalConfig, catalogue);

    await writeProjectConfigPair(projectPath, projectSplit, globalConfig, catalogue, agents, {
      regenerateTypes: options.regenerateTypes ?? true,
    });
    return true;
  });
}

/**
 * Propagates global config changes to all registered project configs.
 * Updates each project's config-types.ts (type unions) and config.ts (inlined global data).
 * Skips stale project paths and the current project being installed.
 *
 * There is deliberately NO catalogue parameter. Each project's own is loaded per project by
 * {@link propagateToProject}, and a parameter beside that could only ever be the wrong one —
 * which is what every caller used to pass. A project whose catalogue cannot be loaded lands
 * in `skipped` through the same catch as any other failure: leaving it stale is recoverable
 * by a run from inside it, where rewriting its types from another installation's catalogue
 * is the fight this exists to end.
 */
export async function propagateGlobalChangesToProjects(
  globalConfig: ProjectConfig,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  currentProjectDir?: string,
  options: PropagationOptions = {},
): Promise<PropagationResult> {
  const projects = globalConfig.projects ?? [];
  if (projects.length === 0) return { updated: [], skipped: [] };

  const currentNormalized = currentProjectDir ? normalizeProjectPath(currentProjectDir) : null;
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const projectPath of projects) {
    // Skip the project currently being installed (it's already being written)
    if (currentNormalized && projectPath === currentNormalized) continue;

    const projectConfigPath = getProjectConfigPath(projectPath);
    if (!(await fileExists(projectConfigPath))) {
      skipped.push(projectPath);
      verbose(`Skipped propagation to ${projectPath} (config not found)`);
      continue;
    }

    try {
      if (await propagateToProject(projectPath, globalConfig, agents, options)) {
        updated.push(projectPath);
        verbose(`Propagated global changes to ${projectPath}`);
      } else {
        skipped.push(projectPath);
      }
    } catch (error) {
      skipped.push(projectPath);
      verbose(`Failed to propagate to ${projectPath}: ${getErrorMessage(error)}`);
    }
  }

  return { updated, skipped };
}

/**
 * Prunes CLI-inlined global-scoped entries from every registered project after a
 * GLOBAL uninstall. Reuses {@link propagateGlobalChangesToProjects} with an
 * emptied global config so every global skill/agent reads as removed: project-
 * scoped entries are retained verbatim, inlined global rows and tombstones are
 * dropped, per-agent stack refs lose their global-only ids, and each project's
 * config-types.ts is regenerated.
 *
 * Call AFTER the global .claude-src manifest has been removed so the regenerated
 * project types fall back to the standalone form instead of importing from the
 * now-deleted global config-types.ts. Unreachable project dirs are reported in
 * `skipped`, never thrown.
 *
 * The per-project catalogue seat comes with the reuse, and this is the case that needs it
 * most: the standalone form these projects fall back to declares its unions from the
 * catalogue outright rather than extending an imported one, so a project's own skills are
 * the ONLY thing keeping their categories in the file. Derived from the uninstalling
 * command's catalogue, a global uninstall would take a project's own taxonomy with it.
 */
export async function pruneGlobalEntriesFromRegisteredProjects(
  globalConfig: ProjectConfig,
  agents: Partial<Record<AgentName, AgentDefinition>>,
): Promise<{ updated: string[]; skipped: string[] }> {
  const emptiedGlobal: ProjectConfig = {
    ...globalConfig,
    skills: [],
    agents: [],
  };
  return propagateGlobalChangesToProjects(emptiedGlobal, agents);
}

/** What one resolution decided: the config to commit, and the two flags that gate the write. */
type ResolvedGlobalConfig = { config: ProjectConfig; changed: boolean };

/**
 * Resolves the global config a project install should write, and registers this project's path.
 * `globalDataChanged` gates propagation; `changed` gates the write itself.
 *
 * `authority` is `mergeConfigs`' own word for how much of what it can see the session owns, and
 * it selects between the two resolutions below. Absent, or `"owned"`, keeps the standing
 * additive behaviour.
 */
export async function resolveEffectiveGlobalConfig(
  globalSplit: ProjectConfig,
  existingGlobalConfig: ProjectConfig | undefined,
  projectDir: string,
  authority?: AuthoritativeScope,
): Promise<{ config: ProjectConfig; globalDataChanged: boolean; changed: boolean }> {
  const merged =
    authority === "all"
      ? matchGlobalToSession(globalSplit, existingGlobalConfig)
      : addSessionToGlobal(globalSplit, existingGlobalConfig);

  const registration = await registerProjectPath(merged.config, projectDir);
  return {
    config: registration.config,
    globalDataChanged: merged.changed,
    changed: merged.changed || registration.changed,
  };
}

/**
 * The standing resolution, and the one every caller but `edit --from` gets: the session's global
 * items are ADDED and nothing is taken away.
 *
 * A project install has asked nobody about the machine, so it may not decide for it (commit
 * 403df46, "never modify global config from project-level operations"). The `hasGlobalItems`
 * shortcut is part of that: a session carrying nothing global is not a statement that the global
 * install should be empty.
 */
function addSessionToGlobal(
  globalSplit: ProjectConfig,
  existingGlobalConfig: ProjectConfig | undefined,
): ResolvedGlobalConfig {
  const hasGlobalItems = globalSplit.skills.length > 0 || globalSplit.agents.length > 0;
  if (!hasGlobalItems) {
    return {
      config: existingGlobalConfig ?? { name: GLOBAL_CONFIG_NAME, skills: [], agents: [] },
      changed: false,
    };
  }

  if (!existingGlobalConfig) return { config: globalSplit, changed: true };
  return mergeGlobalConfigs(existingGlobalConfig, globalSplit);
}

/**
 * The resolution for a session that owns every scope it can see: the global config is made to
 * MATCH it, so a global entry the session left out is REMOVED rather than preserved.
 *
 * One caller reaches this — a confirmed `edit --from` — and it is not acting on its own
 * initiative: it states a whole roster, its plan showed every global removal under its own
 * heading, named every other registered project the removal reaches, and somebody answered yes.
 * Nothing else in the CLI may write the global config from a project, and this does not widen
 * that: the word arrives from the command, not from the shape of the data.
 *
 * `mergeConfigs` is what does it rather than a merge of this module's own, because "absent from
 * the session means deselected" is exactly what `authoritativeScope: "all"` already means at the
 * home root. It carries the global installation's identity, its stack fallback and its
 * `projects[]` registry across — a session's split says nothing about who the global
 * installation is or which projects read it, and the fan-out walks that registry.
 *
 * An empty session is a real answer here, so there is no `hasGlobalItems` shortcut: a
 * configuration that installs nothing globally removes what was.
 */
function matchGlobalToSession(
  globalSplit: ProjectConfig,
  existingGlobalConfig: ProjectConfig | undefined,
): ResolvedGlobalConfig {
  if (!existingGlobalConfig) return { config: globalSplit, changed: true };

  const config = mergeConfigs(globalSplit, existingGlobalConfig, { authoritativeScope: "all" });
  return { config, changed: !isDeepEqual(config, existingGlobalConfig) };
}

/** Category keys the emitted stack holds, across every agent it configures. */
function stackCategories(stack: ProjectConfig["stack"]): Category[] {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
  return Object.values(stack ?? {}).flatMap((agentStack) => typedKeys<Category>(agentStack ?? {}));
}

/**
 * Derives the extras for regenerateConfigTypes so a project's config-types.ts declares every
 * literal its sibling config.ts holds — the two are written from the same config and must not
 * be able to disagree.
 *
 * ALL active (non-excluded) entries, not just project-scoped ones:
 * generateProjectConfigWithInlinedGlobal writes the active global rows into the project's own
 * config.ts verbatim, and the imported Global* unions cover those rows only for as long as the
 * global config still happens to contain them. A later global-scope run narrows those unions
 * and a project nobody touched stops type-checking (TS2322 on a skill id or domain, TS2353 on a
 * stack's category key).
 *
 * Domains and stack categories are read off the config's own arrays as well as derived from its
 * skill rows: `selectedDomains` is a wizard preference no skill row has to back, and neither it
 * nor a stack entry is pruned when the last skill that would derive it leaves.
 */
export function buildProjectTypesExtras(
  finalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): Required<ConfigTypesExtras> {
  const activeSkills = finalConfig.skills.filter((s) => !s.excluded);
  const activeAgents = finalConfig.agents.filter((a) => !a.excluded);

  const extraSkillIds = unique(activeSkills.map((s) => s.id));
  const extraAgentNames = unique(activeAgents.map((a) => a.name));

  const extraCategories = unique([
    ...deriveCategories(extraSkillIds, matrix),
    ...stackCategories(finalConfig.stack),
  ]);
  const extraDomains = unique([
    ...deriveDomains(extraCategories, matrix),
    ...(finalConfig.selectedDomains ?? []),
  ]);

  return { extraSkillIds, extraAgentNames, extraDomains, extraCategories };
}
