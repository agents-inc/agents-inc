import os from "os";

import { isDeepEqual, omit, partition, pick } from "remeda";

import { loadProjectConfigFromDir } from "../configuration/project-config.js";
import { isActiveAt } from "../configuration/scope-predicates.js";
import { providerInUse } from "../installation/install-layout.js";
import { getCategoryDomain, getSkillDisplayName, matrix } from "../matrix/matrix-provider.js";
import { orderDomains } from "@workspace/compile";
import {
  SHARED_CONFIG_APPLY,
  SHARED_CONFIG_ARRIVALS,
  addedToGlobalSubAgents,
} from "../../utils/messages.js";
import { typedEntries, typedKeys, typedValues } from "../../utils/typed-object.js";

import type { InstallSelection } from "@workspace/compile/seed-to-config";
import type { AgentName } from "../../types/agents.js";
import type {
  AgentScopeConfig,
  ProjectConfig,
  SkillConfig,
  SkillScope,
} from "../../types/config.js";
import type { Category, Domain } from "../../types/matrix.js";
import type { SkillAssignment, SkillId } from "../../types/skills.js";
import type { StackAgentConfig } from "../../types/stacks.js";
import type { SeedPayload, SeedSkill } from "@workspace/matrix/seed";

/** What applying a shared configuration may not take away, split by reason. */
export type KeptFromRoundTrip = {
  /** Written here, so no shared configuration ever carried them. */
  authoredSkillIds: SkillId[];
  /** Named by the configuration but unplaceable by this catalogue. */
  unplaceableSkillIds: SkillId[];
};

/**
 * A kept skill's row displaced by the payload's own skill in a one-skill category. The skill stays
 * installed; the row goes.
 */
export type UnassignedRow = { skillId: SkillId; agentName: AgentName; category: Category };

export type ReconciledSharedConfig = {
  result: InstallSelection;
  kept: KeptFromRoundTrip;
  unassigned: UnassignedRow[];
};

export type ReconcileOptions = {
  decoded: InstallSelection;
  installed: ProjectConfig | null;
  authoredHere: ReadonlySet<SkillId>;
  /** `SeedMapping.skippedSkillIds` as the caller already reported them. */
  unplaceable: ReadonlySet<string>;
};

const NOTHING_KEPT: KeptFromRoundTrip = {
  authoredSkillIds: [],
  unplaceableSkillIds: [],
};

/**
 * Puts back skills written here and ids this catalogue cannot place. Restored into the result,
 * not excused at the writer, because the removal diff drives deletion; rows and domain come too.
 */
export function reconcileSharedConfig(options: ReconcileOptions): ReconciledSharedConfig {
  const { decoded, installed } = options;
  if (!installed) return nothingToReconcile(decoded);

  const keptSkills = skillsToKeep(options, installed);
  if (keptSkills.length === 0) return nothingToReconcile(decoded);

  const { result, unassigned } = withKeptEntries(decoded, installed, keptSkills);
  return { result, kept: describeKept(options, keptSkills), unassigned };
}

function nothingToReconcile(decoded: InstallSelection): ReconciledSharedConfig {
  return { result: decoded, kept: NOTHING_KEPT, unassigned: [] };
}

/** A tombstone is neither: nothing is installed, so nothing needs protecting. */
function skillsToKeep(options: ReconcileOptions, installed: ProjectConfig): SkillConfig[] {
  const named = new Set(options.decoded.skills.map((skill) => skill.id));

  return installed.skills.filter(
    (skill) => !skill.excluded && !named.has(skill.id) && mayNotRemove(skill, options),
  );
}

function mayNotRemove(skill: SkillConfig, options: ReconcileOptions): boolean {
  return options.authoredHere.has(skill.id) || options.unplaceable.has(skill.id);
}

type KeptReason = "authored" | "unplaceable";

