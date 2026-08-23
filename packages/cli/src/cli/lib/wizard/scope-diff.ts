import type { AgentScopeConfig, SkillConfig, SkillScope } from "../../types/config";
import type { AgentName, SkillId } from "../../types/index";

export type ScopeDiffInput = {
  currentSkills: SkillConfig[];
  currentAgents: AgentScopeConfig[];
  installedSkillConfigs: SkillConfig[] | null;
  installedAgentConfigs: AgentScopeConfig[] | null;
  isInitMode: boolean;
};

export type DiffRowStatus = "added" | "mode-changed" | "removed" | "unchanged";

export type SkillDiffRow = {
  id: SkillId;
  source: string;
  status: DiffRowStatus;
};

export type AgentDiffRow = {
  name: AgentName;
  status: Exclude<DiffRowStatus, "mode-changed">;
};

export type ScopeDiff = {
  projectSkillRows: SkillDiffRow[];
  globalSkillRows: SkillDiffRow[];
  projectAgentRows: AgentDiffRow[];
  globalAgentRows: AgentDiffRow[];
  hasContent: boolean;
};

/**
 * Computes the per-scope diff rows the confirm-step summary renders.
 *
 * The diff baseline keeps tombstones as first-class entries. A tombstone
 * occupies the (id, scope) slot: it means "the global install still exists but
 * is silenced at project scope" — the dual-scope indicator. Treating the slot
 * as occupied — for both the previous-key set (isNew detection) and removal
 * (slot-occupancy match) — prevents a dual-scope G→P toggle from rendering a
 * spurious `-` at Global or a spurious `+` at Global on the next edit
 * when the stored tombstone is re-read; mode-change (`~`) tracking filters to active baseline
 * entries because tombstones don't represent a live install.
 *
 * Occupying a slot is not the same as filling it, which is why removal reads the
 * ACTIVE baseline alone and every re-surfaced global row is deduped against the
 * inherited set. A baseline tombstone masks an install rather than being one, and
 * an inherited global can be admitted as inherited and matched as removed at once.
 */
