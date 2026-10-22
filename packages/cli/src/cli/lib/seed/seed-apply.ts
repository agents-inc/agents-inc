import os from "os";

import { isDeepEqual, omit, partition, pick } from "remeda";

import { loadProjectConfigFromDir } from "../configuration/project-config.js";
import { isActiveAt } from "../configuration/scope-predicates.js";
import { providerInUse } from "../installation/install-layout.js";
import { getCategoryDomain, matrix } from "../matrix/matrix-provider.js";
import { orderDomains } from "@workspace/compile";
import { addedToGlobalSubAgents } from "../../utils/messages.js";
import { typedEntries, typedValues } from "../../utils/typed-object.js";

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

export type InstalledGlobal = Pick<ProjectConfig, "skills" | "agents" | "stack">;

/** Read from the global config itself, not a project's possibly older inlined copy. */
export async function readInstalledGlobal(projectDir: string): Promise<InstalledGlobal | null> {
  const loaded = await loadProjectConfigFromDir(os.homedir(), providerInUse(projectDir));
  return loaded?.config ?? null;
}

type Entries = { skillIds: SkillId[]; agentNames: AgentName[] };

/** A held global sub-agent an arriving skill's row joins, and the skills those rows bring. */
export type JoinedAgent = { agentName: AgentName; skillIds: SkillId[] };

export type HeldGlobal = {
  result: InstallSelection;
  installed: Entries;
  keptAsInstalled: Entries;
  joined: JoinedAgent[];
};

const NO_GLOBAL_ENTRIES: Entries = { skillIds: [], agentNames: [] };

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

  return {
    result: {
      ...decoded,
      skills: decoded.skills.map(asHeld(skills)),
      agentConfigs: decoded.agentConfigs.map(asHeld(agents)),
      assignedStack,
    },
    installed: { skillIds: namedSkillIds, agentNames: namedAgentNames },
    keptAsInstalled: {
      skillIds: skillsKeptAsInstalled(skills),
      agentNames: agentsKeptAsInstalled(agents, {
        stated: decoded.assignedStack,
        held: assignedStack,
        joined,
      }),
    },
    joined,
  };
}

function skillsKeptAsInstalled(pairs: Held<SkillConfig>[]): SkillId[] {
  return pairs.filter((pair) => !restatesSkill(pair)).map(({ named }) => named.id);
}

function restatesSkill({ named, held }: Held<SkillConfig>): boolean {
  return named.origin === held.origin;
}

type HeldAgentRows = {
  stated: Partial<Record<AgentName, StackAgentConfig>>;
  held: Partial<Record<AgentName, StackAgentConfig>>;
  joined: JoinedAgent[];
};

/** A sub-agent a row joins is changed, so it is named as added to rather than as kept. */
function agentsKeptAsInstalled(pairs: Held<AgentScopeConfig>[], rows: HeldAgentRows): AgentName[] {
  const joinedNames = new Set(rows.joined.map(({ agentName }) => agentName));
  const keptAsIs = (pair: Held<AgentScopeConfig>): boolean =>
    !restatesAgent(pair, rows) && !joinedNames.has(pair.named.name);

  return pairs.filter(keptAsIs).map(({ named }) => named.name);
}

function restatesAgent({ named, held }: Held<AgentScopeConfig>, rows: HeldAgentRows): boolean {
  return (
    named.model === held.model &&
    named.codexModel === held.codexModel &&
    named.effort === held.effort &&
    sameAssignments(rows.stated[named.name], rows.held[named.name])
  );
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

function entriesActiveAt(
  skills: SkillConfig[],
  agents: AgentScopeConfig[],
  scope: SkillScope,
): Entries {
  return {
    skillIds: skills.filter((skill) => isActiveAt(skill, scope)).map((skill) => skill.id),
    agentNames: agents.filter((agent) => isActiveAt(agent, scope)).map((agent) => agent.name),
  };
}

export function joinedStatement(held: HeldGlobal): string[] {
  return held.joined.length === 0 ? [] : [addedToGlobalSubAgents(held.joined)];
}

/** Split by kind: skill and sub-agent scopes are independent, so a refusal names each. */
export function projectScopedContent(result: InstallSelection): Entries {
  return entriesActiveAt(result.skills, result.agentConfigs, "project");
}

/** The home directory is the global scope, so it refuses anything project-scoped. */
export function installsAtHome(result: InstallSelection): boolean {
  const { skillIds, agentNames } = projectScopedContent(result);
  return skillIds.length === 0 && agentNames.length === 0;
}
