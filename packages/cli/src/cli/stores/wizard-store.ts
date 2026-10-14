import { create } from "zustand";
import {
  CLI_INVOKE_COMMAND,
  DEFAULT_PUBLIC_SOURCE_NAME,
  DEFAULT_SCRATCH_DOMAINS,
  EJECT_SOURCE,
  FALLBACK_DOMAIN,
  INSTALL_MODES,
  SKILL_CATEGORIES_PATH,
} from "../consts.js";
import type { InstallMode } from "../lib/installation/index.js";
import { deriveInstallMode as sharedDeriveInstallMode } from "../lib/installation/installation.js";
import type { AgentScopeConfig, SkillConfig, SkillScope } from "../types/config.js";
import {
  isActiveAt,
  isGlobalTombstone,
  isProjectOwned,
} from "../lib/configuration/scope-predicates.js";
import { isLocalOnlySkill } from "../lib/loading/multi-source-loader.js";
import { matrix, getSkillById, getCategoryDomain } from "../lib/matrix/matrix-provider.js";
import {
  agentSlotKey,
  buildCategoriesForDomain,
  firstFocusableAgent,
  orderDomains,
  skillSlotKey,
} from "../lib/wizard/index.js";
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
import { disableBuffering, drainBuffer, enableBuffering, warn } from "../utils/logger.js";
import { typedEntries, typedFromEntries, typedKeys, typedValues } from "../utils/typed-object.js";

const LOCAL_ONLY_INSTALL_MODES = ["eject"] as const satisfies readonly Exclude<
  InstallMode,
  "mixed"
>[];

/** Toast strings surfaced by scope/selection guards (E2E asserts these verbatim). */
const TOAST_MESSAGES = {
  GLOBAL_SKILLS_LOCKED: "Global skills cannot be changed from project scope",
  ALREADY_EJECTED_AT_GLOBAL: "Already exists as ejected skill at global scope",
  GLOBAL_AGENTS_LOCKED: "Global agents cannot be changed from project scope",
} as const;

/**
 * One line: `Toast` paints a single row inside a frame sized to the terminal, so a longer message
 * would wrap and break it. `unresolvableSkillIds` still carries every id for `edit` to name.
 */
function skillsLeftOutToast(count: number): string {
  return count === 1
    ? "1 skill was left out — this source cannot place it"
    : `${count} skills were left out — this source cannot place them`;
}

function resolveEffectiveSource(...candidates: Array<string | undefined>): string {
  return candidates.find((source) => source !== undefined) ?? DEFAULT_PUBLIC_SOURCE_NAME;
}

function primarySourceName(skill: ResolvedSkill | undefined): string | undefined {
  return skill?.availableSources?.find((s) => s.primary)?.name;
}

function marketplaceSourceName(skill: ResolvedSkill | undefined): string | undefined {
  return skill?.availableSources?.find((source) => source.type !== "local")?.name;
}

/** A marketplace origin on a skill no marketplace carries names an install that cannot happen. */
function defaultOriginFor(skill: ResolvedSkill | undefined): string {
  if (isLocalOnlySkill(skill)) return EJECT_SOURCE;

  return primarySourceName(skill) ?? DEFAULT_PUBLIC_SOURCE_NAME;
}

function createDefaultSkillConfig(id: SkillId): SkillConfig {
  return { id, scope: "global", origin: defaultOriginFor(matrix.skills[id]) };
}

function hasProjectActive(configs: SkillConfig[], id: SkillId): boolean {
  return configs.some((sc) => sc.id === id && isActiveAt(sc, "project"));
}

function findGlobalActive(configs: SkillConfig[], id: SkillId): SkillConfig | undefined {
  return configs.find((sc) => sc.id === id && isActiveAt(sc, "global"));
}

function hasGlobalActive(configs: SkillConfig[], id: SkillId): boolean {
  return findGlobalActive(configs, id) !== undefined;
}

function hasGlobalTombstone(configs: SkillConfig[], id: SkillId): boolean {
  return configs.some((sc) => sc.id === id && isGlobalTombstone(sc));
}

/** Active project entry plus global tombstone: the `[P][G]` row. */
function isDualScopePair(configs: SkillConfig[], id: SkillId): boolean {
  return hasProjectActive(configs, id) && hasGlobalTombstone(configs, id);
}

/**
 * True when a SELECTED skill must not be deselected at project scope. Locks only global-owned
 * halves: an active global entry in the snapshot, or a snapshot tombstone paired with a live
 * active global entry (a persisted `[P][G]` collapsed this session). A persisted pair's project
 * half and a skill added this session stay deselectable.
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
 * The deselect lock, plus a live `[P][G]` pair: dropping its project half implicitly would leave
 * the masked global install active beside the new pick in a one-per-category slot.
 */
function blocksExclusiveSwap(
  installed: SkillConfig[],
  liveConfigs: SkillConfig[],
  id: SkillId,
): boolean {
  return isGloballyLockedSkill(installed, liveConfigs, id) || isDualScopePair(liveConfigs, id);
}

