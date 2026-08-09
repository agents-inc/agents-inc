import { DEFAULT_SELECTION_OPTIONS } from "@workspace/matrix";

import { AGENT_NAMES } from "../../types/agents.js";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../consts.js";
import { isScopePairCompatible } from "../configuration/config-generator.js";
import { getCategoryDomain } from "../matrix/matrix-provider.js";
import { validateSelection } from "../matrix/matrix-resolver.js";
import { orderDomains } from "../wizard/domain-order.js";

import type { WizardResultV2 } from "../../components/wizard/wizard.js";
import type { AgentName } from "../../types/agents.js";
import type { AgentScopeConfig, SkillConfig, SkillScope } from "../../types/config.js";
import type {
  Category,
  Domain,
  DomainSelections,
  MergedSkillsMatrix,
  ResolvedSkill,
} from "../../types/matrix.js";
import type { SkillAssignment, SkillId } from "../../types/skills.js";
import type { StackAgentConfig } from "../../types/stacks.js";
import type { SeedAgent, SeedLoadState, SeedPayload } from "@workspace/matrix/seed";

export type SeedMapping = {
  result: WizardResultV2;
  /** Ids this matrix does not know. Reported, never fatal — see the decode policy. */
  skippedSkillIds: string[];
  skippedAgentNames: string[];
};

const KNOWN_AGENTS = new Set<string>(AGENT_NAMES);

/** A skill's primary source, or the default marketplace. Mirrors the wizard's own resolution. */
function sourceForSkill(skill: ResolvedSkill | undefined): string {
  return skill?.availableSources?.find((s) => s.primary)?.name ?? DEFAULT_PUBLIC_SOURCE_NAME;
}

function addToDomainSelections(
  selections: DomainSelections,
  domain: Domain,
  category: Category,
  skillId: SkillId,
): void {
  const categorySelections = (selections[domain] ??= {});
  const skillList = (categorySelections[category] ??= []);
  if (!skillList.includes(skillId)) skillList.push(skillId);
}

/**
 * The stack mirror of {@link addToDomainSelections}: one sub-agent's own category lists, appended
 * in payload order. A `(skill, sub-agent)` pair can only occur once — `skills` is keyed by id — so
 * there is nothing to de-duplicate here.
 */
function addToAgentStack(
  stack: Partial<Record<AgentName, StackAgentConfig>>,
  agent: AgentName,
  category: Category,
  assignment: SkillAssignment,
): void {
  const agentStack = (stack[agent] ??= {});
  const assignments = (agentStack[category] ??= []);
  assignments.push(assignment);
}

/** A load state is per `(skill, sub-agent)`; `preloaded` is the stack's word for the same thing. */
function toSkillAssignment(skillId: SkillId, load: SeedLoadState): SkillAssignment {
  return { id: skillId, preloaded: load === "preloaded" };
}

/** The payload's `agents` map, split by what this catalog can do with each entry. */
type SeedAgentMap = {
  /** Known agents the map has something to say about, keyed by name. */
  known: Map<AgentName, SeedAgent>;
  /** Names explicitly switched off — dropped, and their assignment rows ignored with them. */
  switchedOff: Set<string>;
  /** Names this catalog does not know. Reported, never fatal — same policy as unknown skill ids. */
  unknown: string[];
};

function readAgentMap(agents: SeedPayload["agents"]): SeedAgentMap {
  const known = new Map<AgentName, SeedAgent>();
  const switchedOff = new Set<string>();
  const unknown: string[] = [];

  for (const [name, entry] of Object.entries(agents)) {
    if (!KNOWN_AGENTS.has(name)) unknown.push(name);
    else if (entry.on === false) switchedOff.add(name);
    else known.set(name as AgentName, entry);
  }

  return { known, switchedOff, unknown };
}

/**
 * Where a sub-agent's front-matter is written is the payload's to say, per agent and
 * independently of any skill's scope: an entry may pin its agent into the project, and one that
 * names no scope goes to the user's own ~/.claude — the shared selection default, spelled once in
 * the matrix so the editor and this decode cannot disagree about it.
 */
function seedAgentScope(entry: SeedAgent | undefined): SkillScope {
  return entry?.scope ?? DEFAULT_SELECTION_OPTIONS.scope;
}

/**
 * A sub-agent's own row. Model and effort ride along on the same terms as its scope — an absent
 * key means "keep whatever the agent's metadata says".
 */
function agentScopeConfig(name: AgentName, entry: SeedAgent | undefined): AgentScopeConfig {
  return {
    name,
    scope: seedAgentScope(entry),
    ...(entry?.model !== undefined && { model: entry.model }),
    ...(entry?.effort !== undefined && { effort: entry.effort }),
  };
}

/** A `(skill, sub-agent)` assignment the config model has nowhere to write. */
type UnwritableAssignment = { skillId: SkillId; agent: AgentName };

/**
 * Names every unwritable pair, not just the first: a sharer who fixes one only to be refused for
 * the next learns nothing the first message could not have told them. Both halves of each pair are
 * named because neither alone says what to change — the skill can move to global scope, or the
 * sub-agent can be pinned to the project, and only the sharer knows which they meant.
 */
function unwritableAssignmentsError(assignments: UnwritableAssignment[]): string {
  return [
    "This configuration cannot be installed: a project-scoped skill never reaches a sub-agent " +
      "that rests at global scope, so these assignments have nowhere to be written:",
    ...assignments.map(({ skillId, agent }) => `  ${skillId} -> ${agent}`),
    "Re-share it with each sub-agent above pinned to the project, or each skill above at global scope.",
  ].join("\n");
}

