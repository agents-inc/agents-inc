import type { AgentScopeConfig, SkillConfig, SkillScope } from "../../types/config";
import type { AgentName, SkillId } from "../../types/index";

export type ScopeDiffInput = {
  currentSkills: SkillConfig[];
  currentAgents: AgentScopeConfig[];
  installedSkillConfigs: SkillConfig[] | null;
  installedAgentConfigs: AgentScopeConfig[] | null;
  isInitMode: boolean;
};

export type DiffRowStatus = "added" | "source-changed" | "removed" | "unchanged";

export type SkillDiffRow = {
  id: SkillId;
  source: string;
  status: DiffRowStatus;
};

export type AgentDiffRow = {
  name: AgentName;
  status: Exclude<DiffRowStatus, "source-changed">;
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
 * is silenced at project scope" (D-223 dual-scope indicator). Treating the slot
 * as occupied — for both the previous-key set (isNew detection) and removal
 * (slot-occupancy match) — prevents a dual-scope G→P toggle from rendering a
 * spurious `-` at Global (D-230) or a spurious `+` at Global on the next edit
 * when the stored tombstone is re-read (D-232). See D-225 investigation 09 for
 * the full derivation; source-change (`~`) tracking filters to active baseline
 * entries because tombstones don't represent a live install source.
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
    ? new Set(installedSkillConfigs.map((s) => `${s.id}:${s.scope}`))
    : null;
  const prevSourceMap = installedSkillConfigs
    ? new Map(
        installedSkillConfigs
          .filter((s) => !s.excluded)
          .map((s) => [`${s.id}:${s.scope}`, s.source]),
      )
    : null;
  const prevAgentKeySet = installedAgentConfigs
    ? new Set(installedAgentConfigs.map((a) => `${a.name}:${a.scope}`))
    : null;

  // Active baseline globals that are overridden at project scope without a
  // tombstone in current state — a historical no-tombstone dual-scope shape.
  // Current tombstones are handled directly via `uniqueExcludedGlobalSkills`.
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

  // Slot-occupancy match: a baseline entry at (id, scope) is considered
  // removed only if nothing — active OR tombstone — occupies that slot in
  // current. A current tombstone at the same key keeps the slot occupied
  // (dual-scope indicator, not a removal). See D-230 / D-232.
  const removedSkills = installedSkillConfigs
    ? installedSkillConfigs.filter(
        (s) => !currentSkills.some((c) => c.id === s.id && c.scope === s.scope),
      )
    : [];
  const removedAgents = installedAgentConfigs
    ? installedAgentConfigs.filter(
        (a) => !currentAgents.some((c) => c.name === a.name && c.scope === a.scope),
      )
    : [];

  // `uniqueExcludedGlobalSkills` dedups the current tombstone row against any
  // inherited-global entry for the same id so the Global section never shows
  // two rows for the same skill. Under the slot-occupancy removal match above,
  // a current tombstone at (id, global) keeps the slot occupied and therefore
  // cannot collide with the removed-global rows — no further dedup needed there.
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

  const removedGlobalSkills = isInitMode ? [] : removedSkills.filter((s) => s.scope === "global");
  const removedProjectSkills = removedSkills.filter((s) => s.scope === "project");
  const removedGlobalAgents = isInitMode ? [] : removedAgents.filter((a) => a.scope === "global");
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

export type ScopeBadges = {
  scope: SkillScope | undefined;
  secondaryScope: SkillScope | undefined;
};

/** Bracketed scope badge: `[G]` for global, `[P]` for project. */
export function formatScopeTag(scope: SkillScope): "[G]" | "[P]" {
  return scope === "global" ? "[G]" : "[P]";
}

/**
 * D-223: derives the primary + secondary scope badges for a row from its active
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

/** Classifies an active skill entry against the baseline: added, source-changed, or unchanged. */
function classifyDiffRow(
  skill: SkillConfig,
  prevKeySet: Set<string> | null,
  prevSourceMap: Map<string, string> | null,
): SkillDiffRow {
  const key = `${skill.id}:${skill.scope}`;
  const isNew = prevKeySet === null || !prevKeySet.has(key);
  const prevSource = prevSourceMap?.get(key);
  const sourceChanged = !isNew && prevSource != null && prevSource !== skill.source;
  if (sourceChanged) {
    return { id: skill.id, source: skill.source, status: "source-changed" };
  }
  return { id: skill.id, source: skill.source, status: isNew ? "added" : "unchanged" };
}

function classifyAgentDiffRow(
  agent: AgentScopeConfig,
  prevKeySet: Set<string> | null,
): AgentDiffRow {
  const isNew = prevKeySet === null || !prevKeySet.has(`${agent.name}:${agent.scope}`);
  return { name: agent.name, status: isNew ? "added" : "unchanged" };
}

function toRemovedSkillRow(skill: SkillConfig): SkillDiffRow {
  return { id: skill.id, source: skill.source, status: "removed" };
}

function toRemovedAgentRow(agent: AgentScopeConfig): AgentDiffRow {
  return { name: agent.name, status: "removed" };
}