function wouldOverwriteGlobalEject(
  config: SkillConfig,
  liveConfigs: SkillConfig[],
  installedSkillConfigs: SkillConfig[] | null,
): boolean {
  if (config.scope !== "project" || config.origin !== EJECT_SOURCE) return false;
  const globalEjectInstalled = installedSkillConfigs?.some(
    (sc) =>
      sc.id === config.id && sc.scope === "global" && sc.origin === EJECT_SOURCE && !sc.excluded,
  );
  if (!globalEjectInstalled) return false;
  return !liveConfigs.some((sc) => sc.id === config.id && sc.excluded);
}

/**
 * True when the `(id, scope)` slot is a global install this session inherited: an active global
 * entry in the snapshot, or the global install a snapshot tombstone masked. Keyed on the slot
 * because a `[P][G]` pair's project half stays editable; read off the snapshot because a skill
 * added this session (or any skill in a first `init`) is nobody's install yet.
 */
function isInheritedGlobalSlot(
  installed: SkillConfig[] | null,
  id: SkillId,
  scope: SkillScope | undefined,
): boolean {
  if (installed === null) return false;
  return (
    scope === "global" && (hasGlobalActive(installed, id) || hasGlobalTombstone(installed, id))
  );
}

/** Leaves a dual-scope skill's global tombstone untouched. */
function withActiveEntryOrigin(
  configs: SkillConfig[],
  id: SkillId,
  scope: SkillScope | undefined,
  origin: string,
): SkillConfig[] {
  return configs.map((sc) =>
    sc.id === id && !sc.excluded && sc.scope === scope ? { ...sc, origin } : sc,
  );
}

/**
 * Drops entries the project owns. An active global entry the snapshot already carried is
 * inherited and survives byte-identical; a skill added this session is dropped. A null
 * `installedSkillConfigs` (editing from global scope) makes every removal an uninstall.
 * Dual-scope pairs collapse to a single inherited-global entry so the `[G]` badge survives.
 */
function applySkillRemoval(
  configs: SkillConfig[],
  removedIds: Iterable<SkillId>,
  installedSkillConfigs: SkillConfig[] | null,
): SkillConfig[] {
  // Annotated: `instanceof Set` narrows to `Set<any>`, which would spread as `any[]`.
  const removed: ReadonlySet<SkillId> =
    removedIds instanceof Set ? removedIds : new Set(removedIds);
  const installedIds = new Set((installedSkillConfigs ?? []).map((s) => s.id));

  const survivesRemoval = (entry: SkillConfig): boolean =>
    !isDualScopePair(configs, entry.id) && !isProjectOwned(entry) && installedIds.has(entry.id);

  const retained = configs.filter((sc) => !removed.has(sc.id) || survivesRemoval(sc));
  const resurfacedInheritedGlobals = [...removed]
    .filter((id) => isDualScopePair(configs, id))
    .map((id) => ({
      id,
      scope: "global" as const,
      origin:
        configs.find((sc) => sc.id === id && sc.scope === "global")?.origin ??
        DEFAULT_PUBLIC_SOURCE_NAME,
    }));

  return [...retained, ...resurfacedInheritedGlobals];
}

function flattenCategorySelections(selections: CategorySelections): SkillId[] {
  return typedValues(selections).flat();
}

function collectSkillIdsFromSelections(selections: CategorySelections): Set<SkillId> {
  return new Set(flattenCategorySelections(selections));
}

function reconcileSkillConfigs(
  configs: SkillConfig[],
  added: SkillId[],
  removed: SkillId[],
  installedSkillConfigs: SkillConfig[] | null,
  isEditingFromGlobalScope: boolean,
): SkillConfig[] {
  // Null so applySkillRemoval drops rather than retains: there is no project overlay.
  const effectiveInstalled = isEditingFromGlobalScope ? null : installedSkillConfigs;
  let result = applySkillRemoval(configs, removed, effectiveInstalled);

  for (const id of added) {
    // Re-selecting a globally installed skill re-creates both halves, like toggleSkillScope's G->P.
    if (
      !isEditingFromGlobalScope &&
      hasGlobalTombstone(installedSkillConfigs ?? [], id) &&
      !hasProjectActive(result, id)
    ) {
      const globalEntry =
        (installedSkillConfigs ?? []).find((sc) => sc.id === id && sc.scope === "global") ??
        result.find((sc) => sc.id === id && sc.scope === "global");
      const origin = globalEntry?.origin ?? DEFAULT_PUBLIC_SOURCE_NAME;
      result = [
        ...result.filter((sc) => sc.id !== id),
        { id, scope: "project", origin },
        { id, scope: "global", excluded: true, origin },
      ];
      continue;
    }

    const existingExcluded = result.find((sc) => sc.id === id && sc.excluded);
    if (existingExcluded) {
      // Drop the flag rather than set it to `undefined`: absent means not excluded.
      result = result.map((sc) => {
        if (sc.id !== id || !sc.excluded) return sc;
        const { excluded: _excluded, ...active } = sc;
        return active;
      });
    } else if (!result.some((sc) => sc.id === id)) {
      // A restore, not a fresh add: keep the persisted scope and origin, or the round trip would
      // trigger a bogus scope/source migration.
      result = [...result, buildSkillConfigForId(id, installedSkillConfigs)];
    }
  }

  return result;
}

function agentHasProjectActive(configs: AgentScopeConfig[], name: AgentName): boolean {
  return configs.some((ac) => ac.name === name && isActiveAt(ac, "project"));
}

