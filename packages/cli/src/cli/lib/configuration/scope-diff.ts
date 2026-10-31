import { difference, indexBy, partition, unique } from "remeda";
import type { AgentScopeConfig, SkillConfig, SkillScope } from "../../types/config";
import type { AgentName, SkillId, StackAgentConfig } from "../../types/index";
import { typedValues } from "../../utils/typed-object";
import { isActiveAt, isGlobalTombstone, type ScopedEntry } from "./scope-predicates";

export type ScopeDiffInput = {
  currentSkills: SkillConfig[];
  currentAgents: AgentScopeConfig[];
  installedSkillConfigs: SkillConfig[] | null;
  installedAgentConfigs: AgentScopeConfig[] | null;
  isInitMode: boolean;
  /** Skills whose files the run writes over where they stand. */
  overwrittenSkillIds?: ReadonlySet<SkillId>;
  /** Sub-agents that keep their slot and still change. */
  changedAgentNames?: ReadonlySet<AgentName>;
};

export type DiffRowStatus =
  "added" | "mode-changed" | "overwritten" | "changed" | "removed" | "unchanged";

export type SkillDiffRow = {
  id: SkillId;
  source: string;
  status: Exclude<DiffRowStatus, "changed">;
  /** The name the entry the row was drawn from records; absent where it records none. */
  displayName?: string;
};

export type AgentDiffRow = {
  name: AgentName;
  status: Exclude<DiffRowStatus, "mode-changed" | "overwritten">;
};

export type ScopeDiff = {
  projectSkillRows: SkillDiffRow[];
  globalSkillRows: SkillDiffRow[];
  projectAgentRows: AgentDiffRow[];
  globalAgentRows: AgentDiffRow[];
  hasContent: boolean;
};

const NOTHING: ReadonlySet<never> = new Set();

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
  const overwritten = input.overwrittenSkillIds ?? NOTHING;
  const changed = input.changedAgentNames ?? NOTHING;

  const skills = diffRoster(currentSkills, installedSkillConfigs, (skill) => skill.id, isInitMode);
  const agents = diffRoster(
    currentAgents,
    installedAgentConfigs,
    (agent) => agent.name,
    isInitMode,
  );
  const skillRow = skillRowClassifier(installedSkillConfigs, overwritten);
  const agentRow = agentRowClassifier(installedAgentConfigs, changed);

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

function skillRowClassifier(
  installed: SkillConfig[] | null,
  overwritten: ReadonlySet<SkillId>,
): (skill: SkillConfig) => SkillDiffRow {
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
  return (skill) => ({
    id: skill.id,
    source: skill.origin,
    status: skillStatus(skill, installedSlots, installedOriginBySlot, overwritten),
    ...recordedNameOf(skill),
  });
}

function recordedNameOf(skill: SkillConfig): Pick<SkillDiffRow, "displayName"> {
  return skill.displayName === undefined ? {} : { displayName: skill.displayName };
}

function agentRowClassifier(
  installed: AgentScopeConfig[] | null,
  changed: ReadonlySet<AgentName>,
): (agent: AgentScopeConfig) => AgentDiffRow {
  const installedSlots = installed
    ? new Set(installed.map((agent) => slotKey(agent.name, agent.scope)))
    : null;
  return (agent) => ({ name: agent.name, status: agentStatus(agent, installedSlots, changed) });
}

/**
 * Compares `origin`, which is where a skill's install mode is recorded. An overwrite outranks a
 * mode change: a copy its plugin replaces is deleted, not merely switched. A mask is never written.
 */
function skillStatus(
  skill: SkillConfig,
  installedSlots: Set<string> | null,
  installedOriginBySlot: Map<string, string> | null,
  overwritten: ReadonlySet<SkillId>,
): SkillDiffRow["status"] {
  const slot = slotKey(skill.id, skill.scope);
  if (installedSlots === null || !installedSlots.has(slot)) return "added";
  if (!skill.excluded && overwritten.has(skill.id)) return "overwritten";

  const installedOrigin = installedOriginBySlot?.get(slot);
  const modeChanged = installedOrigin != null && installedOrigin !== skill.origin;
  return modeChanged ? "mode-changed" : "unchanged";
}

/** A mask is never the sub-agent that changes: its active half is. */
function agentStatus(
  agent: AgentScopeConfig,
  installedSlots: Set<string> | null,
  changed: ReadonlySet<AgentName>,
): AgentDiffRow["status"] {
  const isNew = installedSlots === null || !installedSlots.has(slotKey(agent.name, agent.scope));
  if (isNew) return "added";
  return !agent.excluded && changed.has(agent.name) ? "changed" : "unchanged";
}

