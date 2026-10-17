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
 * A tombstone occupies its (id, scope) slot without filling it: it silences a global install at
 * project scope. Slot checks count tombstones; removal and `~` read the active baseline only.
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

  // The installs the baseline actually records; tombstones are not installs.
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

  // Removed only if nothing, active or tombstone, occupies the slot in current. A baseline
  // tombstone is never a removal: it masks an install rather than being one.
  const removedSkills = activeSkillBaseline.filter(
    (s) => !currentSkills.some((c) => c.id === s.id && c.scope === s.scope),
  );
  const removedAgents = activeAgentBaseline.filter(
    (a) => !currentAgents.some((c) => c.name === a.name && c.scope === a.scope),
  );

  // Deduped against the inherited set: an inherited global claimed without a tombstone would
  // otherwise land under Global twice.
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

/** The `(id, scope)` SLOT key this module diffs on, rather than the id alone. */
function skillSlotKey(id: SkillId, scope: SkillScope | undefined): string {
  return `${id}:${scope}`;
}

function agentSlotKey(name: AgentName, scope: SkillScope | undefined): string {
  return `${name}:${scope}`;
}

export function formatScopeTag(scope: SkillScope): "[G]" | "[P]" {
  return scope === "global" ? "[G]" : "[P]";
}

/** Compares `origin`, which is where a skill's install mode is recorded. */
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