export function computeScopeDiff(input: ScopeDiffInput): ScopeDiff {
  const { currentSkills, currentAgents, installedSkillConfigs, installedAgentConfigs, isInitMode } =
    input;

  const projectSkills = currentSkills.filter((s) => s.scope === "project" && !s.excluded);
  const globalSkills = currentSkills.filter((s) => s.scope === "global" && !s.excluded);
  const projectAgents = currentAgents.filter((a) => a.scope === "project" && !a.excluded);
  const globalAgents = currentAgents.filter((a) => a.scope === "global" && !a.excluded);
  const excludedGlobalSkills = currentSkills.filter((s) => s.scope === "global" && !!s.excluded);
  const excludedGlobalAgents = currentAgents.filter((a) => a.scope === "global" && !!a.excluded);

  const prevSkillKeySet = installedSkillConfigs
    ? new Set(installedSkillConfigs.map((s) => skillSlotKey(s.id, s.scope)))
    : null;
  const prevSourceMap = installedSkillConfigs
    ? new Map(
        installedSkillConfigs
          .filter((s) => !s.excluded)
          .map((s) => [skillSlotKey(s.id, s.scope), s.origin]),
      )
    : null;
  const prevAgentKeySet = installedAgentConfigs
    ? new Set(installedAgentConfigs.map((a) => agentSlotKey(a.name, a.scope)))
    : null;

  // The installs the baseline actually records. Both readers below want this
  // rather than the raw snapshot: `inheritedGlobal*` re-surfaces an active global
  // the project overrides without a tombstone — a historical no-tombstone
  // dual-scope shape, current tombstones being handled by
  // `uniqueExcludedGlobalSkills` — and removal reports only what an install left.
  const activeSkillBaseline = installedSkillConfigs
    ? installedSkillConfigs.filter((s) => !s.excluded)
    : [];
  const activeAgentBaseline = installedAgentConfigs
    ? installedAgentConfigs.filter((a) => !a.excluded)
    : [];
  const inheritedGlobalSkills = activeSkillBaseline.filter(
    (s) =>
      s.scope === "global" &&
      !globalSkills.some((g) => g.id === s.id) &&
      !excludedGlobalSkills.some((e) => e.id === s.id) &&
      projectSkills.some((p) => p.id === s.id),
  );
  const inheritedGlobalAgents = activeAgentBaseline.filter(
    (a) =>
      a.scope === "global" &&
      !globalAgents.some((g) => g.name === a.name) &&
      !excludedGlobalAgents.some((e) => e.name === a.name) &&
      projectAgents.some((p) => p.name === a.name),
  );

  // Slot-occupancy match over the ACTIVE baseline: an installed entry at
  // (id, scope) is considered removed only if nothing — active OR tombstone —
  // occupies that slot in current. A current tombstone at the same key keeps the
  // slot occupied (dual-scope indicator, not a removal).
  //
  // A baseline TOMBSTONE is never a removal candidate. It masks a global install
  // rather than being one, so its slot held nothing to delete and dropping it
  // takes nothing away — a `-` there announces a deletion that never happens.
  const removedSkills = activeSkillBaseline.filter(
    (s) => !currentSkills.some((c) => c.id === s.id && c.scope === s.scope),
  );
  const removedAgents = activeAgentBaseline.filter(
    (a) => !currentAgents.some((c) => c.name === a.name && c.scope === a.scope),
  );

  // The Global section renders at most one row per skill, so both of the ways a
  // baseline global entry can re-surface are deduped against the inherited set:
  // `uniqueExcludedGlobalSkills` for the current tombstone, and the removed-global
  // rows below for the removal match. The second is not covered by the first —
  // an inherited global that the project claims WITHOUT a tombstone occupies no
  // slot in current, so it is admitted as inherited and matched as removed at
  // once, and the same skill lands under Global twice.
  const inheritedSkillIdSet = new Set(inheritedGlobalSkills.map((s) => s.id));
  const uniqueExcludedGlobalSkills = excludedGlobalSkills.filter(
    (s) => !inheritedSkillIdSet.has(s.id),
  );
  const allGlobalSkills = [
    ...globalSkills,
    ...inheritedGlobalSkills,
    ...uniqueExcludedGlobalSkills,
  ];
  const inheritedAgentNameSet = new Set(inheritedGlobalAgents.map((a) => a.name));
  const uniqueExcludedGlobalAgents = excludedGlobalAgents.filter(
    (a) => !inheritedAgentNameSet.has(a.name),
  );
  const allGlobalAgents = [
    ...globalAgents,
    ...inheritedGlobalAgents,
    ...uniqueExcludedGlobalAgents,
  ];

  const removedGlobalSkills = isInitMode
    ? []
    : removedSkills.filter((s) => s.scope === "global" && !inheritedSkillIdSet.has(s.id));
  const removedProjectSkills = removedSkills.filter((s) => s.scope === "project");
  const removedGlobalAgents = isInitMode
    ? []
    : removedAgents.filter((a) => a.scope === "global" && !inheritedAgentNameSet.has(a.name));
  const removedProjectAgents = removedAgents.filter((a) => a.scope === "project");

  const projectSkillRows = [
    ...projectSkills.map((s) => classifyDiffRow(s, prevSkillKeySet, prevSourceMap)),
    ...removedProjectSkills.map(toRemovedSkillRow),
  ];
  const globalSkillRows = [
    ...allGlobalSkills.map((s) => classifyDiffRow(s, prevSkillKeySet, prevSourceMap)),
    ...removedGlobalSkills.map(toRemovedSkillRow),
  ];
  const projectAgentRows = [
    ...projectAgents.map((a) => classifyAgentDiffRow(a, prevAgentKeySet)),
    ...removedProjectAgents.map(toRemovedAgentRow),
  ];
  const globalAgentRows = [
    ...allGlobalAgents.map((a) => classifyAgentDiffRow(a, prevAgentKeySet)),
    ...removedGlobalAgents.map(toRemovedAgentRow),
  ];

  const hasContent =
    projectSkillRows.length > 0 ||
    globalSkillRows.length > 0 ||
    projectAgentRows.length > 0 ||
    globalAgentRows.length > 0;

  return { projectSkillRows, globalSkillRows, projectAgentRows, globalAgentRows, hasContent };
}