function describeKept(options: ReconcileOptions, keptSkills: SkillConfig[]): KeptFromRoundTrip {
  const idsKeptFor = (reason: KeptReason): SkillId[] =>
    keptSkills.filter((skill) => reasonKept(skill, options) === reason).map((skill) => skill.id);

  return {
    authoredSkillIds: idsKeptFor("authored"),
    unplaceableSkillIds: idsKeptFor("unplaceable"),
  };
}

/** Where both apply, authorship wins: `update` can resolve an unplaceable id. */
function reasonKept(skill: SkillConfig, options: ReconcileOptions): KeptReason {
  return options.authoredHere.has(skill.id) ? "authored" : "unplaceable";
}

function withKeptEntries(
  decoded: InstallSelection,
  installed: ProjectConfig,
  keptSkills: SkillConfig[],
): Pick<ReconciledSharedConfig, "result" | "unassigned"> {
  const withSkills: InstallSelection = {
    ...decoded,
    skills: [...decoded.skills, ...keptSkills],
    selectedDomains: withKeptDomains(decoded.selectedDomains, keptSkills),
  };
  const { assignedStack, unassigned } = withKeptStackRows(decoded.assignedStack, installed.stack, {
    keptSkillIds: new Set(keptSkills.map((skill) => skill.id)),
    survivingAgents: new Set(decoded.selectedAgents),
  });
  return { result: { ...withSkills, assignedStack }, unassigned };
}

function withKeptDomains(selected: Domain[], keptSkills: SkillConfig[]): Domain[] {
  const keptDomains = keptSkills.flatMap((skill) => domainOfSkill(skill.id) ?? []);
  const missing = keptDomains.filter((domain) => !selected.includes(domain));
  if (missing.length === 0) return selected;

  return orderDomains([...selected, ...new Set(missing)]);
}

/** Undefined for an entry the loaded source cannot resolve; `edit` reports those itself. */
function domainOfSkill(skillId: SkillId): Domain | undefined {
  const category = matrix.skills[skillId]?.category;
  return category === undefined ? undefined : getCategoryDomain(category);
}

type KeptRowFilter = {
  keptSkillIds: ReadonlySet<SkillId>;
  survivingAgents: ReadonlySet<AgentName>;
};

type KeptRows = {
  assignedStack: Partial<Record<AgentName, StackAgentConfig>>;
  unassigned: UnassignedRow[];
};

/**
 * A kept row joins the payload's under its category, except in a one-skill category the payload
 * fills, where it is returned as unassigned.
 */
function withKeptStackRows(
  assigned: Partial<Record<AgentName, StackAgentConfig>>,
  installedStack: Partial<Record<AgentName, StackAgentConfig>> | undefined,
  filter: KeptRowFilter,
): KeptRows {
  const isKept = (_category: Category, row: SkillAssignment): boolean =>
    filter.keptSkillIds.has(row.id);

  return typedEntries<AgentName, StackAgentConfig>(installedStack ?? {})
    .filter(([agent]) => filter.survivingAgents.has(agent))
    .reduce<KeptRows>(
      (carried, [agent, agentStack]) =>
        withAgentKeptRows(carried, agent, rowsWhere(agentStack, isKept), assigned[agent]),
      { assignedStack: assigned, unassigned: [] },
    );
}

function withAgentKeptRows(
  carried: KeptRows,
  agent: AgentName,
  keptRows: [Category, SkillAssignment][],
  payloadRows: StackAgentConfig | undefined,
): KeptRows {
  const filled = filledExclusiveCategories(payloadRows);
  const [displaced, joining] = partition(keptRows, ([category]) => filled.has(category));

  return {
    assignedStack: withAppendedRows(carried.assignedStack, agent, joining),
    unassigned: [
      ...carried.unassigned,
      ...displaced.map(([category, row]) => ({ skillId: row.id, agentName: agent, category })),
    ],
  };
}

