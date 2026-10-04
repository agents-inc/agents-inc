import os from "os";

import { isDeepEqual, omit, partition, pick } from "remeda";

import { loadProjectConfigFromDir } from "../configuration/project-config.js";
import { isActiveAt } from "../configuration/scope-predicates.js";
import { providerInUse } from "../installation/install-layout.js";
import { getCategoryDomain, getSkillDisplayName, matrix } from "../matrix/matrix-provider.js";
import { orderDomains } from "../wizard/domain-order.js";
import { SHARED_CONFIG_APPLY, SHARED_CONFIG_ARRIVALS } from "../../utils/messages.js";
import { typedEntries, typedKeys, typedValues } from "../../utils/typed-object.js";

import type { WizardResultV2 } from "../../components/wizard/wizard.js";
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

/**
 * What applying a shared configuration here is not allowed to take away, split by the reason —
 * because the reasons have different remedies and only the user knows which they meant.
 */
export type KeptFromRoundTrip = {
  /** Written here rather than installed, so no shared configuration ever carried them. */
  authoredSkillIds: SkillId[];
  /** Named by the configuration and unplaceable by this catalogue, so nothing here applied. */
  unplaceableSkillIds: SkillId[];
};

/**
 * A kept skill's installed row that the payload's own skill displaced: the category holds one
 * skill, and the payload fills it on that sub-agent. The skill stays installed; the row goes.
 */
export type UnassignedRow = { skillId: SkillId; agentName: AgentName; category: Category };

export type ReconciledSharedConfig = {
  /** The decoded payload with everything above put back into it. */
  result: WizardResultV2;
  kept: KeptFromRoundTrip;
  /** The kept skills' rows left out, each because the payload's own skill takes its slot. */
  unassigned: UnassignedRow[];
};

export type ReconcileOptions = {
  /** The payload as `seedToWizardResult` decoded it. */
  decoded: WizardResultV2;
  /** This directory's installation — its own config, or the global one it inherits. */
  installed: ProjectConfig | null;
  /** Ids outside the round trip, from `skillsAuthoredHere` — one definition, both halves. */
  authoredHere: ReadonlySet<SkillId>;
  /**
   * Ids the payload NAMED that the decode could not place — `SeedMapping.skippedSkillIds`,
   * which is why they are ids off the wire rather than `SkillId`s of this catalogue.
   *
   * Stated by the caller rather than recomputed here: the decode already answered it, and a
   * second derivation could disagree with the skips the same run reported.
   */
  unplaceable: ReadonlySet<string>;
};

const NOTHING_KEPT: KeptFromRoundTrip = {
  authoredSkillIds: [],
  unplaceableSkillIds: [],
};

/**
 * Puts back what this run may not remove, so the destructive apply removes only what it may.
 *
 * `edit --from` makes the project MATCH the payload: a skill the previous configuration
 * installed and this one omits is removed. Two kinds of installed entry are outside that
 * authority, and each is outside it for its own reason.
 *
 * A skill written here, because `forkedFrom` decides ownership and the producer drops a
 * directory carrying none: the payload never named it, so reading its absence as an instruction
 * to delete it would be this command inventing an instruction nobody gave. And an id the payload
 * DID name that this catalogue could not place, because there the instruction exists and the run
 * failed to carry it out — a destructive command removes on intent, never on its own inability.
 *
 * Scope is the third reason, and it is answered apart, by {@link restoreInstalledGlobal}: from a
 * project the global install is not this run's to remove from or change at all, so it is put back
 * whole rather than entry by entry, and nothing about it is a disclosure of something kept.
 *
 * Both are put back into the RESULT rather than excused at the writer, and that is the whole
 * point of this module. `authoritativeScope` decides whether the merger preserves a config row;
 * it does not protect the files, because the removal DIFF is what drives the plugin uninstall
 * and the `deleteLocalSkill` call. An entry left in the removal set is deleted from disk
 * whatever the merger later does with its row.
 *
 * What comes back with an entry matters as much as the entry. A kept skill with no stack row is
 * installed and loaded by no sub-agent; a kept skill whose domain fell off `selectedDomains` is
 * hidden from the next wizard, deselected by not being shown, and deleted by the run after this
 * one — a removal this one promised not to make.
 */