function agentHasGlobalActive(configs: AgentScopeConfig[], name: AgentName): boolean {
  return configs.some((ac) => ac.name === name && isActiveAt(ac, "global"));
}

function agentHasGlobalTombstone(configs: AgentScopeConfig[], name: AgentName): boolean {
  return configs.some((ac) => ac.name === name && isGlobalTombstone(ac));
}

function isDualScopeAgentPair(configs: AgentScopeConfig[], name: AgentName): boolean {
  return agentHasProjectActive(configs, name) && agentHasGlobalTombstone(configs, name);
}

/** Preserved across merges so a dual-scope pair can be restored later. */
function collectTombstones<T extends { excluded?: boolean }>(configs: T[]): T[] {
  return configs.filter((entry) => entry.excluded);
}

function filledAgentSlots(configs: AgentScopeConfig[]): ReadonlySet<string> {
  return new Set(configs.map((ac) => agentSlotKey(ac.name, ac.scope)));
}

/**
 * A tombstone only masks while its active entry sits at the OTHER scope. One at a slot the rebuild
 * just filled masks nothing, and the merge would write both.
 */
function agentTombstonesOutsideRebuild(
  saved: AgentScopeConfig[],
  rebuilt: AgentScopeConfig[],
): AgentScopeConfig[] {
  const filled = filledAgentSlots(rebuilt);
  return collectTombstones(saved).filter((ac) => !filled.has(agentSlotKey(ac.name, ac.scope)));
}

function skillTombstonesOutsideRebuild(
  saved: SkillConfig[],
  rebuilt: SkillConfig[],
): SkillConfig[] {
  const filled = new Set(rebuilt.map((sc) => skillSlotKey(sc.id, sc.scope)));
  return collectTombstones(saved).filter((sc) => !filled.has(skillSlotKey(sc.id, sc.scope)));
}

/**
 * A deselect is always one the project owns (inherited installs are refused in `toggleAgent`),
 * so it removes cleanly. A new agent is `scope: "global"` deliberately, and gets an empty stack
 * beside project-scoped skills (`isScopePairCompatible`) — ruled 2026-08-19; not a defect.
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
 * Entries a roster rebuild keeps: tombstones whose slot stays free (so dual-scope pairs survive,
 * regardless of roster membership), and entries the project does not own (so an inherited global
 * agent outside the roster is never uninstalled). The roster's own entries are rebuilt.
 */
function survivesRosterRebuild(
  agentConfig: AgentScopeConfig,
  roster: ReadonlySet<AgentName>,
  rebuiltSlots: ReadonlySet<string>,
): boolean {
  if (agentConfig.excluded) {
    return !rebuiltSlots.has(agentSlotKey(agentConfig.name, agentConfig.scope));
  }
  return !isProjectOwned(agentConfig) && !roster.has(agentConfig.name);
}

/** The user's choices about a sub-agent, carried whole across every rebuild. */
function tuningOf(agentConfig: AgentScopeConfig | undefined): Partial<AgentScopeConfig> {
  return {
    ...(agentConfig?.model !== undefined && { model: agentConfig.model }),
    ...(agentConfig?.codexModel !== undefined && { codexModel: agentConfig.codexModel }),
    ...(agentConfig?.effort !== undefined && { effort: agentConfig.effort }),
  };
}

function tunedEntryFor(
  agentConfigs: AgentScopeConfig[] | undefined,
  agent: AgentName,
): AgentScopeConfig | undefined {
  return (
    agentConfigs?.find((ac) => ac.name === agent && !ac.excluded && ac.scope === "project") ??
    agentConfigs?.find((ac) => ac.name === agent && !ac.excluded)
  );
}

/**
 * Re-selecting an inherited-global agent whose install the snapshot records as a tombstone
 * rebuilds the `[P][G]` pair, carrying the row's tuning so the model and effort survive.
 */
function restoreDualScopeAgent(
  selectedAgents: AgentName[],
  agentConfigs: AgentScopeConfig[],
  agent: AgentName,
) {
  const tuning = tuningOf(tunedEntryFor(agentConfigs, agent));
  return {
    selectedAgents: [...selectedAgents, agent],
    agentConfigs: [
      ...agentConfigs.filter((ac) => ac.name !== agent),
      { name: agent, scope: "project" as const, ...tuning },
      { name: agent, scope: "global" as const, ...tuning, excluded: true },
    ],
  };
}

function nextSelectedAgents(
  selectedAgents: AgentName[],
  agent: AgentName,
  flags: { isSelected: boolean; isInList: boolean },
): AgentName[] {
  if (flags.isSelected) return selectedAgents.filter((a) => a !== agent);
  if (flags.isInList) return selectedAgents;
  return [...selectedAgents, agent];
}

function buildSkillConfigForId(id: SkillId, savedConfigs?: SkillConfig[] | null): SkillConfig {
  const saved =
    savedConfigs?.find((sc) => sc.id === id && !sc.excluded && sc.scope === "project") ??
    savedConfigs?.find((sc) => sc.id === id && !sc.excluded);
  return {
    id,
    scope: saved?.scope ?? "global",
    origin: saved?.origin ?? defaultOriginFor(matrix.skills[id]),
  };
}