/** The decode carries sub-agents only through placed skills, so an unplaceable skill's assignees return. */
export function withUnplaceableAssignees(
  decoded: InstallSelection,
  installed: ProjectConfig | null,
  payload: SeedPayload,
  unplaceable: ReadonlySet<string>,
): InstallSelection {
  if (!installed) return decoded;

  const assigned = assigneesOfHeld(payload, installed, unplaceable);
  const selected = new Set(decoded.selectedAgents);
  const leftOutThoughAssigned = (agent: AgentScopeConfig): boolean =>
    !agent.excluded && assigned.has(agent.name) && !selected.has(agent.name);

  const assignees = installed.agents.filter(leftOutThoughAssigned);
  if (assignees.length === 0) return decoded;

  return {
    ...decoded,
    selectedAgents: [...decoded.selectedAgents, ...assignees.map((agent) => agent.name)],
    agentConfigs: [...decoded.agentConfigs, ...assignees],
  };
}

/** Less any the payload switches off. */
function assigneesOfHeld(
  payload: SeedPayload,
  installed: ProjectConfig,
  unplaceable: ReadonlySet<string>,
): Set<string> {
  const held = new Set<string>(
    installed.skills.filter((skill) => !skill.excluded).map((skill) => skill.id),
  );
  const isHeldUnplaceable = ([id]: [string, SeedSkill]): boolean =>
    unplaceable.has(id) && held.has(id);
  const isNotSwitchedOff = (name: string): boolean => payload.agents[name]?.on !== false;

  return new Set(
    typedEntries<string, SeedSkill>(payload.skills)
      .filter(isHeldUnplaceable)
      .flatMap(([, skill]) => typedKeys<string>(skill.assignments))
      .filter(isNotSwitchedOff),
  );
}

export type InstalledGlobal = Pick<ProjectConfig, "skills" | "agents" | "stack">;

/** Read from the global config itself, not a project's possibly older inlined copy. */
export async function readInstalledGlobal(projectDir: string): Promise<InstalledGlobal | null> {
  const loaded = await loadProjectConfigFromDir(os.homedir(), providerInUse(projectDir));
  return loaded?.config ?? null;
}

type GlobalEntries = { skillIds: SkillId[]; agentNames: AgentName[] };

/** A held global sub-agent an arriving skill's row joins, and the skills those rows bring. */
export type JoinedAgent = { agentName: AgentName; skillIds: SkillId[] };

export type HeldGlobal = {
  result: InstallSelection;
  installed: GlobalEntries;
  keptAsInstalled: GlobalEntries;
  joined: JoinedAgent[];
};

const NO_GLOBAL_ENTRIES: GlobalEntries = { skillIds: [], agentNames: [] };

/** A project `--from` only adds to the global install: every global entry it holds stays as held. */
export function holdInstalledGlobal(
  decoded: InstallSelection,
  installed: InstalledGlobal | null,
): HeldGlobal {
  if (!installed) {
    return {
      result: decoded,
      installed: NO_GLOBAL_ENTRIES,
      keptAsInstalled: NO_GLOBAL_ENTRIES,
      joined: [],
    };
  }

  const heldSkills = activeGlobalById(installed.skills, (skill) => skill.id);
  const heldAgents = activeGlobalById(installed.agents, (agent) => agent.name);
  const skills = pairWithHeld(decoded.skills, heldSkills, (skill) => skill.id);
  const agents = pairWithHeld(decoded.agentConfigs, heldAgents, (agent) => agent.name);
  const namedSkillIds = skills.map(({ named }) => named.id);
  const namedAgentNames = agents.map(({ named }) => named.name);
  const { assignedStack, joined } = withHeldRows(decoded.assignedStack, installed.stack, {
    agentNames: namedAgentNames,
    skippedSkillIds: new Set(namedSkillIds),
  });
  const joinedNames = new Set(joined.map(({ agentName }) => agentName));

  const restatesSkill = ({ named, held }: Held<SkillConfig>): boolean =>
    named.origin === held.origin;
  const restatesAgent = ({ named, held }: Held<AgentScopeConfig>): boolean =>
    named.model === held.model &&
    named.codexModel === held.codexModel &&
    named.effort === held.effort &&
    sameAssignments(decoded.assignedStack[named.name], assignedStack[named.name]);
  // A sub-agent a row joins is changed, so it is named as added to rather than as kept.
  const keptAsIs = (pair: Held<AgentScopeConfig>): boolean =>
    !restatesAgent(pair) && !joinedNames.has(pair.named.name);

  return {
    result: {
      ...decoded,
      skills: decoded.skills.map(asHeld(skills)),
      agentConfigs: decoded.agentConfigs.map(asHeld(agents)),
      assignedStack,
    },
    installed: { skillIds: namedSkillIds, agentNames: namedAgentNames },
    keptAsInstalled: {
      skillIds: skills.filter((pair) => !restatesSkill(pair)).map(({ named }) => named.id),
      agentNames: agents.filter(keptAsIs).map(({ named }) => named.name),
    },
    joined,
  };
}