function toRemovedSkillRow(skill: SkillConfig): SkillDiffRow {
  return { id: skill.id, source: skill.origin, status: "removed", ...recordedNameOf(skill) };
}

function toRemovedAgentRow(agent: AgentScopeConfig): AgentDiffRow {
  return { name: agent.name, status: "removed" };
}

/** The entry each skill is named by, as a panel row drawn from that entry names it. */
export type NamedBy = Partial<Record<SkillId, Pick<SkillConfig, "id" | "displayName">>>;

export function namedByActiveEntries(
  entries: readonly Pick<SkillConfig, "id" | "displayName" | "excluded">[],
): NamedBy {
  return indexBy(
    entries.filter((entry) => !entry.excluded),
    ({ id }) => id,
  );
}

/** A sub-agent that keeps its slot and still changes: the skills its rows gain and lose, and its retunes. */
export type AgentChange = {
  name: AgentName;
  scope: SkillScope;
  gains: SkillId[];
  loses: SkillId[];
  settings: SettingChange[];
  /** The run's entry for a skill it gains, the install's for one it loses. */
  namedBy?: NamedBy;
};

/** `undefined` where the setting is left to its default. */
export type SettingChange = {
  setting: AgentSetting;
  from: string | undefined;
  to: string | undefined;
};

type AgentSetting = "model" | "codex model" | "effort";

const AGENT_SETTINGS: ReadonlyArray<
  [AgentSetting, (agent: AgentScopeConfig) => string | undefined]
> = [
  ["model", (agent) => agent.model],
  ["codex model", (agent) => agent.codexModel],
  ["effort", (agent) => agent.effort],
];

/** One sub-agent as a config records it: its entry and its skill rows. */
export type AgentState = { agent: AgentScopeConfig; rows: StackAgentConfig | undefined };

type AgentsAndRows = {
  agents: AgentScopeConfig[];
  skills: SkillConfig[];
  stack?: Partial<Record<string, StackAgentConfig>>;
};

/** How each named sub-agent moves between two configs; one either config lacks is not named. */
export function agentChangesAmong(
  names: readonly AgentName[],
  before: AgentsAndRows,
  after: AgentsAndRows,
): AgentChange[] {
  return names.flatMap((name) => {
    const was = agentStateIn(before, name);
    const is = agentStateIn(after, name);
    if (was === undefined || is === undefined) return [];
    return [namedByEntries(agentChange(was, is), before.skills, after.skills)];
  });
}

function namedByEntries(
  change: AgentChange,
  before: SkillConfig[],
  after: SkillConfig[],
): AgentChange {
  const namedBy = {
    ...activeEntriesOf(change.loses, before),
    ...activeEntriesOf(change.gains, after),
  };
  return { ...change, namedBy };
}

function activeEntriesOf(skillIds: readonly SkillId[], skills: SkillConfig[]): NamedBy {
  return namedByActiveEntries(skills.filter((entry) => skillIds.includes(entry.id)));
}

/** Its active entry, never the mask a project's own copy leaves; `undefined` where none is. */
function agentStateIn(config: AgentsAndRows, name: AgentName): AgentState | undefined {
  const agent = config.agents.find((entry) => entry.name === name && !entry.excluded);
  return agent === undefined ? undefined : { agent, rows: config.stack?.[name] };
}

export function agentChange(before: AgentState, after: AgentState): AgentChange {
  const beforeIds = assignedSkillIds(before.rows);
  const afterIds = assignedSkillIds(after.rows);

  return {
    name: after.agent.name,
    scope: after.agent.scope,
    gains: difference(afterIds, beforeIds),
    loses: difference(beforeIds, afterIds),
    settings: settingChanges(before.agent, after.agent),
  };
}

function settingChanges(before: AgentScopeConfig, after: AgentScopeConfig): SettingChange[] {
  return AGENT_SETTINGS.filter(([, read]) => read(before) !== read(after)).map(
    ([setting, read]) => ({ setting, from: read(before), to: read(after) }),
  );
}

function assignedSkillIds(rows: StackAgentConfig | undefined): SkillId[] {
  return unique(typedValues(rows ?? {}).flatMap((assignments) => assignments.map(({ id }) => id)));
}
