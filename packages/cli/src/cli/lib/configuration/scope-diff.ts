import { partition } from "remeda";
import type { AgentScopeConfig, SkillConfig, SkillScope } from "../../types/config";
import type { AgentName, SkillId } from "../../types/index";
import { isActiveAt, isGlobalTombstone, type ScopedEntry } from "./scope-predicates";

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

/** One scope's share of a roster's diff: the entries listed with a status, then the removals. */
type ScopeEntries<Entry> = { listed: Entry[]; removed: Entry[] };

type RosterDiff<Entry> = Record<SkillScope, ScopeEntries<Entry>>;

/**
 * A tombstone occupies its (id, scope) slot without filling it: it silences a global install at
 * project scope. Slot checks count tombstones; removal and `~` read the active baseline only.
 */
export function computeScopeDiff(input: ScopeDiffInput): ScopeDiff {
  const { currentSkills, currentAgents, installedSkillConfigs, installedAgentConfigs, isInitMode } =
    input;

  const skills = diffRoster(currentSkills, installedSkillConfigs, (skill) => skill.id, isInitMode);
  const agents = diffRoster(
    currentAgents,
    installedAgentConfigs,
    (agent) => agent.name,
    isInitMode,
  );
  const skillRow = skillRowClassifier(installedSkillConfigs);
  const agentRow = agentRowClassifier(installedAgentConfigs);

  const projectSkillRows = rowsOf(skills.project, skillRow, toRemovedSkillRow);
  const globalSkillRows = rowsOf(skills.global, skillRow, toRemovedSkillRow);
  const projectAgentRows = rowsOf(agents.project, agentRow, toRemovedAgentRow);
  const globalAgentRows = rowsOf(agents.global, agentRow, toRemovedAgentRow);

  const hasContent = [projectSkillRows, globalSkillRows, projectAgentRows, globalAgentRows].some(
    (rows) => rows.length > 0,
  );

  return { projectSkillRows, globalSkillRows, projectAgentRows, globalAgentRows, hasContent };
}

function diffRoster<Entry extends ScopedEntry>(
  current: Entry[],
  installed: Entry[] | null,
  identityOf: (entry: Entry) => string,
  isInitMode: boolean,
): RosterDiff<Entry> {
  // The installs the baseline actually records; tombstones are not installs.
  const activeBaseline = (installed ?? []).filter((entry) => !entry.excluded);
  const vacated = vacatedInstalls(activeBaseline, current, identityOf);
  const projectEntries = current.filter((entry) => isActiveAt(entry, "project"));
  const claimedByProject = new Set(projectEntries.map(identityOf));
  // A vacated global the project claims is inherited: listed once under Global, never removed.
  const [inheritedGlobals, removedGlobals] = partition(
    vacated.filter((entry) => entry.scope === "global"),
    (entry) => claimedByProject.has(identityOf(entry)),
  );

  return {
    project: {
      listed: projectEntries,
      removed: vacated.filter((entry) => entry.scope === "project"),
    },
    global: {
      listed: [
        ...current.filter((entry) => isActiveAt(entry, "global")),
        ...inheritedGlobals,
        ...current.filter(isGlobalTombstone),
      ],
      removed: isInitMode ? [] : removedGlobals,
    },
  };
}

/** Baseline installs whose slot nothing in current, active or tombstone, occupies. */
function vacatedInstalls<Entry extends ScopedEntry>(
  activeBaseline: Entry[],
  current: Entry[],
  identityOf: (entry: Entry) => string,
): Entry[] {
  const slotOf = (entry: Entry) => slotKey(identityOf(entry), entry.scope);
  const occupiedSlots = new Set(current.map(slotOf));
  return activeBaseline.filter((install) => !occupiedSlots.has(slotOf(install)));
}

function rowsOf<Entry, Row>(
  entries: ScopeEntries<Entry>,
  toRow: (entry: Entry) => Row,
  toRemovedRow: (entry: Entry) => Row,
): Row[] {
  return [...entries.listed.map(toRow), ...entries.removed.map(toRemovedRow)];
}

/** The `(id, scope)` SLOT key this module diffs on, rather than the id alone. */
function slotKey(identity: string, scope: SkillScope | undefined): string {
  return `${identity}:${scope}`;
}

export function formatScopeTag(scope: SkillScope): "[G]" | "[P]" {
  return scope === "global" ? "[G]" : "[P]";
}

function skillRowClassifier(installed: SkillConfig[] | null): (skill: SkillConfig) => SkillDiffRow {
  const installedSlots = installed
    ? new Set(installed.map((skill) => slotKey(skill.id, skill.scope)))
    : null;
  const installedOriginBySlot = installed
    ? new Map(
        installed
          .filter((skill) => !skill.excluded)
          .map((skill) => [slotKey(skill.id, skill.scope), skill.origin]),
      )
    : null;
  return (skill) => classifySkillDiffRow(skill, installedSlots, installedOriginBySlot);
}

function agentRowClassifier(
  installed: AgentScopeConfig[] | null,
): (agent: AgentScopeConfig) => AgentDiffRow {
  const installedSlots = installed
    ? new Set(installed.map((agent) => slotKey(agent.name, agent.scope)))
    : null;
  return (agent) => classifyAgentDiffRow(agent, installedSlots);
}

/** Compares `origin`, which is where a skill's install mode is recorded. */
function classifySkillDiffRow(
  skill: SkillConfig,
  installedSlots: Set<string> | null,
  installedOriginBySlot: Map<string, string> | null,
): SkillDiffRow {
  const slot = slotKey(skill.id, skill.scope);
  const isNew = installedSlots === null || !installedSlots.has(slot);
  const installedOrigin = installedOriginBySlot?.get(slot);
  const modeChanged = !isNew && installedOrigin != null && installedOrigin !== skill.origin;
  if (modeChanged) {
    return { id: skill.id, source: skill.origin, status: "mode-changed" };
  }
  return { id: skill.id, source: skill.origin, status: isNew ? "added" : "unchanged" };
}

function classifyAgentDiffRow(
  agent: AgentScopeConfig,
  installedSlots: Set<string> | null,
): AgentDiffRow {
  const isNew = installedSlots === null || !installedSlots.has(slotKey(agent.name, agent.scope));
  return { name: agent.name, status: isNew ? "added" : "unchanged" };
}

function toRemovedSkillRow(skill: SkillConfig): SkillDiffRow {
  return { id: skill.id, source: skill.origin, status: "removed" };
}

function toRemovedAgentRow(agent: AgentScopeConfig): AgentDiffRow {
  return { name: agent.name, status: "removed" };
}