/** For the destructive `edit --from`: a project may not remove global entries. */
export function restoreInstalledGlobal(
  decoded: InstallSelection,
  installed: InstalledGlobal | null,
): HeldGlobal {
  const held = holdInstalledGlobal(decoded, installed);
  if (!installed) return held;

  const omitted = omittedGlobal(held.result, installed);
  const { skillIds, agentNames } = held.keptAsInstalled;
  return {
    ...held,
    result: withOmittedGlobal(held.result, installed, omitted),
    keptAsInstalled: {
      skillIds: [...skillIds, ...omitted.skills.map((skill) => skill.id)],
      agentNames: [...agentNames, ...omitted.agents.map((agent) => agent.name)],
    },
  };
}

function activeGlobalById<Entry extends SkillConfig | AgentScopeConfig, Key extends string>(
  entries: Entry[],
  keyOf: (entry: Entry) => Key,
): Map<Key, Entry> {
  return new Map(
    entries.filter((entry) => isActiveAt(entry, "global")).map((entry) => [keyOf(entry), entry]),
  );
}

type Held<Entry> = { named: Entry; held: Entry };

function asHeld<Entry>(pairs: Held<Entry>[]): (entry: Entry) => Entry {
  const heldFor = new Map(pairs.map(({ named, held }) => [named, held]));
  return (entry) => heldFor.get(entry) ?? entry;
}

function pairWithHeld<Entry extends SkillConfig | AgentScopeConfig, Key extends string>(
  decoded: Entry[],
  heldByKey: ReadonlyMap<Key, Entry>,
  keyOf: (entry: Entry) => Key,
): Held<Entry>[] {
  return decoded.flatMap((named) => {
    const held = heldByKey.get(keyOf(named));
    return held !== undefined && isActiveAt(named, "global") ? [{ named, held }] : [];
  });
}

/** Row order is not part of what a sub-agent loads. */
export function sameAssignments(
  left: StackAgentConfig | undefined,
  right: StackAgentConfig | undefined,
): boolean {
  return isDeepEqual(assignmentKeys(left), assignmentKeys(right));
}

function assignmentKeys(agentStack: StackAgentConfig | undefined): string[] {
  return typedEntries<Category, SkillAssignment[]>(agentStack ?? {})
    .flatMap(([category, assignments]) =>
      assignments.map((row) => `${category}/${row.id}/${row.preloaded === true}`),
    )
    .sort();
}

function withInstalledRows(
  assigned: Partial<Record<AgentName, StackAgentConfig>>,
  installedStack: InstalledGlobal["stack"],
  agentNames: AgentName[],
): Partial<Record<AgentName, StackAgentConfig>> {
  return { ...omit(assigned, agentNames), ...pick(installedStack ?? {}, agentNames) };
}

type HeldAgents = { agentNames: AgentName[]; skippedSkillIds: ReadonlySet<SkillId> };

