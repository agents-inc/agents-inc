import { isDeepEqual } from "remeda";
import type { AgentName, ProjectConfig, SkillId } from "../../types";
import type { AgentScopeConfig, SkillConfig } from "../../types/config";

/**
 * The work one global config write owes, decided from what actually moved
 * between the config on disk and the config being written.
 *
 * T1 — the generated type unions or the compiled agents are derived from what
 *      changed: rewrite both halves of the pair, propagate to every registered
 *      project, recompile those projects' agents.
 * T2 — a scalar the unions do not encode changed. Project configs inline the
 *      global scalars verbatim, so the config half propagates; no union moves,
 *      so no types are regenerated and no agent is recompiled.
 * T3 — only the `projects[]` registration list changed. Nothing is propagated,
 *      and the matrix / agent definitions propagation would need are never
 *      loaded.
 * T4 — nothing moved. No file is touched.
 */
export type ConsequenceTier = "T1" | "T2" | "T3" | "T4";

export type GlobalChangeSet = {
  skills: {
    added: SkillId[];
    removed: SkillId[];
    /**
     * Ids whose `source` moved. Separate from `otherChanged` because the
     * per-skill source decides the reference form a compiled agent emits
     * (`<id>:<id>` for a marketplace-sourced skill, the bare id for an ejected
     * one), so a source change that skipped the recompile leaves every
     * registered project's agents naming a reference that no longer resolves.
     */
    sourceChanged: SkillId[];
    otherChanged: SkillId[];
  };
  agents: {
    added: AgentName[];
    removed: AgentName[];
    changed: AgentName[];
  };
  stackChanged: boolean;
  selectedDomainsChanged: boolean;
  /** Names of the inlined scalar fields that moved, in config key order. */
  scalarsChanged: string[];
  projectsChanged: boolean;
};

/** The identity element of {@link GlobalChangeSet} — nothing moved, so T4. */
export const NO_CHANGES: GlobalChangeSet = {
  skills: { added: [], removed: [], sourceChanged: [], otherChanged: [] },
  agents: { added: [], removed: [], changed: [] },
  stackChanged: false,
  selectedDomainsChanged: false,
  scalarsChanged: [],
  projectsChanged: false,
};

/** The four fields the config writer extracts into typed named variables. */
const EXTRACTED_FIELDS = new Set(["skills", "agents", "stack", "selectedDomains"]);

/** The registration list — bookkeeping, never emitted into a project config. */
const REGISTRATION_FIELD = "projects";

/**
 * Normalizes a config the way the writer does immediately before emission: a
 * JSON round-trip, so an explicitly-`undefined` field and an absent one compare
 * equal. Without it every write that merely reconstructs an object produces
 * phantom diffs.
 */
function normalize(config: ProjectConfig): Record<string, unknown> {
  // Boundary cast: `JSON.parse` is typed `any`, and round-tripping an object
  // always yields one — the whole point of the call is that the result is the
  // same record with its undefined-valued keys gone.
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

/** Field value as the writer would emit it, or undefined when absent. */
function field(config: Record<string, unknown>, key: string): unknown {
  return config[key];
}

function skillsById(config: Record<string, unknown>): Map<SkillId, SkillConfig> {
  const skills = (config.skills ?? []) as SkillConfig[];
  return new Map(skills.map((skill) => [skill.id, skill]));
}

function agentsByName(config: Record<string, unknown>): Map<AgentName, AgentScopeConfig> {
  const agents = (config.agents ?? []) as AgentScopeConfig[];
  return new Map(agents.map((agent) => [agent.name, agent]));
}

/** The scalar keys either side carries, in `next`-first order with `prev` extras appended. */
function scalarKeys(prev: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const isScalarKey = (key: string): boolean =>
    !EXTRACTED_FIELDS.has(key) && key !== REGISTRATION_FIELD;
  const nextKeys = Object.keys(next).filter(isScalarKey);
  const extraPrevKeys = Object.keys(prev).filter(
    (key) => isScalarKey(key) && !nextKeys.includes(key),
  );
  return [...nextKeys, ...extraPrevKeys];
}

function diffSkills(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): GlobalChangeSet["skills"] {
  const before = skillsById(prev);
  const after = skillsById(next);

  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));

  const sourceChanged: SkillId[] = [];
  const otherChanged: SkillId[] = [];
  for (const [id, afterEntry] of after) {
    const beforeEntry = before.get(id);
    if (!beforeEntry || isDeepEqual(beforeEntry, afterEntry)) continue;
    if (beforeEntry.source !== afterEntry.source) sourceChanged.push(id);
    else otherChanged.push(id);
  }

  return { added, removed, sourceChanged, otherChanged };
}

function diffAgents(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): GlobalChangeSet["agents"] {
  const before = agentsByName(prev);
  const after = agentsByName(next);

  return {
    added: [...after.keys()].filter((name) => !before.has(name)),
    removed: [...before.keys()].filter((name) => !after.has(name)),
    changed: [...after.keys()].filter((name) => {
      const beforeEntry = before.get(name);
      return beforeEntry !== undefined && !isDeepEqual(beforeEntry, after.get(name));
    }),
  };
}

/**
 * Diffs the config on disk against the config about to be written. `prev` is
 * undefined when no global config exists yet, which every field reads as a
 * change from absent.
 */
export function classifyGlobalChange(
  prev: ProjectConfig | undefined,
  next: ProjectConfig,
): GlobalChangeSet {
  const before = prev ? normalize(prev) : {};
  const after = normalize(next);

  return {
    skills: diffSkills(before, after),
    agents: diffAgents(before, after),
    stackChanged: !isDeepEqual(field(before, "stack"), field(after, "stack")),
    selectedDomainsChanged: !isDeepEqual(
      field(before, "selectedDomains"),
      field(after, "selectedDomains"),
    ),
    scalarsChanged: scalarKeys(before, after).filter(
      (key) => !isDeepEqual(field(before, key), field(after, key)),
    ),
    projectsChanged: !isDeepEqual(
      field(before, REGISTRATION_FIELD),
      field(after, REGISTRATION_FIELD),
    ),
  };
}

/** True when something the type unions or the compiled agents derive from moved. */
function movesTypesOrCompiledAgents(changes: GlobalChangeSet): boolean {
  const { skills, agents } = changes;
  return (
    skills.added.length > 0 ||
    skills.removed.length > 0 ||
    skills.sourceChanged.length > 0 ||
    skills.otherChanged.length > 0 ||
    agents.added.length > 0 ||
    agents.removed.length > 0 ||
    agents.changed.length > 0 ||
    changes.stackChanged ||
    changes.selectedDomainsChanged
  );
}

/** The work tier a change set obliges. */
export function consequenceTier(changes: GlobalChangeSet): ConsequenceTier {
  if (movesTypesOrCompiledAgents(changes)) return "T1";
  if (changes.scalarsChanged.length > 0) return "T2";
  if (changes.projectsChanged) return "T3";
  return "T4";
}

/** True when the tier's consequences need the matrix and agent definitions. */
export function tierNeedsDeps(tier: ConsequenceTier): boolean {
  return tier === "T1" || tier === "T2";
}

/** True when the tier regenerates the types half and recompiles propagated agents. */
export function tierRegeneratesTypes(tier: ConsequenceTier): boolean {
  return tier === "T1";
}

/** True when the tier fans the change out to every registered project. */
export function tierPropagates(tier: ConsequenceTier): boolean {
  return tier === "T1" || tier === "T2";
}