export function reconcileSharedConfig(options: ReconcileOptions): ReconciledSharedConfig {
  const { decoded, installed } = options;
  if (!installed) return nothingToReconcile(decoded);

  const keptSkills = skillsToKeep(options, installed);
  if (keptSkills.length === 0) return nothingToReconcile(decoded);

  const { result, unassigned } = withKeptEntries(decoded, installed, keptSkills);
  return { result, kept: describeKept(options, keptSkills), unassigned };
}

function nothingToReconcile(decoded: WizardResultV2): ReconciledSharedConfig {
  return { result: decoded, kept: NOTHING_KEPT, unassigned: [] };
}

/**
 * The installed skills this run has to leave alone: absent from what the payload placed here,
 * and immune to removal by authorship, or because this catalogue could not place the id the
 * payload named.
 *
 * A tombstone is neither. It is a statement about something that is NOT installed here, so
 * there are no files to protect and nothing to tell the user is staying.
 */
function skillsToKeep(options: ReconcileOptions, installed: ProjectConfig): SkillConfig[] {
  const named = new Set(options.decoded.skills.map((skill) => skill.id));

  return installed.skills.filter(
    (skill) => !skill.excluded && !named.has(skill.id) && mayNotRemove(skill, options),
  );
}

/** Whether either reason covers this entry — the question the split below refines. */
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

/**
 * Which of the two an entry is disclosed as, where both are true — judged from the more
 * permanent claim to the less, because each statement carries its own remedy and only the one
 * that is true of the whole entry is worth naming.
 *
 * A skill nobody installed cannot be removed by any shared configuration from anywhere. An id
 * this catalogue cannot place is inert only for as long as this installation reads this
 * catalogue, so `update` is a real way out of it and nothing is a way out of the other.
 */
function reasonKept(skill: SkillConfig, options: ReconcileOptions): KeptReason {
  return options.authoredHere.has(skill.id) ? "authored" : "unplaceable";
}

/**
 * The payload, plus the entries it was never entitled to speak about — and the kept rows its own
 * skills left no room for.
 */
function withKeptEntries(
  decoded: WizardResultV2,
  installed: ProjectConfig,
  keptSkills: SkillConfig[],
): Pick<ReconciledSharedConfig, "result" | "unassigned"> {
  const withSkills: WizardResultV2 = {
    ...decoded,
    skills: [...decoded.skills, ...keptSkills],
    selectedDomains: withKeptDomains(decoded.selectedDomains, keptSkills),
  };
  if (decoded.assignedStack === undefined) return { result: withSkills, unassigned: [] };

  const { assignedStack, unassigned } = withKeptStackRows(decoded.assignedStack, installed.stack, {
    keptSkillIds: new Set(keptSkills.map((skill) => skill.id)),
    survivingAgents: new Set(decoded.selectedAgents),
  });
  return { result: { ...withSkills, assignedStack }, unassigned };
}

/** The domains the payload chose, plus the ones its kept entries still need a tab for. */
function withKeptDomains(selected: Domain[], keptSkills: SkillConfig[]): Domain[] {
  const keptDomains = keptSkills.flatMap((skill) => domainOfSkill(skill.id) ?? []);
  const missing = keptDomains.filter((domain) => !selected.includes(domain));
  if (missing.length === 0) return selected;

  return orderDomains([...selected, ...new Set(missing)]);
}

/**
 * A kept skill's domain, where this catalogue knows the skill. Optional by nature rather than by
 * caution: a config entry the loaded source cannot resolve has no category to place, and
 * `edit`'s own unresolvable-entry path is what speaks about those.
 */
function domainOfSkill(skillId: SkillId): Domain | undefined {
  const category = matrix.skills[skillId]?.category;
  return category === undefined ? undefined : getCategoryDomain(category);
}

type KeptRowFilter = {
  keptSkillIds: ReadonlySet<SkillId>;
  survivingAgents: ReadonlySet<AgentName>;
};

/** The payload's stack with the kept rows folded in, and the kept rows it had no room for. */
type KeptRows = {
  assignedStack: Partial<Record<AgentName, StackAgentConfig>>;
  unassigned: UnassignedRow[];
};