type HeldStack = Pick<HeldGlobal, "joined"> & {
  assignedStack: Partial<Record<AgentName, StackAgentConfig>>;
};

type AgentArrival = { agentName: AgentName; rows: [Category, SkillAssignment][] };

/** Existing rows stay first and unchanged; arriving skills bring their rows after them. */
function withHeldRows(
  assigned: Partial<Record<AgentName, StackAgentConfig>>,
  installedStack: InstalledGlobal["stack"],
  held: HeldAgents,
): HeldStack {
  const asInstalled = withInstalledRows(assigned, installedStack, held.agentNames);
  const arrivals = held.agentNames.map((agentName): AgentArrival => ({
    agentName,
    rows: arrivingRows(assigned[agentName], asInstalled[agentName], held.skippedSkillIds),
  }));

  return {
    assignedStack: arrivals.reduce(
      (stack, { agentName, rows }) => withAppendedRows(stack, agentName, rows),
      asInstalled,
    ),
    joined: arrivals.filter(({ rows }) => rows.length > 0).map(asJoined),
  };
}

function asJoined({ agentName, rows }: AgentArrival): JoinedAgent {
  return { agentName, skillIds: rows.map(([, row]) => row.id) };
}

function arrivingRows(
  stated: StackAgentConfig | undefined,
  installed: StackAgentConfig | undefined,
  skippedSkillIds: ReadonlySet<SkillId>,
): [Category, SkillAssignment][] {
  const alreadyLoaded = new Set(rowIds(installed));
  const filled = filledExclusiveCategories(installed);
  const arrives = (category: Category, row: SkillAssignment): boolean =>
    !skippedSkillIds.has(row.id) && !alreadyLoaded.has(row.id) && !filled.has(category);

  return rowsWhere(stated, arrives);
}

function rowIds(agentStack: StackAgentConfig | undefined): SkillId[] {
  return typedValues<Category, SkillAssignment[]>(agentStack ?? {}).flatMap((rows) =>
    rows.map((row) => row.id),
  );
}

/** An undeclared category is not exclusive (see `propagate.ts`). */
function filledExclusiveCategories(agentStack: StackAgentConfig | undefined): Set<Category> {
  const isExclusive = (category: Category): boolean =>
    matrix.categories[category]?.exclusive === true;

  return new Set(
    typedEntries<Category, SkillAssignment[]>(agentStack ?? {})
      .filter(([category, rows]) => rows.length > 0 && isExclusive(category))
      .map(([category]) => category),
  );
}

function withAppendedRows(
  stack: Partial<Record<AgentName, StackAgentConfig>>,
  agentName: AgentName,
  added: [Category, SkillAssignment][],
): Partial<Record<AgentName, StackAgentConfig>> {
  if (added.length === 0) return stack;
  return { ...stack, [agentName]: appendRows(stack[agentName] ?? {}, added) };
}

function rowsWhere(
  agentStack: StackAgentConfig | undefined,
  keep: (category: Category, row: SkillAssignment) => boolean,
): [Category, SkillAssignment][] {
  return typedEntries<Category, SkillAssignment[]>(agentStack ?? {}).flatMap(([category, rows]) =>
    rows
      .filter((row) => keep(category, row))
      .map((row): [Category, SkillAssignment] => [category, row]),
  );
}

function appendRows(
  agentStack: StackAgentConfig,
  added: [Category, SkillAssignment][],
): StackAgentConfig {
  return added.reduce<StackAgentConfig>(
    (rows, [category, row]) => ({ ...rows, [category]: [...(rows[category] ?? []), row] }),
    agentStack,
  );
}

type OmittedGlobal = { skills: SkillConfig[]; agents: AgentScopeConfig[] };

