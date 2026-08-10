import { create } from "zustand";
import {
  DEFAULT_PUBLIC_SOURCE_NAME,
  DEFAULT_SCRATCH_DOMAINS,
  EJECT_SOURCE,
  FALLBACK_DOMAIN,
  INSTALL_MODES,
} from "../consts.js";
import type { InstallMode } from "../lib/installation/index.js";
import { deriveInstallMode as sharedDeriveInstallMode } from "../lib/installation/installation.js";
import type { AgentScopeConfig, SkillConfig, SkillScope } from "../types/config.js";
import {
  isActiveAt,
  isGlobalTombstone,
  isProjectOwned,
} from "../lib/configuration/scope-predicates.js";
import { matrix, getSkillById, getCategoryDomain } from "../lib/matrix/matrix-provider.js";
import { buildCategoriesForDomain, orderDomains, skillSlotKey } from "../lib/wizard/index.js";
import type {
  AgentName,
  Domain,
  DomainSelections,
  SkillId,
  Category,
  CategorySelections,
  ResolvedSkill,
} from "../types/index.js";
import type { SourceOption, SourceRow } from "../components/wizard/source-grid.js";
import { warn } from "../utils/logger.js";
import { typedEntries, typedFromEntries, typedKeys, typedValues } from "../utils/typed-object.js";

/** Toast strings surfaced by scope/selection guards (E2E asserts these verbatim). */
const TOAST_MESSAGES = {
  GLOBAL_SKILLS_LOCKED: "Global skills cannot be changed from project scope",
  ONLY_SKILL_IN_CATEGORY: "Cannot deselect the only skill in this category",
  ALREADY_EJECTED_AT_GLOBAL: "Already exists as ejected skill at global scope",
  GLOBAL_AGENTS_LOCKED: "Global agents cannot be changed from project scope",
} as const;

/** First defined source among candidates, else the default public source. */
function resolveEffectiveSource(...candidates: Array<string | undefined>): string {
  return candidates.find((source) => source !== undefined) ?? DEFAULT_PUBLIC_SOURCE_NAME;
}

/** Name of a skill's primary available source, if any. */
function primarySourceName(skill: ResolvedSkill | undefined): string | undefined {
  return skill?.availableSources?.find((s) => s.primary)?.name;
}

function createDefaultSkillConfig(id: SkillId): SkillConfig {
  const skill = matrix.skills[id];
  const primarySource = primarySourceName(skill);
  return { id, scope: "global", source: primarySource ?? DEFAULT_PUBLIC_SOURCE_NAME };
}

/** True when configs hold an active (non-excluded) project-scope entry for the id. */
function hasProjectActive(configs: SkillConfig[], id: SkillId): boolean {
  return configs.some((sc) => sc.id === id && isActiveAt(sc, "project"));
}

/** The active (non-excluded) global-scope entry for the id, when configs hold one. */
function findGlobalActive(configs: SkillConfig[], id: SkillId): SkillConfig | undefined {
  return configs.find((sc) => sc.id === id && isActiveAt(sc, "global"));
}

/** True when configs hold an active (non-excluded) global-scope entry for the id. */
function hasGlobalActive(configs: SkillConfig[], id: SkillId): boolean {
  return findGlobalActive(configs, id) !== undefined;
}