/**
 * The installed stack rows a kept skill needs, folded into the payload's own.
 *
 * `assignedStack` REPLACES the ownership-derived stack rather than merging with it, so a row
 * this reconcile does not carry is a row nothing downstream re-derives. A kept skill is kept
 * because the payload never spoke about it, and a row naming it is the same silence one layer
 * down — so the row the installation already had is the only statement there is about it.
 *
 * A row under a sub-agent this configuration removes is dropped with it. That sub-agent IS this
 * run's to remove, and a stack row naming one no configuration installs is what `compile` warns
 * about and leaves out of the agents it writes.
 *
 * A kept row JOINS the payload's rows under its category rather than replacing them: the payload
 * may assign a skill of its own to the same category of the same sub-agent, and a replaced array
 * leaves that skill installed and loaded by no sub-agent. Except where the category holds one
 * skill and the payload already fills it: the two cannot both be written there, so the payload's
 * skill takes the slot — the same rule {@link arrivingRows} keeps for a global sub-agent — and the
 * kept row is handed back as unassigned for the plan to name.
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

/**
 * One sub-agent's kept rows, folded in: each joins the payload's rows under its category, unless
 * that category holds one skill the payload already gives this sub-agent.
 */
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

/**
 * The decode, plus each installed sub-agent the payload assigns a skill this catalogue cannot place
 * and this installation still holds — each as installed.
 *
 * The decode carries a sub-agent in by the skills it places, so one whose only skill it skipped is
 * left out, and the destructive apply would remove it. That is the removal
 * {@link reconcileSharedConfig} refuses for the skill, for the same reason: the payload named this
 * sub-agent, so its absence is this catalogue's limit rather than an instruction. Put back before
 * the reconcile, it survives it, and the reconcile carries the kept skill's rows onto it.
 */