function omittedGlobal(result: InstallSelection, installed: InstalledGlobal): OmittedGlobal {
  const namedSkillIds = new Set(result.skills.map((skill) => skill.id));
  const namedAgentNames = new Set(result.agentConfigs.map((agent) => agent.name));

  return {
    skills: [...activeGlobalById(installed.skills, (skill) => skill.id).values()].filter(
      (skill) => !namedSkillIds.has(skill.id),
    ),
    agents: [...activeGlobalById(installed.agents, (agent) => agent.name).values()].filter(
      (agent) => !namedAgentNames.has(agent.name),
    ),
  };
}

function withOmittedGlobal(
  result: InstallSelection,
  installed: InstalledGlobal,
  omitted: OmittedGlobal,
): InstallSelection {
  const omittedAgentNames = omitted.agents.map((agent) => agent.name);

  return {
    ...result,
    skills: [...result.skills, ...omitted.skills],
    agentConfigs: [...result.agentConfigs, ...omitted.agents],
    selectedAgents: [...new Set([...result.selectedAgents, ...omittedAgentNames])],
    selectedDomains: withKeptDomains(result.selectedDomains, omitted.skills),
    assignedStack: withInstalledRows(result.assignedStack, installed.stack, omittedAgentNames),
  };
}

export function notInstalledGlobally<Entry extends { id: SkillId }>(
  entries: Entry[],
  held: HeldGlobal,
): Entry[] {
  const installed = new Set(held.installed.skillIds);
  return entries.filter((entry) => !installed.has(entry.id));
}

export type ArrivingEntries = { skillIds: SkillId[]; agentNames: AgentName[] };

export type Arrivals = Record<SkillScope, ArrivingEntries>;

export function arrivalsByScope(skills: SkillConfig[], agents: AgentScopeConfig[]): Arrivals {
  const landingAt = (scope: SkillScope): ArrivingEntries => ({
    skillIds: skills.filter((skill) => isActiveAt(skill, scope)).map((skill) => skill.id),
    agentNames: agents.filter((agent) => isActiveAt(agent, scope)).map((agent) => agent.name),
  });
  return { project: landingAt("project"), global: landingAt("global") };
}

function installArrivals(held: HeldGlobal): Arrivals {
  const installedSkillIds = new Set(held.installed.skillIds);
  const installedAgentNames = new Set(held.installed.agentNames);
  return arrivalsByScope(
    held.result.skills.filter((skill) => !installedSkillIds.has(skill.id)),
    held.result.agentConfigs.filter((agent) => !installedAgentNames.has(agent.name)),
  );
}

export function installPlanLines(held: HeldGlobal): string[] {
  return [
    ...arrivalLines(installArrivals(held)),
    ...scopeLines(SHARED_CONFIG_ARRIVALS.SKIPPED_HEADING, {
      skillIds: held.installed.skillIds,
      agentNames: [],
    }),
    ...joinedStatement(held),
  ];
}

export function joinedStatement(held: HeldGlobal): string[] {
  return held.joined.length === 0 ? [] : [addedToGlobalSubAgents(held.joined)];
}

export function skillLabel(skillId: SkillId): string {
  const displayName = getSkillDisplayName(skillId);
  return displayName === skillId ? skillId : `${displayName} (${skillId})`;
}

export function arrivalLines(arrivals: Arrivals): string[] {
  return [
    ...scopeLines(SHARED_CONFIG_ARRIVALS.PROJECT_HEADING, arrivals.project),
    ...scopeLines(SHARED_CONFIG_ARRIVALS.GLOBAL_HEADING, arrivals.global),
  ];
}

function scopeLines(heading: string, entries: ArrivingEntries): string[] {
  const groups = [
    { label: SHARED_CONFIG_APPLY.SKILLS_HEADING, items: entries.skillIds.map(skillLabel) },
    { label: SHARED_CONFIG_APPLY.AGENTS_HEADING, items: entries.agentNames },
  ].filter((group) => group.items.length > 0);
  if (groups.length === 0) return [];

  return [
    heading,
    ...groups.flatMap((group) => [`  ${group.label}`, ...group.items.map((item) => `    ${item}`)]),
  ];
}