function buildAgentConfigForName(
  name: AgentName,
  savedConfigs?: AgentScopeConfig[],
): AgentScopeConfig {
  const saved = tunedEntryFor(savedConfigs, name);
  return {
    name,
    scope: saved?.scope ?? "global",
    ...tuningOf(saved),
  };
}

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
 * Built-in agents per domain; custom domains preselect none. `pm` and `reviewer` serve every
 * domain. Exported as an identity roster: `lib/wizard/agent-roster.test.ts` reconciles it with
 * `BUILT_IN_AGENT_GROUPS` and `AGENT_NAMES`.
 */
export const DOMAIN_AGENTS: Partial<Record<Domain, AgentName[]>> = {
  web: ["web-developer", "web-researcher", "web-tester", "pm", "reviewer"],
  api: ["api-developer", "api-researcher", "api-tester", "pm", "reviewer"],
  cli: ["cli-developer", "cli-tester", "cli-researcher", "pm", "reviewer"],
  ai: ["ai-developer", "ai-researcher", "ai-tester", "pm", "reviewer"],
};

function absentFromSourceWarning(skillId: SkillId): string {
  return (
    `Installed skill '${skillId}' is not present in the loaded source — it may have been ` +
    `removed or renamed. It is left out of this session's selection. Run ` +
    `'${CLI_INVOKE_COMMAND} update' to refresh the marketplace if you expect it to still be ` +
    `carried there.`
  );
}

function unplaceableCategoryWarning(skillId: SkillId, category: string): string {
  return (
    `Installed skill '${skillId}' has unknown category '${category}' — skipping. No domain in ` +
    `this source claims that category, so the wizard has no screen to place the skill on. ` +
    `Declare it with a 'domain' in the source's '${SKILL_CATEGORIES_PATH}', or run ` +
    `'${CLI_INVOKE_COMMAND} update' to refresh the marketplace.`
  );
}

function resolveSkillForPopulation(
  skillId: SkillId,
): { domain: Domain; subcat: Category; techId: SkillId } | null {
  const { skills } = matrix;
  const skill = skills[skillId];
  if (!skill?.category) {
    warn(absentFromSourceWarning(skillId));
    return null;
  }

  const domain = getCategoryDomain(skill.category);
  if (!domain) {
    warn(unplaceableCategoryWarning(skillId, skill.category));
    return null;
  }

  // Boundary cast: domain lookup confirmed category exists in matrix
  const subcat = skill.category as Category;
  return { domain, subcat, techId: skillId };
}

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

function sourceForInstallMode(skill: ResolvedSkill, mode: Exclude<InstallMode, "mixed">): string {
  if (mode === "eject") return EJECT_SOURCE;

  return marketplaceSourceName(skill) ?? DEFAULT_PUBLIC_SOURCE_NAME;
}

function installModeOfSource(origin: string | undefined): Exclude<InstallMode, "mixed"> {
  return origin === EJECT_SOURCE ? "eject" : "plugin";
}

/** A local-only skill gets the eject cell alone: no marketplace could serve a plugin install. */
function buildInstallModeOptions(
  skill: ResolvedSkill | undefined,
  selectedMode: Exclude<InstallMode, "mixed">,
): SourceOption[] {
  const modes = isLocalOnlySkill(skill) ? LOCAL_ONLY_INSTALL_MODES : INSTALL_MODES;
  return modes.map((mode) => ({ mode, selected: mode === selectedMode }));
}

/**
 * Snapshot slots this session emptied: active in the snapshot, unoccupied now. Removal leaves no
 * live entry to render from, so without these the row would vanish before save. Keyed per
 * `(id, scope)` slot and ungated on edit context, like `computeScopeDiff`. Snapshot tombstones
 * are excluded: dropping a mask deletes nothing.
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
      // Hydration already moved it to unresolvableSkillIds, and getSkillById would throw on it.
      !!matrix.skills[sc.id],
  );
}

/** The baseline `computeScopeDiff`'s `prevSkillKeySet` uses; tombstones occupy their slot. */
function collectInstalledSkillSlots(
  installedSkillConfigs: SkillConfig[] | null,
): ReadonlySet<string> {
  if (!installedSkillConfigs) return new Set();
  return new Set(installedSkillConfigs.map((sc) => skillSlotKey(sc.id, sc.scope)));
}

/**
 * Keyed on the slot rather than the id, so a skill adopted at project scope while installed
 * globally is flagged on its new project row — as `classifyDiffRow` does on the confirm step.
 */
function addedSlotFlag(
  installedSkillSlots: ReadonlySet<string>,
  id: SkillId,
  scope: SkillScope | undefined,
): { added?: true } {
  return installedSkillSlots.has(skillSlotKey(id, scope)) ? {} : { added: true };
}

function withSelectedMode(options: SourceOption[], source: string | undefined): SourceOption[] {
  const mode = installModeOfSource(source);
  return options.map((option) => ({ ...option, selected: option.mode === mode }));
}

function resolveSkillRowInputs(
  id: SkillId,
  skillConfigs: SkillConfig[],
): { skillId: SkillId; configEntry: SkillConfig | undefined; options: SourceOption[] } {
  const skill = getSkillById(id);
  const configEntry = skillConfigs.find((sc) => sc.id === skill.id);
  const selectedSource = resolveEffectiveSource(
    configEntry?.origin,
    skill.activeSource?.name,
    primarySourceName(skill),
  );
  return {
    skillId: skill.id,
    configEntry,
    options: buildInstallModeOptions(skill, installModeOfSource(selectedSource)),
  };
}