export function withUnplaceableAssignees(
  decoded: WizardResultV2,
  installed: ProjectConfig | null,
  payload: SeedPayload,
  unplaceable: ReadonlySet<string>,
): WizardResultV2 {
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

/**
 * The sub-agents the payload assigns an unplaceable skill the installation holds, less any it
 * switches off — whose rows the decode ignores even for a skill it places.
 */
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

/** The parts of the global installation's config a project run must leave as they are. */
export type InstalledGlobal = Pick<ProjectConfig, "skills" | "agents" | "stack">;

/**
 * The global installation a run in `projectDir` inherits, as its own config states it — or `null`
 * when there is none.
 *
 * Read from the global config rather than from the rows a project's own file inlines: the global
 * config is what the gate writes and what every other registered project inherits, and an inlined
 * copy can be older than it. Through the project's own provider, because a project inherits only
 * from the global installation of its provider. Called only from a project — at the home directory
 * the run IS the global installation, and there is nothing to leave alone.
 */
export async function readInstalledGlobal(projectDir: string): Promise<InstalledGlobal | null> {
  const loaded = await loadProjectConfigFromDir(os.homedir(), providerInUse(projectDir));
  return loaded?.config ?? null;
}

/** Global entries a configuration names, by what a project run does with each. */
type GlobalEntries = { skillIds: SkillId[]; agentNames: AgentName[] };

/** What a run from a project does with the global install above it: adds to it, and nothing else. */
export type HeldGlobal = {
  /** The configuration, with every global entry the global install holds stated as it holds it. */
  result: WizardResultV2;
  /**
   * The global entries the configuration names that the global install already holds. Its skills
   * are skipped — neither installed nor given a row — and listed as skipped.
   */
  installed: GlobalEntries;
  /**
   * Of those, the ones the configuration states otherwise — a skill's install mode, a sub-agent's
   * tuning, or rows other than the ones it ends up with — disclosed as kept as installed. From
   * {@link restoreInstalledGlobal}, also every global skill and sub-agent the configuration leaves
   * out.
   */
  keptAsInstalled: GlobalEntries;
};

const NO_GLOBAL_ENTRIES: GlobalEntries = { skillIds: [], agentNames: [] };

/**
 * Restates every global entry the configuration names that the global install already holds, as
 * the global install holds it: the skill's install mode, the sub-agent's tuning, and the rows
 * that sub-agent already has.
 *
 * From a project, `--from` only ADDS to the global install (owner ruling 2026-10-02). It is one
 * installation every project on the machine reads, and a run started in one of them is not a
 * decision about the rest — so an entry it already holds is not this run's to reinstall, retune or
 * reassign, however the configuration states it. Restated in the RESULT rather than excused at
 * the writer, for the reason {@link reconcileSharedConfig} gives: the result is what the diff, the
 * install steps and the writer all read, so an entry left as the payload stated it is one of them
 * acting on it.
 *
 * What the global install lacks arrives whole, and a skill's assignment is part of it: a new
 * global skill assigned to a global sub-agent the global install already holds adds its row to
 * that sub-agent, beside the rows it has (owner ruling, later on 2026-10-02). A skill the global
 * install already holds is skipped outright, so it brings no row with it either.
 *
 * `installed` is `null` where there is nothing to hold: at the home directory, where the run IS
 * the global install, and on a machine with none.
 */
export function holdInstalledGlobal(
  decoded: WizardResultV2,
  installed: InstalledGlobal | null,
): HeldGlobal {
  if (!installed) {
    return { result: decoded, installed: NO_GLOBAL_ENTRIES, keptAsInstalled: NO_GLOBAL_ENTRIES };
  }

  const heldSkills = activeGlobalById(installed.skills, (skill) => skill.id);
  const heldAgents = activeGlobalById(installed.agents, (agent) => agent.name);
  const skills = pairWithHeld(decoded.skills, heldSkills, (skill) => skill.id);
  const agents = pairWithHeld(decoded.agentConfigs, heldAgents, (agent) => agent.name);
  const namedSkillIds = skills.map(({ named }) => named.id);
  const namedAgentNames = agents.map(({ named }) => named.name);
  const assignedStack =
    decoded.assignedStack &&
    withHeldRows(decoded.assignedStack, installed.stack, {
      agentNames: namedAgentNames,
      skippedSkillIds: new Set(namedSkillIds),
    });

  const restatesSkill = ({ named, held }: Held<SkillConfig>): boolean =>
    named.origin === held.origin;
  const restatesAgent = ({ named, held }: Held<AgentScopeConfig>): boolean =>
    named.model === held.model &&
    named.effort === held.effort &&
    sameAssignments(decoded.assignedStack?.[named.name], assignedStack?.[named.name]);

  return {
    result: {
      ...decoded,
      skills: decoded.skills.map(asHeld(skills)),
      agentConfigs: decoded.agentConfigs.map(asHeld(agents)),
      ...(assignedStack !== undefined && { assignedStack }),
    },
    installed: { skillIds: namedSkillIds, agentNames: namedAgentNames },
    keptAsInstalled: {
      skillIds: skills.filter((pair) => !restatesSkill(pair)).map(({ named }) => named.id),
      agentNames: agents.filter((pair) => !restatesAgent(pair)).map(({ named }) => named.name),
    },
  };
}

/**
 * {@link holdInstalledGlobal}, plus every global entry the configuration leaves out, put back as
 * installed — what `edit --from` needs from a project.
 *
 * That apply is destructive: an installed entry absent from the result is removed, files and
 * all. The project's own entries are its to remove; the global install's are not, so they are put
 * back whole — skills, sub-agents and those sub-agents' rows — and the removal plan never holds
 * one. A global skill or sub-agent put back is one the configuration leaves out, so it is named as
 * kept.
 */
export function restoreInstalledGlobal(
  decoded: WizardResultV2,
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

/** A config roster's active global entries, by the key the result names them with. */
function activeGlobalById<Entry extends SkillConfig | AgentScopeConfig, Key extends string>(
  entries: Entry[],
  keyOf: (entry: Entry) => Key,
): Map<Key, Entry> {
  return new Map(
    entries.filter((entry) => isActiveAt(entry, "global")).map((entry) => [keyOf(entry), entry]),
  );
}

/** A decoded global entry, beside the entry the global install already holds under its name. */
type Held<Entry> = { named: Entry; held: Entry };

/** Each decoded entry as the global install holds it, where it names one; otherwise unchanged. */
function asHeld<Entry>(pairs: Held<Entry>[]): (entry: Entry) => Entry {
  const heldFor = new Map(pairs.map(({ named, held }) => [named, held]));
  return (entry) => heldFor.get(entry) ?? entry;
}

/** The decoded entries that name, at global scope, one the global install already holds. */
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

/**
 * Whether two sub-agent stacks hold the same skills under the same categories at the same load
 * state — the order rows were written in is not part of what a sub-agent loads.
 */
export function sameAssignments(
  left: StackAgentConfig | undefined,
  right: StackAgentConfig | undefined,
): boolean {
  return isDeepEqual(assignmentKeys(left), assignmentKeys(right));
}

/** One stack's rows as comparable strings, in a fixed order. */
function assignmentKeys(agentStack: StackAgentConfig | undefined): string[] {
  return typedEntries<Category, SkillAssignment[]>(agentStack ?? {})
    .flatMap(([category, assignments]) =>
      assignments.map((row) => `${category}/${row.id}/${row.preloaded === true}`),
    )
    .sort();
}

/**
 * The payload's stack, with each named sub-agent's rows replaced by the ones it is installed
 * with — none, where the global install gives it none.
 */
function withInstalledRows(
  assigned: Partial<Record<AgentName, StackAgentConfig>>,
  installedStack: InstalledGlobal["stack"],
  agentNames: AgentName[],
): Partial<Record<AgentName, StackAgentConfig>> {
  return { ...omit(assigned, agentNames), ...pick(installedStack ?? {}, agentNames) };
}

/** The held sub-agents, and the skills whose rows stay out because the skill is skipped. */
type HeldRows = { agentNames: AgentName[]; skippedSkillIds: ReadonlySet<SkillId> };

/**
 * {@link withInstalledRows}, plus the configuration's rows on those sub-agents for the skills the
 * global install lacks — a skill arrives together with its assignment. A row the sub-agent
 * already has stays first and as it is, so what it loads now it still loads, in the same order.
 */
function withHeldRows(
  assigned: Partial<Record<AgentName, StackAgentConfig>>,
  installedStack: InstalledGlobal["stack"],
  held: HeldRows,
): Partial<Record<AgentName, StackAgentConfig>> {
  const asInstalled = withInstalledRows(assigned, installedStack, held.agentNames);

  return held.agentNames.reduce(
    (stack, agentName) =>
      withAppendedRows(
        stack,
        agentName,
        arrivingRows(assigned[agentName], stack[agentName], held.skippedSkillIds),
      ),
    asInstalled,
  );
}

/**
 * The configuration's rows for one held sub-agent that bring something with them: a skill the
 * global install lacks, which that sub-agent does not already load, under a category with room for
 * it. A category that holds one skill, which the sub-agent already fills, keeps the skill it has —
 * the arriving one is installed without that row, rather than written as a second skill where the
 * config can hold only one.
 */
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

/** One sub-agent's rows, as the skill ids they load. */
function rowIds(agentStack: StackAgentConfig | undefined): SkillId[] {
  return typedValues<Category, SkillAssignment[]>(agentStack ?? {}).flatMap((rows) =>
    rows.map((row) => row.id),
  );
}

/**
 * The categories this sub-agent already fills that hold one skill at most — declared so by the
 * catalogue, because a category it does not declare is not exclusive (see `propagate.ts`).
 */
function filledExclusiveCategories(agentStack: StackAgentConfig | undefined): Set<Category> {
  const isExclusive = (category: Category): boolean =>
    matrix.categories[category]?.exclusive === true;

  return new Set(
    typedEntries<Category, SkillAssignment[]>(agentStack ?? {})
      .filter(([category, rows]) => rows.length > 0 && isExclusive(category))
      .map(([category]) => category),
  );
}

/** The stack, with `added` appended to one sub-agent's rows — as it was where nothing is added. */
function withAppendedRows(
  stack: Partial<Record<AgentName, StackAgentConfig>>,
  agentName: AgentName,
  added: [Category, SkillAssignment][],
): Partial<Record<AgentName, StackAgentConfig>> {
  if (added.length === 0) return stack;
  return { ...stack, [agentName]: appendRows(stack[agentName] ?? {}, added) };
}

/** The rows of one sub-agent's stack that pass `keep`, each beside the category it sits under. */
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

/** A sub-agent's stack with `added` appended, each row after those already under its category. */
function appendRows(
  agentStack: StackAgentConfig,
  added: [Category, SkillAssignment][],
): StackAgentConfig {
  return added.reduce<StackAgentConfig>(
    (rows, [category, row]) => ({ ...rows, [category]: [...(rows[category] ?? []), row] }),
    agentStack,
  );
}

/** The global install's active entries a result does not name. */
type OmittedGlobal = { skills: SkillConfig[]; agents: AgentScopeConfig[] };

function omittedGlobal(result: WizardResultV2, installed: InstalledGlobal): OmittedGlobal {
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

/** The result, plus every global entry it does not name, each as the global install holds it. */
function withOmittedGlobal(
  result: WizardResultV2,
  installed: InstalledGlobal,
  omitted: OmittedGlobal,
): WizardResultV2 {
  const omittedAgentNames = omitted.agents.map((agent) => agent.name);

  return {
    ...result,
    skills: [...result.skills, ...omitted.skills],
    agentConfigs: [...result.agentConfigs, ...omitted.agents],
    selectedAgents: [...new Set([...result.selectedAgents, ...omittedAgentNames])],
    selectedDomains: withKeptDomains(result.selectedDomains, omitted.skills),
    ...(result.assignedStack !== undefined && {
      assignedStack: withInstalledRows(result.assignedStack, installed.stack, omittedAgentNames),
    }),
  };
}

/**
 * The entries a run writes, less those the global install already holds: a carried skill's bytes
 * written over a global skill directory would change it as surely as a reinstall.
 */
export function notInstalledGlobally<Entry extends { id: SkillId }>(
  entries: Entry[],
  held: HeldGlobal,
): Entry[] {
  const installed = new Set(held.installed.skillIds);
  return entries.filter((entry) => !installed.has(entry.id));
}

/** What a `--from` install puts into one scope, as its list names them. */
export type ArrivingEntries = { skillIds: SkillId[]; agentNames: AgentName[] };

/** What a `--from` install puts where — the two lists it prints before it writes. */
export type Arrivals = Record<SkillScope, ArrivingEntries>;

/** The active skills and sub-agents given, split by the scope each one lands at. */
export function arrivalsByScope(skills: SkillConfig[], agents: AgentScopeConfig[]): Arrivals {
  const landingAt = (scope: SkillScope): ArrivingEntries => ({
    skillIds: skills.filter((skill) => isActiveAt(skill, scope)).map((skill) => skill.id),
    agentNames: agents.filter((agent) => isActiveAt(agent, scope)).map((agent) => agent.name),
  });
  return { project: landingAt("project"), global: landingAt("global") };
}

/**
 * Everything `init --from` installs, by scope: the whole configuration, less what the global
 * install already holds — that is not arriving anywhere.
 */
function installArrivals(held: HeldGlobal): Arrivals {
  const installedSkillIds = new Set(held.installed.skillIds);
  const installedAgentNames = new Set(held.installed.agentNames);
  return arrivalsByScope(
    held.result.skills.filter((skill) => !installedSkillIds.has(skill.id)),
    held.result.agentConfigs.filter((agent) => !installedAgentNames.has(agent.name)),
  );
}

/**
 * What `init --from` prints before it writes: the two lists of what it installs where, then the
 * global skills it skips because the global install above the project already holds them. A
 * skipped skill is named rather than left out, so a configuration's skill that does not arrive is
 * never one the user was not told about.
 */
export function installPlanLines(held: HeldGlobal): string[] {
  return [
    ...arrivalLines(installArrivals(held)),
    ...scopeLines(SHARED_CONFIG_ARRIVALS.SKIPPED_HEADING, {
      skillIds: held.installed.skillIds,
      agentNames: [],
    }),
  ];
}

/** How a skill reads in a shared-config plan: the name it was picked by, with the id behind it. */
export function skillLabel(skillId: SkillId): string {
  const displayName = getSkillDisplayName(skillId);
  return displayName === skillId ? skillId : `${displayName} (${skillId})`;
}

/**
 * The two lists, as printed: project first, then global, each omitted when nothing lands there,
 * and each split into skills and sub-agents under the headings the removal plan uses.
 */
export function arrivalLines(arrivals: Arrivals): string[] {
  return [
    ...scopeLines(SHARED_CONFIG_ARRIVALS.PROJECT_HEADING, arrivals.project),
    ...scopeLines(SHARED_CONFIG_ARRIVALS.GLOBAL_HEADING, arrivals.global),
  ];
}

/** One scope's list, or nothing when nothing lands there. */
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