/**
 * Turns a shared configuration into the shape the install pipeline already consumes, so
 * `init --from` reuses `writeProjectConfig` -> skill install -> `compileAgentsAllScopes`
 * unchanged rather than growing a second path that can drift from the wizard's.
 *
 * Unknown ids are skipped, never fatal. Payloads carry catalog slugs precisely so they survive
 * catalog churn: a config shared before a skill was renamed should still install everything else,
 * and failing the whole decode would make every rename retroactively break every shared id.
 *
 * A sub-agent reaches the roster two ways: named by a surviving skill's assignment, or switched on
 * in the `agents` map. The map is the only place a configuration can say anything about an agent
 * no skill mentions, which is what makes a bare (skill-less) agent shareable at all; it also
 * carries that agent's model and effort onto its `AgentScopeConfig`.
 *
 * The `assignments` map is per `(skill, sub-agent)` and carries a load state, so it decides three
 * things the wizard cannot express separately: which sub-agents are selected, which skills land in
 * each one's stack entry, and which of those preload. That is why the result carries an
 * `assignedStack` — the install pipeline's ownership rules broadcast every scope-compatible skill
 * to every selected agent, which would hand a bare sub-agent someone else's skills.
 *
 * An unwritable `(skill, sub-agent)` pair is the one thing here that IS fatal, and it is fatal for
 * the opposite reason to the skips: an unknown id is content this catalog does not have, while an
 * unwritable pair is content it has and cannot place. Because `assignedStack` replaces the derived
 * stack wholesale, no scope filter runs on these rows downstream — they reach the writers, which
 * put them in neither half of the split config and say nothing. Refusing at the decode is what
 * keeps a payload from installing as a quieter configuration than the one that was shared.
 */
export function seedToWizardResult(payload: SeedPayload, matrix: MergedSkillsMatrix): SeedMapping {
  const domainSelections: DomainSelections = {};
  const assignedStack: Partial<Record<AgentName, StackAgentConfig>> = {};
  const skills: SkillConfig[] = [];
  const skippedSkillIds: string[] = [];
  const unwritable: UnwritableAssignment[] = [];
  const agentNames = new Set<AgentName>();
  const agentMap = readAgentMap(payload.agents);
  const skippedAgentNames = new Set<string>(agentMap.unknown);

  for (const [skillId, entry] of Object.entries(payload.skills)) {
    const skill = matrix.skills[skillId as SkillId];
    const domain = skill?.category ? getCategoryDomain(skill.category) : undefined;

    if (!skill?.category || !domain) {
      skippedSkillIds.push(skillId);
      continue;
    }

    // Past the guard the matrix knows this id, and its category is a real one: the `local`
    // pseudo-category has no domain, so it left with the skips.
    const id = skillId as SkillId;
    const category = skill.category as Category;

    addToDomainSelections(domainSelections, domain, category, id);

    skills.push({
      id,
      scope: entry.scope,
      // "eject" is a source in its own right; anything else names the marketplace it came from.
      source: entry.install === "eject" ? "eject" : sourceForSkill(skill),
    });

    // Only assignments on skills that survived — an agent should not be switched on by a skill
    // this catalog cannot install.
    for (const [agentName, load] of Object.entries(entry.assignments)) {
      if (agentMap.switchedOff.has(agentName)) continue;
      if (!KNOWN_AGENTS.has(agentName)) {
        skippedAgentNames.add(agentName);
        continue;
      }

      const agent = agentName as AgentName;
      // Rows the decode was going to ignore anyway have already left, so what reaches here is a
      // pair the payload really asked for — and the config model's one rule about pairs applies.
      if (!isScopePairCompatible(entry.scope, seedAgentScope(agentMap.known.get(agent)))) {
        unwritable.push({ skillId: id, agent });
        continue;
      }

      agentNames.add(agent);
      // The assignment is the curation: this sub-agent holds this skill, at this load state, and
      // no sub-agent the payload did not name holds it at all.
      addToAgentStack(assignedStack, agent, category, toSkillAssignment(id, load));
    }
  }

  if (unwritable.length > 0) throw new Error(unwritableAssignmentsError(unwritable));

  // Bare agents: switched on by the map alone, with no skill to carry them in.
  for (const [name, entry] of agentMap.known) {
    if (entry.on === true) agentNames.add(name);
  }

  const selectedAgents = [...agentNames];

  return {
    result: {
      skills,
      selectedAgents,
      agentConfigs: selectedAgents.map((name) => agentScopeConfig(name, agentMap.known.get(name))),
      assignedStack,
      selectedStackId: payload.stackId,
      domainSelections,
      selectedDomains: orderDomains(Object.keys(domainSelections) as Domain[]),
      // Nothing was dropped from a *saved config* — the skipped ids came off the wire and are
      // reported to the user directly, so there is no config removal to explain.
      unresolvableSkillIds: [],
      cancelled: false,
      // Revalidated here rather than taken on trust from the app that built the payload. That app
      // validated against ITS catalog; this one skips ids it does not know and carries its own
      // relationship rules, so a configuration that was consistent where it was authored can
      // arrive with a requirement genuinely unmet. Running the same validator the wizard runs
      // makes that this catalog's verdict on what it can install — reported through the spine
      // `init` already has, beside the skips that explain it — rather than a fault in what was
      // shared.
      validation: validateSelection(skills.map((skill) => skill.id)),
    },
    skippedSkillIds,
    skippedAgentNames: [...skippedAgentNames],
  };
}