/** True when configs hold an excluded global-scope tombstone for the id. */
function hasGlobalTombstone(configs: SkillConfig[], id: SkillId): boolean {
  return configs.some((sc) => sc.id === id && isGlobalTombstone(sc));
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
 * True when a SELECTED skill must not be deselected at project scope.
 *
 * The lock protects GLOBAL-OWNED halves and nothing else. Two arms: an active global entry in
 * the hydration snapshot (genuinely global-only — the long-standing read-only behaviour); and a
 * snapshot tombstone paired with a LIVE plain active global entry (the stale state a persisted
 * `[P][G]` reaches after an in-session collapse, whose deselect would silently tombstone the
 * still-real global install).
 *
 * A persisted `[P][G]` pair matches neither: its live global half is a tombstone, and its project
 * half is the project's own install to drop — `applySkillRemoval` collapses the pair to the
 * inherited global entry, so removing it never touches the global install it masks. A skill
 * freshly added this session (absent from the snapshot) is likewise nobody's install yet and
 * stays freely deselectable.
 */
function isGloballyLockedSkill(
  installed: SkillConfig[],
  liveConfigs: SkillConfig[],
  id: SkillId,
): boolean {
  return (
    hasGlobalActive(installed, id) ||
    (hasGlobalTombstone(installed, id) && hasGlobalActive(liveConfigs, id))
  );
}

/**
 * True when an exclusive-category radio swap must not drop this skill at project scope.
 *
 * The deselect lock, plus one case it deliberately allows on its own row: a live `[P][G]` pair.
 * Dropping a pair's project half leaves the global install it masks ACTIVE, so a swap that did it
 * implicitly would seat the new pick beside a still-active sibling in a category that permits one.
 * Removing the pair stays the project's to do — with the selection key on its own row, where
 * nothing takes the freed slot.
 */
function blocksExclusiveSwap(
  installed: SkillConfig[],
  liveConfigs: SkillConfig[],
  id: SkillId,
): boolean {
  return isGloballyLockedSkill(installed, liveConfigs, id) || isDualScopePair(liveConfigs, id);
}

/**
 * True when re-scoping this project-eject entry to global would overwrite an ejected global
 * install that the live config does not already override with a tombstone.
 */
function wouldOverwriteGlobalEject(
  config: SkillConfig,
  liveConfigs: SkillConfig[],
  installedSkillConfigs: SkillConfig[] | null,
): boolean {
  if (config.scope !== "project" || config.source !== EJECT_SOURCE) return false;
  const globalEjectInstalled = installedSkillConfigs?.some(
    (sc) =>
      sc.id === config.id && sc.scope === "global" && sc.source === EJECT_SOURCE && !sc.excluded,
  );
  if (!globalEjectInstalled) return false;
  return !liveConfigs.some((sc) => sc.id === config.id && sc.excluded);
}

/**
 * True when the slot a Sources-step call targets is a global install this session INHERITED —
 * an active global entry the hydration snapshot already carried.
 *
 * Keyed on the `(id, scope)` SLOT, never on the id: an id legitimately occupies slots at both
 * scopes at once, and the project half of a `[P][G]` pair is the project's own install to
 * configure. An id-keyed test would freeze the half the Sources grid deliberately leaves
 * editable.
 *
 * Read off the SNAPSHOT, never off the live entry's scope: a skill this session added at global
 * scope — and every skill in a first `init`, where the snapshot is `null` — is nobody's install
 * yet, so nothing is inherited and every row is the session's own.
 */
function isInheritedGlobalSlot(
  installed: SkillConfig[] | null,
  id: SkillId,
  scope: SkillScope | undefined,
): boolean {
  if (installed === null) return false;
  return scope === "global" && hasGlobalActive(installed, id);
}

/**
 * Rewrites the source of the ACTIVE entry at (id, scope), leaving every other entry untouched —
 * in particular a dual-scope skill's excluded global tombstone, which keeps describing the
 * masked global install (D-262).
 */
function withActiveEntrySource(
  configs: SkillConfig[],
  id: SkillId,
  scope: SkillScope | undefined,
  source: string,
): SkillConfig[] {
  return configs.map((sc) =>
    sc.id === id && !sc.excluded && sc.scope === scope ? { ...sc, source } : sc,
  );
}

/**
 * Removes deselected skills, honouring what the project is allowed to remove (D-277).
 *
 * An entry the project OWNS — project-scoped, or the project's own global tombstone — is
 * dropped. An entry the project merely INHERITS (an active global-scope entry the hydration
 * snapshot already carried) is immutable from project scope and survives BYTE-IDENTICAL: a
 * project edit neither uninstalls a global install nor mints a tombstone for it. A skill this
 * session added itself is absent from the snapshot, is nobody's install yet, and is dropped
 * like any other so an accidental add stays undoable.
 *
 * `installedSkillConfigs` is `null` when editing FROM global scope, where the config being
 * edited IS the global one: nothing is inherited, so every removal is a genuine uninstall
 * (D-233 Scenario C).
 *
 * Dual-scope entries (an active project entry paired with a global tombstone) collapse to a
 * single inherited-global entry so the `[G]` badge keeps rendering after the project half is
 * dropped (D-233 Scenario B).
 */
function applySkillRemoval(
  configs: SkillConfig[],
  removedIds: Iterable<SkillId>,
  installedSkillConfigs: SkillConfig[] | null,
): SkillConfig[] {
  // Annotated because `instanceof Set` narrows an `Iterable<SkillId>` to `Set<any>`,
  // which then spreads out as `any[]` below.
  const removed: ReadonlySet<SkillId> =
    removedIds instanceof Set ? removedIds : new Set(removedIds);
  const installedIds = new Set((installedSkillConfigs ?? []).map((s) => s.id));

  /**
   * A removed entry the project may not drop: a global install that existed before this session
   * and that the project does not own. Dual-scope pairs are excluded — both their halves go, and
   * the surviving global install is re-surfaced as a single inherited entry below.
   */
  const survivesRemoval = (entry: SkillConfig): boolean =>
    !isDualScopePair(configs, entry.id) && !isProjectOwned(entry) && installedIds.has(entry.id);

  const retained = configs.filter((sc) => !removed.has(sc.id) || survivesRemoval(sc));
  const resurfacedInheritedGlobals = [...removed]
    .filter((id) => isDualScopePair(configs, id))
    .map((id) => ({
      id,
      scope: "global" as const,
      source:
        configs.find((sc) => sc.id === id && sc.scope === "global")?.source ??
        DEFAULT_PUBLIC_SOURCE_NAME,
    }));

  return [...retained, ...resurfacedInheritedGlobals];
}

/** All skill IDs across a domain's category selections, in category order. */
function flattenCategorySelections(selections: CategorySelections): SkillId[] {
  return typedValues(selections).flat();
}

/** Collects all skill IDs from a domain's category selections. */
function collectSkillIdsFromSelections(selections: CategorySelections): Set<SkillId> {
  return new Set(flattenCategorySelections(selections));
}

/** Reconciles skill configs after selection changes: drops project-owned removals, leaves inherited global installs untouched, restores excluded on re-select, adds new defaults. */
function reconcileSkillConfigs(
  configs: SkillConfig[],
  added: SkillId[],
  removed: SkillId[],
  installedSkillConfigs: SkillConfig[] | null,
  isEditingFromGlobalScope: boolean,
): SkillConfig[] {
  // Editing from global scope has no project overlay, so a removal is a genuine uninstall.
  // Pass null so applySkillRemoval DROPS the skill rather than retaining it as an inherited
  // global install the project may not touch (D-233 Scenario C).
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
      // Un-excluding drops the tombstone flag rather than setting it to `undefined`:
      // an absent `excluded` is what "not excluded" means everywhere else in the config.
      result = result.map((sc) => {
        if (sc.id !== id || !sc.excluded) return sc;
        const { excluded: _excluded, ...active } = sc;
        return active;
      });
    } else if (!result.some((sc) => sc.id === id)) {
      // Re-selecting a skill that the hydration snapshot still holds is a RESTORE, not a fresh
      // add: it must come back with its persisted scope and source rather than the wizard
      // defaults (a project-scoped eject skill would otherwise round-trip to global+marketplace
      // and trigger a bogus scope/source migration). buildSkillConfigForId degrades to exactly
      // createDefaultSkillConfig's output when the snapshot has no entry, so genuinely-new
      // selections are unaffected.
      result = [...result, buildSkillConfigForId(id, installedSkillConfigs)];
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

/**
 * Applies an agent toggle: deselect removes the agent's entries; select restores an excluded
 * entry or adds a new one.
 *
 * A deselect never masks a globally-installed agent (D-277). Every reachable deselect here is
 * one the project owns — an active global install and a live `[P][G]` pair are both refused
 * upstream in `toggleAgent`, and a global-scope edit owns everything it can see — so the only
 * correct outcome is a clean removal.
 */
function applyAgentToggle(
  configs: AgentScopeConfig[],
  agent: AgentName,
  isSelected: boolean,
): AgentScopeConfig[] {
  if (isSelected) {
    return configs.filter((ac) => ac.name !== agent);
  }

  const existingExcluded = configs.find((ac) => ac.name === agent && ac.excluded);
  if (existingExcluded) {
    return configs.map((ac) => {
      if (ac.name !== agent || !ac.excluded) return ac;
      const { excluded: _excluded, ...active } = ac;
      return active;
    });
  }
  return [...configs, { name: agent, scope: "global" as const }];
}

/**
 * True when an existing agent entry must outlive a domain-roster rebuild, which merges rather than
 * replaces. Two kinds survive:
 *
 * - ALL excluded tombstones, so a dual-scope pair (active entry plus a tombstone at the other
 *   scope) survives preselection — the agent-side mirror of the D-223 fix in
 *   `populateFromSkillIds`. Deliberately NOT filtered by roster membership (D-227).
 * - Every entry the project does not own, so a globally-installed agent outside the selected
 *   domains' roster is never silently uninstalled by a project edit (D-277).
 *
 * Entries the roster itself rebuilds are excluded — `buildAgentConfigForName` re-derives those.
 */
function survivesRosterRebuild(
  agentConfig: AgentScopeConfig,
  roster: ReadonlySet<AgentName>,
): boolean {
  if (agentConfig.excluded) return true;
  return !isProjectOwned(agentConfig) && !roster.has(agentConfig.name);
}

/**
 * D-233: restores the `[P][G]` pair when re-selecting an inherited-global agent row whose
 * global install is recorded as a tombstone in the project snapshot — mirrors
 * reconcileSkillConfigs' restore branch.
 */
function restoreDualScopeAgent(
  selectedAgents: AgentName[],
  agentConfigs: AgentScopeConfig[],
  agent: AgentName,
) {
  return {
    selectedAgents: [...selectedAgents, agent],
    agentConfigs: [
      ...agentConfigs.filter((ac) => ac.name !== agent),
      { name: agent, scope: "project" as const },
      { name: agent, scope: "global" as const, excluded: true },
    ],
  };
}

/**
 * Next selectedAgents after a toggle. A deselect drops the agent; re-enabling a tombstoned
 * agent is already listed; a fresh add appends.
 */
function nextSelectedAgents(
  selectedAgents: AgentName[],
  agent: AgentName,
  flags: { isSelected: boolean; isInList: boolean },
): AgentName[] {
  if (flags.isSelected) return selectedAgents.filter((a) => a !== agent);
  if (flags.isInList) return selectedAgents;
  return [...selectedAgents, agent];
}

/** Builds a SkillConfig for a resolved skill ID, preferring saved config values. */
function buildSkillConfigForId(id: SkillId, savedConfigs?: SkillConfig[] | null): SkillConfig {
  // Prefer project-scoped entry over global when duplicates exist (D-198 defensive fix)
  const saved =
    savedConfigs?.find((sc) => sc.id === id && !sc.excluded && sc.scope === "project") ??
    savedConfigs?.find((sc) => sc.id === id && !sc.excluded);
  const skill = matrix.skills[id];
  const primarySource = primarySourceName(skill);
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
  return {
    name,
    scope: saved?.scope ?? "global",
    // Model and effort are the user's deliberate choice, not something the roster re-derives —
    // they survive the rebuild on the same terms as scope.
    ...(saved?.model !== undefined && { model: saved.model }),
    ...(saved?.effort !== undefined && { effort: saved.effort }),
  };
}

/** Restores skill configs for a domain: clears excluded flags on restored skills, adds new defaults for unknown skills. */
function restoreSkillConfigs(
  existingConfigs: SkillConfig[],
  restoredIds: SkillId[],
): SkillConfig[] {
  const restoredSet = new Set(restoredIds);
  const existingIds = new Set(existingConfigs.map((sc) => sc.id));

  const updated = existingConfigs.map((sc) => {
    if (!restoredSet.has(sc.id) || !sc.excluded) return sc;
    const { excluded: _excluded, ...active } = sc;
    return active;
  });

  const newConfigs = restoredIds.filter((id) => !existingIds.has(id)).map(createDefaultSkillConfig);

  return [...updated, ...newConfigs];
}

/**
 * Built-in agent names grouped by domain prefix. Custom domains return no preselected agents.
 * The consolidated `pm` and `reviewer` are cross-domain by role, so every domain rosters both;
 * the preselection union dedupes when several selected domains bring them.
 */
const DOMAIN_AGENTS: Partial<Record<Domain, AgentName[]>> = {
  web: ["web-developer", "web-researcher", "web-tester", "pm", "reviewer"],
  api: ["api-developer", "api-researcher", "api-tester", "pm", "reviewer"],
  cli: ["cli-developer", "cli-tester", "cli-researcher", "pm", "reviewer"],
  ai: ["ai-developer", "ai-researcher", "ai-tester", "pm", "reviewer"],
};

function resolveSkillForPopulation(
  skillId: SkillId,
): { domain: Domain; subcat: Category; techId: SkillId } | null {
  const { skills } = matrix;
  const skill = skills[skillId];
  if (!skill?.category) {
    warn(
      `Installed skill '${skillId}' is not present in the loaded source — it may have been removed or renamed`,
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

/** The one marketplace a skill can be installed from as a plugin. */
function marketplaceSourceName(skill: ResolvedSkill): string {
  return (
    skill.availableSources?.find((source) => source.type !== "local")?.name ??
    DEFAULT_PUBLIC_SOURCE_NAME
  );
}

/** The `SkillConfig.source` value an install mode writes for this skill. */
function sourceForInstallMode(skill: ResolvedSkill, mode: Exclude<InstallMode, "mixed">): string {
  return mode === "eject" ? EJECT_SOURCE : marketplaceSourceName(skill);
}

/**
 * The install mode a persisted `source` value stands for. The per-skill half of
 * `deriveInstallMode`, which asks the same question of a whole selection: `eject` names the
 * project's own copy and every other value names the marketplace the plugin comes from.
 */
function installModeOfSource(source: string | undefined): Exclude<InstallMode, "mixed"> {
  return source === EJECT_SOURCE ? "eject" : "plugin";
}

/** The two cells of one skill's install-mode control, with the current mode selected. */
function buildInstallModeOptions(selectedMode: Exclude<InstallMode, "mixed">): SourceOption[] {
  return INSTALL_MODES.map((mode) => ({ mode, selected: mode === selectedMode }));
}

/**
 * D-257: the snapshot slots this session has emptied — an `(id, scope)` the hydration snapshot
 * holds ACTIVE that no live config entry occupies any more. The emptying leaves nothing behind to
 * render from: a PROJECT skill is dropped outright (applySkillRemoval leaves no tombstone, unlike
 * the global case), and so is ANY skill deselected while editing from global scope, where
 * `reconcileSkillConfigs` passes `null` so `applySkillRemoval` drops rather than tombstones. In
 * both the snapshot is the only surviving record, so without this set the row would vanish and the
 * user would lose sight of what saving is about to remove. Deliberately ungated on edit context:
 * `computeScopeDiff`, which the confirm step classifies removals with, has no global-scope gate
 * either, so neither surface may have one.
 *
 * Keyed per `(id, scope)` SLOT, mirroring `computeScopeDiff`'s removal match (D-271) — removal is a
 * property of the slot, not of the id. Collapsing a dual-scope `[P][G]` pair to `[G]` empties the
 * PROJECT slot while the global one survives, so the skill renders twice on BOTH surfaces (`-` at
 * Project, `•`/lock at Global) instead of the survivor masking the loss. A tombstone OCCUPIES its
 * slot, so re-activating a masked global install is never a removal. Selection is not consulted:
 * `skillConfigs` is the same input the confirm step diffs, which is what keeps the two agreeing.
 *
 * Snapshot TOMBSTONES are deliberately not removal candidates — narrower than `computeScopeDiff`,
 * whose removal filter counts them. A tombstone is a MASK over a global install, not an install of
 * its own: dropping it deletes nothing (the global copy survives), so a red pending-removal row for
 * one would announce a deletion that never happens. No store transition reaches that shape anyway —
 * every path that drops a tombstone fills the same slot with an active entry (`toggleSkillScope`
 * P→G, `applySkillRemoval`'s dual-scope collapse).
 */
function collectRemovedInstalledEntries(
  installedSkillConfigs: SkillConfig[] | null,
  skillConfigs: SkillConfig[],
): SkillConfig[] {
  if (!installedSkillConfigs) return [];
  const occupiedSlots = new Set(skillConfigs.map((sc) => skillSlotKey(sc.id, sc.scope)));
  return installedSkillConfigs.filter(
    (sc) =>
      !sc.excluded &&
      !occupiedSlots.has(skillSlotKey(sc.id, sc.scope)) &&
      // A skill the marketplace no longer carries has nothing to render — hydration already
      // skipped it into unresolvableSkillIds, and getSkillById would throw on it downstream.
      !!matrix.skills[sc.id],
  );
}

/**
 * D-258: every `(id, scope)` slot the hydration snapshot occupies — the baseline a Sources row is
 * "added" against, and the direct counterpart of `computeScopeDiff`'s `prevSkillKeySet`. Tombstones
 * count as occupied, exactly as that set does (D-232), so re-reading a stored tombstone never flags
 * a spurious addition.
 *
 * A missing snapshot (a first `init`, nothing installed at either scope) collapses to the EMPTY set
 * rather than to a distinct "no baseline" state, because the two are the same answer: an empty
 * baseline occupies no slot, so every row is new — which is what `classifyDiffRow` already tells the
 * confirm step for a null baseline, and what an empty snapshot already told this surface.
 */
function collectInstalledSkillSlots(
  installedSkillConfigs: SkillConfig[] | null,
): ReadonlySet<string> {
  if (!installedSkillConfigs) return new Set();
  return new Set(installedSkillConfigs.map((sc) => skillSlotKey(sc.id, sc.scope)));
}

/**
 * D-258: the `{ added: true }` fragment for a row whose SLOT is new this session, `{}` otherwise —
 * spread into the row so the Sources tab flags it with the info panel's added-diff marker (`+`).
 * Keying on the id alone would miss a skill adopted at project scope while it stays installed
 * globally: the id is old, but the project slot is new — which is exactly how `classifyDiffRow`
 * classifies the same change on the confirm step. Never gated on `isEditingFromGlobalScope`: an
 * addition is an addition regardless of edit context.
 */
function addedSlotFlag(
  installedSkillSlots: ReadonlySet<string>,
  id: SkillId,
  scope: SkillScope | undefined,
): { added?: true } {
  return installedSkillSlots.has(skillSlotKey(id, scope)) ? {} : { added: true };
}

/** Copy of the options with the persisted source's mode selected — for rows pinned to it. */
function withSelectedMode(options: SourceOption[], source: string | undefined): SourceOption[] {
  const mode = installModeOfSource(source);
  return options.map((option) => ({ ...option, selected: option.mode === mode }));
}

/**
 * The per-skill inputs every source row shares: the canonical id, the live config entry driving
 * scope/lock classification, and the source options with the effective source preselected. A
 * pending-removal row re-pins that selection to its persisted source (`withSelectedSource`).
 */
function resolveSkillRowInputs(
  id: SkillId,
  skillConfigs: SkillConfig[],
): { skillId: SkillId; configEntry: SkillConfig | undefined; options: SourceOption[] } {
  const skill = getSkillById(id);
  const configEntry = skillConfigs.find((sc) => sc.id === skill.id);
  const selectedSource = resolveEffectiveSource(
    configEntry?.source,
    skill.activeSource?.name,
    primarySourceName(skill),
  );
  return {
    skillId: skill.id,
    configEntry,
    options: buildInstallModeOptions(installModeOfSource(selectedSource)),
  };
}

type SourceRowContext = {
  configEntry: SkillConfig | undefined;
  installedSkillConfigs: SkillConfig[] | null;
  isEditingFromGlobalScope: boolean;
  /** D-258: `(id, scope)` slots the snapshot occupies — the baseline each row's `+` derives from. */
  installedSkillSlots: ReadonlySet<string>;
};

/**
 * D-257: the inert row for a snapshot slot this session emptied. Carries the PERSISTED scope and
 * source so the row stays visible and shows what saving removes. Deliberately NOT readOnly: that
 * renders a lock, which reads as "installed globally" rather than "about to be removed". Carries no
 * added flag either — the slot it renders comes FROM the snapshot, so it can never be new this
 * session.
 */
function toPendingRemovalRow(
  skillId: SkillId,
  options: SourceOption[],
  removedInstalledEntry: SkillConfig,
): SourceRow {
  return {
    skillId,
    options: withSelectedMode(options, removedInstalledEntry.source),
    scope: removedInstalledEntry.scope,
    disabled: true,
  };
}

/**
 * True when an already-emitted row renders the snapshot entry's `(id, scope)` slot, which makes a
 * pending-removal row for it a duplicate rather than a loss.
 *
 * The one shape that reaches this: a global install adopted at project scope WITHOUT a tombstone
 * (`[G]` snapshot, `[P]` live — the historical no-tombstone dual-scope shape `computeScopeDiff`
 * calls an inherited global). Its global slot is unoccupied in the live config, yet the locked
 * global row already renders it FROM the snapshot, so the install is inherited, not removed.
 */
function isSlotAlreadyRendered(rows: SourceRow[], removedInstalledEntry: SkillConfig): boolean {
  const slot = skillSlotKey(removedInstalledEntry.id, removedInstalledEntry.scope);
  return rows.some((row) => skillSlotKey(row.skillId, row.scope) === slot);
}

/**
 * The locked row for a global install this project may not change from here — the lock reads
 * "installed globally, not yours to edit at project scope". Its source is pinned to the installed
 * one, and its added flag derives from the GLOBAL slot, so an install the project merely inherits
 * stays a plain lock rather than reading as new.
 */
function toLockedGlobalRow(
  skillId: SkillId,
  options: SourceOption[],
  installedSource: string | undefined,
  installedSkillSlots: ReadonlySet<string>,
): SourceRow {
  return {
    skillId,
    options: withSelectedMode(options, installedSource),
    scope: "global" as const,
    readOnly: true,
    ...addedSlotFlag(installedSkillSlots, skillId, "global"),
  };
}

/**
 * Classifies one skill's LIVE config entry into its source-grid rows: a locked global row for
 * excluded-global entries, locked global + editable project rows for skills re-scoped
 * global→project this session, or a single row otherwise. Pending-removal rows are not derived
 * here — they belong to snapshot slots with no live entry left (see `toPendingRemovalRow`).
 */
function classifySkillSourceRows(
  skillId: SkillId,
  options: SourceOption[],
  context: SourceRowContext,
): SourceRow[] {
  const { configEntry, installedSkillConfigs, isEditingFromGlobalScope, installedSkillSlots } =
    context;
  const installedGlobalConfig = findGlobalActive(installedSkillConfigs ?? [], skillId);

  const isExcludedGlobal = configEntry?.excluded && configEntry.scope === "global";
  if (isExcludedGlobal && !isEditingFromGlobalScope) {
    return [
      toLockedGlobalRow(
        skillId,
        options,
        installedGlobalConfig?.source ?? configEntry.source,
        installedSkillSlots,
      ),
    ];
  }

  if (!isEditingFromGlobalScope && installedGlobalConfig && configEntry?.scope === "project") {
    // Skill toggled from global to project — emit locked global copy + editable project copy. Each
    // half derives its own added flag from its own slot, so the `+` lands on the newly occupied
    // PROJECT row while the still-installed global row stays a plain lock.
    return [
      toLockedGlobalRow(skillId, options, installedGlobalConfig.source, installedSkillSlots),
      {
        skillId,
        options,
        scope: "project" as const,
        ...addedSlotFlag(installedSkillSlots, skillId, "project"),
      },
    ];
  }

  const readOnly = !isEditingFromGlobalScope && !!installedGlobalConfig;
  return [
    {
      skillId,
      options,
      ...(configEntry?.scope !== undefined && { scope: configEntry.scope }),
      ...(readOnly ? { readOnly: true as const } : {}),
      ...addedSlotFlag(installedSkillSlots, skillId, configEntry?.scope),
    },
  ];
}

/**
 * Visual grouping order in source-grid: global readOnly, global editable, then project. A
 * pending-removal (disabled) row is NOT a separate tier — it sorts by its own scope so it renders
 * inline with the other rows of that scope, matching the info panel, which shows removals in place
 * rather than in a dedicated section. Its trailing position within a scope section falls out of the
 * removal rows being appended after every live row, which the stable sort preserves.
 */
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

/** How the user builds their config: from a pre-built stack, or skill-by-skill. */
type WizardApproach = "stack" | "scratch";

/** For the stack approach: use the stack's defaults, or customize its skills. */
type StackAction = "defaults" | "customize";

export const WIZARD_STEP_ORDER = [
  "stack",
  "domains",
  "build",
  "sources",
  "agents",
  "confirm",
] as const satisfies readonly WizardStep[];

/** Whether the loaded source offers any stack to choose between. */
function offersStacks(): boolean {
  return matrix.suggestedStacks.length > 0;
}

/**
 * The steps this session's wizard actually runs, in order.
 *
 * `WIZARD_STEP_ORDER` is every step the wizard has; this is the ones it has
 * THIS time. The stack step exists only where there is a stack to choose, so a
 * source that ships none — the built-in catalogue standing in for the default
 * public marketplace alone — drops it: hydration opens past it (see
 * {@link FIRST_STEP_WITHOUT_STACKS}) and the tab bar is drawn without it. One
 * answer to "does this run have a stack step", so the tabs cannot advertise a
 * step the flow does not have.
 */
export function getActiveStepFlow(): WizardStep[] {
  if (offersStacks()) return [...WIZARD_STEP_ORDER];
  return WIZARD_STEP_ORDER.filter((step) => step !== "stack");
}

/** The flow's steps before the active one; none when the step is outside the flow. */
function stepsBefore(flow: WizardStep[], step: WizardStep): WizardStep[] {
  const index = flow.indexOf(step);
  return index < 0 ? [] : flow.slice(0, index);
}

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

  approach: WizardApproach | null;
  selectedStackId: string | null;
  stackAction: StackAction | null;

  selectedDomains: Domain[];

  currentDomainIndex: number;
  domainSelections: DomainSelections;
  /** Snapshot of stack-provided domain selections for restoration on domain re-toggle */
  _stackDomainSelections: DomainSelections | null;

  showLabels: boolean;

  skillConfigs: SkillConfig[];
  focusedSkillId: SkillId | null;

  /**
   * Skill ids from the saved config that could NOT be resolved against the currently-loaded
   * source matrix this session (`populateFromSkillIds` skipped them, warning per skill). The
   * wizard cannot represent them, so they are absent from its result and the merge removes them
   * like any other absent entry — this list is what lets `edit` name each one and say why it went
   * rather than dropping it in silence (CLI-450).
   */
  unresolvableSkillIds: SkillId[];

  showInfo: boolean;

  selectedAgents: AgentName[];
  agentConfigs: AgentScopeConfig[];
  focusedAgentId: AgentName | null;

  /** Snapshot of configs that were installed before the wizard opened, used for diff rendering */
  installedSkillConfigs: SkillConfig[] | null;
  installedAgentConfigs: AgentScopeConfig[] | null;

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
  setApproach: (approach: WizardApproach | null) => void;
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
  setStackAction: (action: StackAction) => void;
  /**
   * Prepare a build with no stack behind it — what "Start from scratch" means.
   *
   * Two surfaces arrive here and must agree on what it is: the stack step's
   * scratch row, and the hydration that opens the wizard past a stack step the
   * loaded source gave nothing to show on.
   *
   * Side effects: clears every stack-derived selection (via `selectStack(null)`),
   * sets `approach` to "scratch", restores `selectedAgents` / `agentConfigs` from
   * `globalAgentPreselections`, populates selections from `globalPreselections`,
   * and selects the scratch domains. Does NOT navigate — the caller owns the step.
   */
  startFromScratch: () => void;
  /**
   * Pre-populate domainSelections from a flat list of installed skill IDs.
   *
   * Used by `npx agents-inc edit` to restore wizard state from existing project config.
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
   * Set how a specific skill is installed: the project's own copy, or the marketplace plugin.
   * @param skillId - Skill to configure the install mode for
   * @param mode - `eject` for a local copy, `plugin` for the one marketplace
   * @param scope - Acting scope from the Sources row: only the active entry at this scope is
   *   updated; a masked global tombstone for the same id keeps its source.
   *
   * Refuses a project-context call that targets a global slot the hydration snapshot already
   * owns ({@link isInheritedGlobalSlot}) — a project edit may not change how a global install is
   * installed, the same authority the Sources grid enforces by rendering that row inert.
   *
   * Side effects: updates the active `skillConfigs` entry for the skill at `scope`, writing the
   * `source` value the mode resolves to. No-op with a warning on an empty skill id; silent no-op
   * on a refused global slot.
   */
  setInstallMode: (
    skillId: SkillId,
    mode: Exclude<InstallMode, "mixed">,
    scope: SkillScope | undefined,
  ) => void;
  /** Toggle the info overlay (selected skills and agents). */
  toggleInfo: () => void;
  /** Set a temporary toast message, or null to clear it. */
  setToastMessage: (message: string | null) => void;
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
   * The from-scratch path only: with a stack chosen, its declared roster stands and
   * this is a no-op. Selecting a stack is the statement of which sub-agents an
   * installation gets, and the user edits that roster in the agents step.
   *
   * Side effects: replaces `selectedAgents` with computed preselection, unless a
   * stack is selected
   */
  preselectAgentsFromDomains: () => void;
  /**
   * Preselect agents for a chosen stack: merges the stack's agent keys with global
   * agent preselections, preserving dual-scope tombstones. Parallels
   * populateFromSkillIds on the skill path.
   *
   * This is the roster the install gets — nothing downstream re-derives it.
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
   * Used by WizardTabs to render step progress indicators. Both lists are read
   * against {@link getActiveStepFlow} — a step this run never has cannot be one
   * it completed.
   * @returns Object with completedSteps and skippedSteps string arrays
   */
  getStepProgress: () => { completedSteps: WizardStep[]; skippedSteps: WizardStep[] };
  /** @returns true if there is a next domain after the current one */
  canGoToNextDomain: () => boolean;
  /** @returns true if there is a previous domain before the current one */
  canGoToPreviousDomain: () => boolean;

  /**
   * Build the source selection rows for the sources step UI.
   *
   * For each selected technology, resolves the canonical skill ID and marks which of the two
   * install modes its persisted `source` stands for.
   *
   * @returns Array of row objects, one per selected technology, each containing:
   *   - `skillId` - Canonical resolved skill ID
   *   - `options` - The two install-mode cells, with the current one selected
   */
  buildSourceRows: () => SourceRow[];
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
  | "skillConfigs"
  | "focusedSkillId"
  | "unresolvableSkillIds"
  | "showInfo"
  | "selectedAgents"
  | "agentConfigs"
  | "focusedAgentId"
  | "installedSkillConfigs"
  | "installedAgentConfigs"
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
  /** Snapshot of domainSelections from populateFromSkillIds, used to restore on domain re-toggle */
  _stackDomainSelections: null,
  showLabels: false,
  skillConfigs: [],
  focusedSkillId: null,
  unresolvableSkillIds: [],
  showInfo: false,
  selectedAgents: [],
  agentConfigs: [],
  focusedAgentId: null,
  installedSkillConfigs: null,
  installedAgentConfigs: null,
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
      currentDomainIndex: 0,
      stackAction: null,
    }),

  setStackAction: (action) => set({ stackAction: action }),

  startFromScratch: () => {
    // selectStack(null) wipes the agent selections along with the stack's, so the
    // global ones are put back rather than left as collateral.
    get().selectStack(null);
    get().setApproach("scratch");

    const { globalAgentPreselections, globalPreselections } = get();
    if (globalAgentPreselections) {
      set({
        selectedAgents: globalAgentPreselections.agents,
        agentConfigs: globalAgentPreselections.configs,
      });
    }
    if (globalPreselections?.length) {
      get().populateFromSkillIds(
        globalPreselections.map((skill) => skill.id),
        globalPreselections,
      );
    }

    // Additive: a scratch domain the preselections already brought stays on.
    for (const domain of DEFAULT_SCRATCH_DOMAINS) {
      if (!get().selectedDomains.includes(domain)) get().toggleDomain(domain);
    }
  },

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

      const selectedDomains = orderDomains(typedKeys<Domain>(domainSelections));

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
          selectedDomains: orderDomains([...state.selectedDomains, domain]),
          domainSelections: {
            ...state.domainSelections,
            [domain]: structuredClone(stackSelections),
          },
          skillConfigs: restoreSkillConfigs(state.skillConfigs, restoredSkillIds),
        };
      }

      return {
        selectedDomains: orderDomains([...state.selectedDomains, domain]),
      };
    }),

  toggleTechnology: (domain, category, technology, exclusive) =>
    set((state) => {
      const installed = state.installedSkillConfigs ?? [];
      const currentSelections = state.domainSelections[domain]?.[category] || [];
      const isSelected = currentSelections.includes(technology);

      // Block a GLOBAL-OWNED entry from being changed at project scope. On a SELECT only the
      // active-global arm applies (an inherited-global row is read-only in both directions); the
      // stale-collapse arm is a deselect guard, kept behind isSelected so the re-select restore
      // path (reconcileSkillConfigs rebuilds `[P][G]`) still runs. The project half of a
      // persisted `[P][G]` pair is project-owned and passes both ways.
      const isGlobalLocked = isSelected
        ? isGloballyLockedSkill(installed, state.skillConfigs, technology)
        : hasGlobalActive(installed, technology);
      if (isGlobalLocked && !state.isEditingFromGlobalScope) {
        return { toastMessage: TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED };
      }

      if (isSelected) {
        const categoryDef = matrix.categories[category];
        if (categoryDef?.exclusive && categoryDef.required) {
          const categorySkillCount = typedValues(matrix.skills).filter(
            (s) => s.category === category,
          ).length;
          if (categorySkillCount <= 1) {
            return { toastMessage: TOAST_MESSAGES.ONLY_SKILL_IN_CATEGORY };
          }
        }
      }

      // In exclusive mode, selecting a new skill replaces the current one. Block if that would
      // implicitly drop a skill this scope may not drop THIS WAY: a radio swap must never
      // tombstone a global install, and never unmask one either.
      if (exclusive && !isSelected) {
        const wouldDropLockedSkill = currentSelections.some((selectedId) =>
          blocksExclusiveSwap(installed, state.skillConfigs, selectedId),
        );
        if (wouldDropLockedSkill && !state.isEditingFromGlobalScope) {
          return { toastMessage: TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED };
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

      return {
        skillConfigs,
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

  deriveInstallMode: (): InstallMode => {
    const { skillConfigs } = get();
    return sharedDeriveInstallMode(skillConfigs);
  },

  toggleSkillScope: (skillId) =>
    set((state) => {
      if (state.isEditingFromGlobalScope) return state;

      const config = state.skillConfigs.find((sc) => sc.id === skillId && !sc.excluded);
      if (!config) return state;

      // Guard: block project eject → global when global eject already exists (would overwrite)
      if (wouldOverwriteGlobalEject(config, state.skillConfigs, state.installedSkillConfigs)) {
        return { toastMessage: TOAST_MESSAGES.ALREADY_EJECTED_AT_GLOBAL };
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
      const newScope = config.scope === "project" ? ("global" as const) : ("project" as const);

      const rescoped = state.skillConfigs.map((sc) =>
        sc.id === skillId && !sc.excluded ? { ...sc, scope: newScope } : sc,
      );

      if (newScope === "project") {
        // Moving global → project: add the excluded global tombstone if not already there.
        // Gated on wasInstalledGlobally so fresh init toggles don't create spurious tombstones.
        const needsTombstone =
          wasInstalledGlobally && !rescoped.some((sc) => sc.id === skillId && sc.excluded);
        return {
          skillConfigs: needsTombstone
            ? [
                ...rescoped,
                { id: skillId, scope: "global" as const, excluded: true, source: config.source },
              ]
            : rescoped,
        };
      }

      // Moving project → global: always drop any excluded global tombstone for this id.
      // An active entry at global scope supersedes any tombstone at the same scope — the
      // invariant "no active + tombstone at the same (id, scope)" must hold. Unconditional
      // removal (not gated on wasInstalledGlobally) heals the D-224 case where the prior
      // G→P produced a tombstone that installedSkillConfigs-derived wasInstalledGlobally
      // cannot see (because its `!sc.excluded` filter ignores the tombstone itself).
      return { skillConfigs: rescoped.filter((sc) => !(sc.id === skillId && sc.excluded)) };
    }),

  setFocusedSkillId: (id) => set({ focusedSkillId: id }),

  seedFocusedSkillForActiveDomain: () => {
    const state = get();
    // Mirror the build-step renderer's domain fallback (use-build-step-props.ts):
    // when no domain is selected the grid still renders FALLBACK_DOMAIN and
    // highlights a cell, so the seed must resolve that same domain — never null
    // while a cell is visibly focused — or the cold `s` toggle no-ops on a desync.
    const domain = state.getCurrentDomain() ?? FALLBACK_DOMAIN;
    const categories = buildCategoriesForDomain(
      domain,
      state.getAllSelectedTechnologies(),
      undefined,
      state.skillConfigs,
    );
    set({ focusedSkillId: categories[0]?.options[0]?.id ?? null });
  },

  setInstallMode: (skillId, mode, scope) =>
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- SkillId is a string union with no empty member, so the type rules this out; the guard is for a runtime caller handing over an empty id
      if (!skillId) {
        warn("Ignoring setInstallMode call with empty skillId");
        return state;
      }
      // Block a GLOBAL-OWNED slot from being reconfigured at project scope — the authority the
      // Sources grid already enforces by rendering that row inert, held here so it does not rest
      // on the UI alone. Silent: the grid never offers the row, so a refused call is a caller
      // reaching past it.
      if (
        isInheritedGlobalSlot(state.installedSkillConfigs, skillId, scope) &&
        !state.isEditingFromGlobalScope
      ) {
        return state;
      }
      const source = sourceForInstallMode(getSkillById(skillId), mode);
      return {
        skillConfigs: withActiveEntrySource(state.skillConfigs, skillId, scope, source),
      };
    }),

  toggleInfo: () => set((state) => ({ showInfo: !state.showInfo })),

  setToastMessage: (message) => set({ toastMessage: message }),

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

      // A live dual-scope `[P][G]` row is locked to `s`: the selection key is inert on it and
      // emits the same global-locked toast an inherited-global row shows. Mirrors the skill-side
      // dual-scope arm in toggleTechnology — `s` alone collapses and restores the pair.
      const isDualScopePairRow =
        !state.isEditingFromGlobalScope && isDualScopeAgentPair(state.agentConfigs, agent);
      if (isDualScopePairRow) {
        return { toastMessage: TOAST_MESSAGES.GLOBAL_AGENTS_LOCKED };
      }

      const isInheritedGlobalReselect =
        !state.isEditingFromGlobalScope &&
        agentHasGlobalActive(state.agentConfigs, agent) &&
        !agentHasProjectActive(state.agentConfigs, agent) &&
        !state.selectedAgents.includes(agent) &&
        agentHasGlobalTombstone(installed, agent);
      if (isInheritedGlobalReselect) {
        return restoreDualScopeAgent(state.selectedAgents, state.agentConfigs, agent);
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
      if (isActiveGlobal && !state.isEditingFromGlobalScope) {
        return { toastMessage: TOAST_MESSAGES.GLOBAL_AGENTS_LOCKED };
      }

      const isInList = state.selectedAgents.includes(agent);
      const hasExcludedTombstone = state.agentConfigs.some(
        (ac) => ac.name === agent && ac.excluded,
      );
      // An agent is effectively selected only if it's in the list WITHOUT an excluded tombstone.
      // When it has an excluded tombstone, it's visually "off" and toggling means "re-enable".
      const isSelected = isInList && !hasExcludedTombstone;

      return {
        selectedAgents: nextSelectedAgents(state.selectedAgents, agent, { isSelected, isInList }),
        agentConfigs: applyAgentToggle(state.agentConfigs, agent, isSelected),
      };
    }),

  toggleAgentScope: (agentName) =>
    set((state) => {
      if (state.isEditingFromGlobalScope) return state;

      const config = state.agentConfigs.find((ac) => ac.name === agentName && !ac.excluded);
      if (!config) return state;

      // Counts a global tombstone as "installed globally" (a tombstone means a real global
      // install this project overrides), so an in-session collapse→`s` restores a genuine
      // `[P][G]` pair.
      const wasInstalledGlobally =
        state.installedAgentConfigs?.some((ac) => ac.name === agentName && ac.scope === "global") ??
        false;
      const newScope = config.scope === "project" ? ("global" as const) : ("project" as const);

      const rescoped = state.agentConfigs.map((ac) =>
        ac.name === agentName && !ac.excluded ? { ...ac, scope: newScope } : ac,
      );

      if (newScope === "project") {
        // Moving global → project: add the excluded global tombstone if not already there.
        // Gated on wasInstalledGlobally so fresh init toggles don't create spurious tombstones.
        const needsTombstone =
          wasInstalledGlobally && !rescoped.some((ac) => ac.name === agentName && ac.excluded);
        return {
          agentConfigs: needsTombstone
            ? [...rescoped, { name: agentName, scope: "global" as const, excluded: true }]
            : rescoped,
        };
      }

      // Moving project → global: always drop any excluded global tombstone for this name.
      // Symmetric with toggleSkillScope — see its comment for the invariant.
      return { agentConfigs: rescoped.filter((ac) => !(ac.name === agentName && ac.excluded)) };
    }),

  setFocusedAgentId: (id) => set({ focusedAgentId: id }),

  preselectAgentsFromDomains: () =>
    set((state) => {
      // A stack declares its own roster, and that declaration is the whole of what
      // choosing it means. Deriving one from the domains would run later in the step
      // order and overwrite it, so the from-scratch path stops here.
      if (state.selectedStackId) return state;

      // Deduped: several selected domains each roster the shared `reviewer`.
      const sorted = [
        ...new Set(state.selectedDomains.flatMap((domain) => DOMAIN_AGENTS[domain] ?? [])),
      ].sort();
      const roster = new Set(sorted);
      const merged = sorted.map((name) => buildAgentConfigForName(name, state.agentConfigs));
      const retained = state.agentConfigs.filter((ac) => survivesRosterRebuild(ac, roster));
      return {
        selectedAgents: sorted,
        agentConfigs: [...merged, ...retained],
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
    return typedValues(get().domainSelections).flatMap(flattenCategorySelections);
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
    const precedingSteps = stepsBefore(getActiveStepFlow(), state.step);
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

  buildSourceRows: () => {
    const state = get();
    const selectedTechnologies = get().getAllSelectedTechnologies();
    const { skillConfigs } = state;

    // Include inherited global skills (in skillConfigs but not in domainSelections)
    const selectedSet = new Set(selectedTechnologies);
    const inheritedSkillIds = skillConfigs
      .filter((sc) => !sc.excluded && !selectedSet.has(sc.id))
      .map((sc) => sc.id);
    const allActiveIds = new Set([...inheritedSkillIds, ...selectedTechnologies]);
    const excludedGlobalIds = skillConfigs
      .filter((sc) => isGlobalTombstone(sc) && !allActiveIds.has(sc.id))
      .map((sc) => sc.id);
    // Every skill with a LIVE config entry or selection. Internally disjoint by construction, so no
    // skill contributes live rows twice.
    const liveSkillIds = [...inheritedSkillIds, ...selectedTechnologies, ...excludedGlobalIds];
    // D-258: the slot baseline additions are measured against. Each emitted row checks its OWN
    // `(id, scope)` slot, so a skill adopted at a second scope registers as added on the newly
    // occupied row alone — the same classification the confirm step's computeScopeDiff makes.
    const installedSkillSlots = collectInstalledSkillSlots(state.installedSkillConfigs);
    const resolveRowInputs = (id: SkillId) => resolveSkillRowInputs(id, skillConfigs);

    const liveRows: SourceRow[] = liveSkillIds.flatMap((id) => {
      const { skillId, configEntry, options } = resolveRowInputs(id);
      return classifySkillSourceRows(skillId, options, {
        configEntry,
        installedSkillConfigs: state.installedSkillConfigs,
        isEditingFromGlobalScope: state.isEditingFromGlobalScope,
        installedSkillSlots,
      });
    });

    // D-257/D-271: slots the session emptied. A skill may appear in BOTH lists — a collapsed
    // dual-scope pair keeps its surviving global row and gains a project pending-removal row — so
    // rows are no longer disjoint per SKILL. They stay disjoint per `(id, scope)` SLOT: a snapshot
    // slot a live row already renders never gets a removal row on top of it.
    const pendingRemovalRows: SourceRow[] = collectRemovedInstalledEntries(
      state.installedSkillConfigs,
      skillConfigs,
    )
      .filter((entry) => !isSlotAlreadyRendered(liveRows, entry))
      .map((entry) => {
        const { skillId, options } = resolveRowInputs(entry.id);
        return toPendingRemovalRow(skillId, options, entry);
      });

    // Stable sort by scope tier: global readOnly, global editable, then project. Pending-removal
    // rows carry no dedicated tier — they sort by their own scope and, being appended last, trail
    // inline within that scope section. Matches source-grid grouping so navigation indices align
    // with render order.
    const rows = [...liveRows, ...pendingRemovalRows];
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

/** Where an init opens when the loaded source offers no stack to choose. */
const FIRST_STEP_WITHOUT_STACKS: WizardStep = "domains";

/**
 * Init flow: skills are not populated yet — the stack step runs first, so saved
 * selections are stored as preselections for stack-selection.tsx to merge after
 * the stack/scratch choice (selectStack wipes agents).
 *
 * Unless the loaded source offers no stacks at all — a custom marketplace that
 * ships none, since the built-in catalogue stands in for the default public
 * marketplace alone. That step would then hold nothing but its own "Start from
 * scratch" row, so the wizard opens where that row leads, having done what
 * pressing it does.
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

  if (!offersStacks()) {
    useWizardStore.getState().startFromScratch();
    // Nothing behind this step: the stack step it would have been pushed onto
    // never rendered, so the history it would have gone into stays empty.
    useWizardStore.setState({ step: FIRST_STEP_WITHOUT_STACKS, history: [] });
  }

  useWizardStore.getState().seedFocusedSkillForActiveDomain();
}