type SourceRowContext = {
  configEntry: SkillConfig | undefined;
  installedSkillConfigs: SkillConfig[] | null;
  isEditingFromGlobalScope: boolean;
  installedSkillSlots: ReadonlySet<string>;
};

/**
 * The row for a snapshot slot this session emptied, pinned to its persisted scope and source.
 * Not readOnly: a lock would read as "installed globally", not "about to be removed".
 */
function toPendingRemovalRow(
  skillId: SkillId,
  options: SourceOption[],
  removedInstalledEntry: SkillConfig,
): SourceRow {
  return {
    skillId,
    options: withSelectedMode(options, removedInstalledEntry.origin),
    scope: removedInstalledEntry.scope,
    disabled: true,
  };
}

/**
 * A global install adopted at project scope without a tombstone: its global slot is empty in the
 * live config, but the locked global row already renders it, so a removal row would duplicate it.
 */
function isSlotAlreadyRendered(rows: SourceRow[], removedInstalledEntry: SkillConfig): boolean {
  const slot = skillSlotKey(removedInstalledEntry.id, removedInstalledEntry.scope);
  return rows.some((row) => skillSlotKey(row.skillId, row.scope) === slot);
}

/** Its added flag reads the GLOBAL slot, so an inherited install stays a plain lock. */
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
        installedGlobalConfig?.origin ?? configEntry.origin,
        installedSkillSlots,
      ),
    ];
  }

  if (!isEditingFromGlobalScope && installedGlobalConfig && configEntry?.scope === "project") {
    // Each half reads its own slot, so `+` lands on the new project row only.
    return [
      toLockedGlobalRow(skillId, options, installedGlobalConfig.origin, installedSkillSlots),
      {
        skillId,
        options,
        scope: "project" as const,
        ...addedSlotFlag(installedSkillSlots, skillId, "project"),
      },
    ];
  }

  const readOnly =
    !isEditingFromGlobalScope &&
    (!!installedGlobalConfig ||
      isInheritedGlobalSlot(installedSkillConfigs, skillId, configEntry?.scope));
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

/** Global readOnly, global editable, then project; pending-removal rows sort by their scope. */
function sourceRowSortTier(row: SourceRow): number {
  if (row.scope === "global" && row.readOnly) return 0;
  if (row.scope === "global") return 1;
  return 2;
}

export type WizardStep = "stack" | "domains" | "build" | "sources" | "agents" | "confirm";

type WizardApproach = "stack" | "scratch";

type StackAction = "defaults" | "customize";

export const WIZARD_STEP_ORDER = [
  "stack",
  "domains",
  "build",
  "sources",
  "agents",
  "confirm",
] as const satisfies readonly WizardStep[];

function offersStacks(): boolean {
  return matrix.suggestedStacks.length > 0;
}

/** Drops the stack step when the loaded source offers no stack, so the tabs match the flow. */
export function getActiveStepFlow(): WizardStep[] {
  if (offersStacks()) return [...WIZARD_STEP_ORDER];
  return WIZARD_STEP_ORDER.filter((step) => step !== "stack");
}

function stepsBefore(flow: WizardStep[], step: WizardStep): WizardStep[] {
  const index = flow.indexOf(step);
  return index < 0 ? [] : flow.slice(0, index);
}