/**
 * The `(id, scope)` SLOT key this module diffs on. Exported so every surface that computes its own
 * session diff — notably the wizard store's Sources tab — keys on the same slot rather than on the
 * id alone, which is what let one skill read as added on one surface and unchanged on the other.
 */
export function skillSlotKey(id: SkillId, scope: SkillScope | undefined): string {
  return `${id}:${scope}`;
}

/**
 * The `(name, scope)` SLOT key for an agent — the agent-side counterpart of {@link skillSlotKey},
 * exported for the same reason. Today only this module diffs agent slots, so there is nothing to
 * disagree with; the helper exists so that a second surface routes through it from the start rather
 * than re-deriving the key on `name` alone, which is precisely how the skill side ended up with
 * the Sources tab and the confirm step disagreeing about whether the same row was added.
 */
export function agentSlotKey(name: AgentName, scope: SkillScope | undefined): string {
  return `${name}:${scope}`;
}

export type ScopeBadges = {
  scope: SkillScope | undefined;
  secondaryScope: SkillScope | undefined;
};

/** Bracketed scope badge: `[G]` for global, `[P]` for project. */
export function formatScopeTag(scope: SkillScope): "[G]" | "[P]" {
  return scope === "global" ? "[G]" : "[P]";
}

/**
 * Derives the primary + secondary scope badges for a row from its active
 * entry and its excluded tombstone. A tombstone at the OTHER scope renders as a
 * secondary badge (`[P][G]`); a same-scope tombstone renders nothing extra.
 */
export function deriveScopeBadges(
  activeConfig: { scope: SkillScope } | undefined,
  excludedConfig: { scope: SkillScope } | undefined,
): ScopeBadges {
  const secondaryScope =
    excludedConfig && activeConfig && excludedConfig.scope !== activeConfig.scope
      ? excludedConfig.scope
      : undefined;
  return { scope: activeConfig?.scope, secondaryScope };
}

/**
 * Classifies an active skill entry against the baseline: added, mode-changed, or unchanged.
 *
 * The comparison is on `origin`, because that field IS where a skill's install mode is
 * recorded: `eject` means the project's own copy and anything else names the marketplace the
 * plugin comes from. With no second marketplace to move between, an `origin` that changed is a
 * mode that changed, which is what the `~` marker has always meant to a reader.
 */
function classifyDiffRow(
  skill: SkillConfig,
  prevKeySet: Set<string> | null,
  prevSourceMap: Map<string, string> | null,
): SkillDiffRow {
  const key = skillSlotKey(skill.id, skill.scope);
  const isNew = prevKeySet === null || !prevKeySet.has(key);
  const prevSource = prevSourceMap?.get(key);
  const modeChanged = !isNew && prevSource != null && prevSource !== skill.origin;
  if (modeChanged) {
    return { id: skill.id, source: skill.origin, status: "mode-changed" };
  }
  return { id: skill.id, source: skill.origin, status: isNew ? "added" : "unchanged" };
}

function classifyAgentDiffRow(
  agent: AgentScopeConfig,
  prevKeySet: Set<string> | null,
): AgentDiffRow {
  const isNew = prevKeySet === null || !prevKeySet.has(agentSlotKey(agent.name, agent.scope));
  return { name: agent.name, status: isNew ? "added" : "unchanged" };
}

function toRemovedSkillRow(skill: SkillConfig): SkillDiffRow {
  return { id: skill.id, source: skill.origin, status: "removed" };
}

function toRemovedAgentRow(agent: AgentScopeConfig): AgentDiffRow {
  return { name: agent.name, status: "removed" };
}