export type WizardState = {
  step: WizardStep;

  approach: WizardApproach | null;
  selectedStackId: string | null;
  stackAction: StackAction | null;

  selectedDomains: Domain[];

  currentDomainIndex: number;
  domainSelections: DomainSelections;
  _stackDomainSelections: DomainSelections | null;

  showLabels: boolean;

  skillConfigs: SkillConfig[];
  focusedSkillId: SkillId | null;

  /**
   * Saved skill ids the loaded source could not resolve. The wizard cannot represent them, so the
   * merge removes them; this list is what lets `edit` name each one.
   */
  unresolvableSkillIds: SkillId[];

  /**
   * `[P][G]` pairs `s` folded into the global install this session. A fold and a selection-key
   * drop leave the same config entry but mean different things: a drop removes the project's copy,
   * a fold moves it into the install every project reads.
   */
  foldedSkillIds: SkillId[];

  /**
   * The marketplace `init --marketplace` named, when the global install above the project came from
   * another; null otherwise.
   */
  setupMarketplace: string | null;

  showInfo: boolean;

  selectedAgents: AgentName[];
  agentConfigs: AgentScopeConfig[];
  focusedAgentId: AgentName | null;

  installedSkillConfigs: SkillConfig[] | null;
  installedAgentConfigs: AgentScopeConfig[] | null;

  isInitMode: boolean;

  /** Editing from ~/.claude/ with no project to move items to, so scope toggling is disabled. */
  isEditingFromGlobalScope: boolean;

  toastMessage: string | null;

  globalPreselections: SkillConfig[] | null;

  /** Restored after selectStack wipes selectedAgents/agentConfigs. */
  globalAgentPreselections: { agents: AgentName[]; configs: AgentScopeConfig[] } | null;

  history: WizardStep[];

  setStep: (step: WizardStep) => void;
  setApproach: (approach: WizardApproach | null) => void;
  selectStack: (stackId: string | null) => void;
  setStackAction: (action: StackAction) => void;
  /**
   * "Start from scratch": reached from the stack step's scratch row and from hydration when the
   * source offers no stacks. Does not navigate — the caller owns the step.
   */
  startFromScratch: () => void;
  /** Restores selections from installed skill ids; warns for and skips ids it cannot place. */
  populateFromSkillIds: (skillIds: SkillId[], savedConfigs?: SkillConfig[]) => void;
  toggleDomain: (domain: Domain) => void;
  toggleTechnology: (
    domain: Domain,
    category: Category,
    technology: SkillId,
    exclusive: boolean,
  ) => void;
  nextDomain: () => boolean;
  prevDomain: () => boolean;
  setCurrentDomainIndex: (index: number) => void;
  toggleShowLabels: () => void;
  /** "eject" when no skills are configured. */
  deriveInstallMode: () => InstallMode;
  toggleSkillScope: (skillId: SkillId) => void;
  setFocusedSkillId: (id: SkillId | null) => void;
  /**
   * Seeds `focusedSkillId` to the grid's first cell for the active domain, synchronously, so the
   * `s` hotkey never depends on CategoryGrid's post-mount effect.
   */
  seedFocusedSkillForActiveDomain: () => void;
  /**
   * Updates only the active entry at `scope`; a masked global tombstone keeps its origin. Silently
   * refuses an inherited global slot ({@link isInheritedGlobalSlot}) from project context.
   */
  setInstallMode: (
    skillId: SkillId,
    mode: Exclude<InstallMode, "mixed">,
    scope: SkillScope | undefined,
  ) => void;
  toggleInfo: () => void;
  setToastMessage: (message: string | null) => void;
  /** No-op when history is empty (the edit flow can open mid-wizard). */
  goBack: () => void;
  toggleAgent: (agent: AgentName) => void;
  toggleAgentScope: (agentName: AgentName) => void;
  setFocusedAgentId: (id: AgentName | null) => void;
  /**
   * Seeds `focusedAgentId` on entry unless one is recorded. Synchronous because the `s` toggle in
   * `wizard.tsx` reads it at once, and a post-mount seed can lose to a buffered keystroke.
   */
  seedFocusedAgent: () => void;
  /** From-scratch only: a chosen stack's roster stands. */
  preselectAgentsFromDomains: () => void;
  /** Merges the stack's agents with global preselections, preserving dual-scope tombstones. */
  preselectAgentsFromStack: (stackAgents: AgentName[]) => void;
  reset: () => void;

  /** May contain duplicates when a skill is shared across domains. */
  getAllSelectedTechnologies: () => SkillId[];
  getSelectedTechnologiesPerDomain: () => Partial<Record<Domain, SkillId[]>>;
  getCurrentDomain: () => Domain | null;
  getTechnologyCount: () => number;
  /** Read against {@link getActiveStepFlow}: a step this run never has cannot be completed. */
  getStepProgress: () => { completedSteps: WizardStep[]; skippedSteps: WizardStep[] };
  canGoToNextDomain: () => boolean;
  canGoToPreviousDomain: () => boolean;

  buildSourceRows: () => SourceRow[];
};

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
  | "foldedSkillIds"
  | "setupMarketplace"
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
  _stackDomainSelections: null,
  showLabels: false,
  skillConfigs: [],
  focusedSkillId: null,
  unresolvableSkillIds: [],
  foldedSkillIds: [],
  setupMarketplace: null,
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

/**
 * Seeds each step's focus synchronously on entry: both scope toggles read the focused id the
 * moment a key arrives, and a post-mount seed can lose to a buffered keystroke.
 */
function seedFocusForStep(
  step: WizardStep,
  actions: Pick<WizardState, "seedFocusedSkillForActiveDomain" | "seedFocusedAgent">,
): void {
  if (step === "build") actions.seedFocusedSkillForActiveDomain();
  if (step === "agents") actions.seedFocusedAgent();
}

export const useWizardStore = create<WizardState>((set, get) => ({
  ...createInitialState(),

  setStep: (step) => {
    set((state) => ({
      step,
      history: [...state.history, state.step],
    }));
    seedFocusForStep(step, get());
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
    // selectStack(null) wipes the agent selections too, so the global ones are put back.
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

      // A tombstone may coexist with an active entry for the same id only at a different scope.
      const excludedConfigs = skillTombstonesOutsideRebuild(savedConfigs ?? [], skillConfigs);

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
          // Global-scope edit: deselecting a domain uninstalls its skills instead of tombstoning.
          skillConfigs: applySkillRemoval(
            state.skillConfigs,
            removedSkillIds,
            state.isEditingFromGlobalScope ? null : state.installedSkillConfigs,
          ),
        };
      }

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

      // On a SELECT only the active-global arm applies; the stale-collapse arm guards deselects, so
      // re-selecting still rebuilds `[P][G]`. A persisted pair's project half passes both ways.
      const isGlobalLocked = isSelected
        ? isGloballyLockedSkill(installed, state.skillConfigs, technology)
        : hasGlobalActive(installed, technology);
      if (isGlobalLocked && !state.isEditingFromGlobalScope) {
        return { toastMessage: TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED };
      }

      // A radio swap must never tombstone or unmask a global install.
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

      // A dual-scope deselect leaves an active inherited-global entry, so the skill stays selected,
      // as a save-and-reopen would re-derive.
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
      // Unreachable: `toggleFocusedScope` in wizard.tsx refuses first. The reachable refusal is
      // asserted in e2e/interactive/edit-wizard-navigation.e2e.test.ts.
      if (state.isEditingFromGlobalScope) return state;

      const config = state.skillConfigs.find((sc) => sc.id === skillId && !sc.excluded);
      if (!config) return state;

      if (wouldOverwriteGlobalEject(config, state.skillConfigs, state.installedSkillConfigs)) {
        return { toastMessage: TOAST_MESSAGES.ALREADY_EJECTED_AT_GLOBAL };
      }

      // A snapshot tombstone also means a real global install, so G→P re-creates the tombstone
      // and an in-session collapse→`s` restores a genuine `[P][G]` pair.
      const wasInstalledGlobally =
        state.installedSkillConfigs?.some((sc) => sc.id === skillId && sc.scope === "global") ??
        false;
      const newScope = config.scope === "project" ? ("global" as const) : ("project" as const);

      const rescoped = state.skillConfigs.map((sc) =>
        sc.id === skillId && !sc.excluded ? { ...sc, scope: newScope } : sc,
      );

      if (newScope === "project") {
        // Gated so a fresh init toggle mints no spurious tombstone.
        const needsTombstone =
          wasInstalledGlobally && !rescoped.some((sc) => sc.id === skillId && sc.excluded);
        return {
          skillConfigs: needsTombstone
            ? [
                ...rescoped,
                { id: skillId, scope: "global" as const, excluded: true, origin: config.origin },
              ]
            : rescoped,
          foldedSkillIds: state.foldedSkillIds.filter((id) => id !== skillId),
        };
      }

      // Project → global always drops the tombstone: an active entry and a tombstone may not share
      // an `(id, scope)`, and `wasInstalledGlobally` cannot see a tombstone a prior G→P made.
      // Collapsing a live pair this way is a fold, which the store records.
      return {
        skillConfigs: rescoped.filter((sc) => !(sc.id === skillId && sc.excluded)),
        foldedSkillIds: isDualScopePair(state.skillConfigs, skillId)
          ? [...state.foldedSkillIds, skillId]
          : state.foldedSkillIds,
      };
    }),

  setFocusedSkillId: (id) => set({ focusedSkillId: id }),

  seedFocusedSkillForActiveDomain: () => {
    const state = get();
    // The build step renders FALLBACK_DOMAIN when none is selected, so the seed must too.
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
      // Silent: the Sources grid renders this row inert, so a refused call reached past it.
      if (
        isInheritedGlobalSlot(state.installedSkillConfigs, skillId, scope) &&
        !state.isEditingFromGlobalScope
      ) {
        return state;
      }
      const origin = sourceForInstallMode(getSkillById(skillId), mode);
      return {
        skillConfigs: withActiveEntryOrigin(state.skillConfigs, skillId, scope, origin),
      };
    }),

  toggleInfo: () => set((state) => ({ showInfo: !state.showInfo })),

  setToastMessage: (message) => set({ toastMessage: message }),

  goBack: () => {
    const previousStep = get().history.at(-1);
    if (previousStep === undefined) return;
    set((state) => ({ step: previousStep, history: state.history.slice(0, -1) }));
    seedFocusForStep(previousStep, get());
  },

  toggleAgent: (agent) =>
    set((state) => {
      const installed = state.installedAgentConfigs ?? [];

      // A live `[P][G]` agent row ignores the selection key; only `s` collapses and restores it.
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

      // Mirrors the skill-path guard in toggleTechnology.
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
      // A tombstoned agent renders "off", so toggling it re-enables.
      const isSelected = isInList && !hasExcludedTombstone;

      return {
        selectedAgents: nextSelectedAgents(state.selectedAgents, agent, { isSelected, isInList }),
        agentConfigs: applyAgentToggle(state.agentConfigs, agent, isSelected),
      };
    }),

  toggleAgentScope: (agentName) =>
    set((state) => {
      // Unreachable for the same reason as toggleSkillScope's.
      if (state.isEditingFromGlobalScope) return state;

      const config = state.agentConfigs.find((ac) => ac.name === agentName && !ac.excluded);
      if (!config) return state;

      // A tombstone counts as a global install, as in toggleSkillScope.
      const wasInstalledGlobally =
        state.installedAgentConfigs?.some((ac) => ac.name === agentName && ac.scope === "global") ??
        false;
      const newScope = config.scope === "project" ? ("global" as const) : ("project" as const);

      const rescoped = state.agentConfigs.map((ac) =>
        ac.name === agentName && !ac.excluded ? { ...ac, scope: newScope } : ac,
      );

      if (newScope === "project") {
        // Gated so a fresh init toggle mints no spurious tombstone.
        const needsTombstone =
          wasInstalledGlobally && !rescoped.some((ac) => ac.name === agentName && ac.excluded);
        return {
          agentConfigs: needsTombstone
            ? [...rescoped, { name: agentName, scope: "global" as const, excluded: true }]
            : rescoped,
        };
      }

      // Symmetric with toggleSkillScope.
      return { agentConfigs: rescoped.filter((ac) => !(ac.name === agentName && ac.excluded)) };
    }),

  setFocusedAgentId: (id) => set({ focusedAgentId: id }),

  seedFocusedAgent: () => {
    if (get().focusedAgentId !== null) return;
    set({ focusedAgentId: firstFocusableAgent() });
  },

  preselectAgentsFromDomains: () =>
    set((state) => {
      // A stack's declared roster stands; deriving one here would overwrite it.
      if (state.selectedStackId) return state;

      // Deduped: several domains roster `pm` and `reviewer`.
      const sorted = [
        ...new Set(state.selectedDomains.flatMap((domain) => DOMAIN_AGENTS[domain] ?? [])),
      ].sort();
      const roster = new Set(sorted);
      const merged = sorted.map((name) => buildAgentConfigForName(name, state.agentConfigs));
      const rebuiltSlots = filledAgentSlots(merged);
      const retained = state.agentConfigs.filter((ac) =>
        survivesRosterRebuild(ac, roster, rebuiltSlots),
      );
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
      const excludedConfigs = agentTombstonesOutsideRebuild(savedConfigs, merged);
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

    const selectedSet = new Set(selectedTechnologies);
    const inheritedSkillIds = skillConfigs
      .filter((sc) => !sc.excluded && !selectedSet.has(sc.id))
      .map((sc) => sc.id);
    const allActiveIds = new Set([...inheritedSkillIds, ...selectedTechnologies]);
    const excludedGlobalIds = skillConfigs
      .filter((sc) => isGlobalTombstone(sc) && !allActiveIds.has(sc.id))
      .map((sc) => sc.id);
    const liveSkillIds = [...inheritedSkillIds, ...selectedTechnologies, ...excludedGlobalIds];
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

    // A collapsed pair keeps its global row and gains a project pending-removal row, so rows are
    // disjoint per `(id, scope)` slot, not per skill.
    const pendingRemovalRows: SourceRow[] = collectRemovedInstalledEntries(
      state.installedSkillConfigs,
      skillConfigs,
    )
      .filter((entry) => !isSlotAlreadyRendered(liveRows, entry))
      .map((entry) => {
        const { skillId, options } = resolveRowInputs(entry.id);
        return toPendingRemovalRow(skillId, options, entry);
      });

    // Sorted to match source-grid grouping, so navigation indices align with render order.
    const rows = [...liveRows, ...pendingRemovalRows];
    rows.sort((a, b) => sourceRowSortTier(a) - sourceRowSortTier(b));

    return rows;
  },
}));

/**
 * Runs a change triggered from a painted frame, showing its warnings as a toast: stderr under a
 * mounted wizard is pushed off screen by the next repaint. Past the mount only — hydration
 * reaches the same actions while the startup band is buffering.
 */
export function showWarningsAsToast(change: () => void): void {
  enableBuffering();
  try {
    change();
    const warnings = drainBuffer();
    if (warnings.length > 0) {
      useWizardStore.getState().setToastMessage(skillsLeftOutToast(warnings.length));
    }
  } finally {
    disableBuffering();
  }
}

export type HydrateOptions = {
  initialStep?: WizardStep;
  initialDomains?: Domain[];
  initialAgents?: AgentName[];
  installedSkillIds?: SkillId[];
  installedSkillConfigs?: SkillConfig[];
  installedAgentConfigs?: AgentScopeConfig[];
  isEditingFromGlobalScope?: boolean;
  setupMarketplace?: string;
};

/**
 * Call BEFORE render(<Wizard />): hydrating in a render-phase hook flashes the default step for
 * one frame.
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

function hydrateForEdit(initialStep: WizardStep, options: HydrateOptions): void {
  const {
    initialDomains,
    initialAgents,
    installedSkillIds,
    installedSkillConfigs,
    installedAgentConfigs,
    isEditingFromGlobalScope,
    setupMarketplace,
  } = options;

  if (installedSkillIds?.length) {
    useWizardStore.getState().populateFromSkillIds(installedSkillIds, installedSkillConfigs);
  }

  useWizardStore.setState({
    isInitMode: false,
    step: initialStep,
    history: [],
    approach: "scratch",
    ...(initialDomains?.length ? { selectedDomains: initialDomains, currentDomainIndex: 0 } : {}),
    ...(initialAgents?.length ? { selectedAgents: initialAgents } : {}),
    ...(initialAgents?.length && installedAgentConfigs?.length
      ? { agentConfigs: installedAgentConfigs }
      : {}),
    ...(installedSkillConfigs?.length || installedAgentConfigs?.length
      ? {
          installedSkillConfigs: installedSkillConfigs ?? null,
          installedAgentConfigs: installedAgentConfigs ?? null,
        }
      : {}),
    ...(isEditingFromGlobalScope ? { isEditingFromGlobalScope: true } : {}),
    ...(setupMarketplace !== undefined && { setupMarketplace }),
  });

  useWizardStore.getState().seedFocusedSkillForActiveDomain();
}

const FIRST_STEP_WITHOUT_STACKS: WizardStep = "domains";

/**
 * Saved selections become preselections for stack-selection.tsx to merge after the stack choice
 * (selectStack wipes agents). With no stacks to offer, the wizard opens where "Start from scratch"
 * leads, having done what pressing it does.
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
    useWizardStore.setState({ step: FIRST_STEP_WITHOUT_STACKS, history: [] });
  }

  useWizardStore.getState().seedFocusedSkillForActiveDomain();
}
