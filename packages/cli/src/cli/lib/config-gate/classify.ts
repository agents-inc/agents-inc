import { isDeepEqual } from "remeda";
import { isRecord } from "../../utils/type-guards.js";
import type { AgentName, ProjectConfig, SkillId } from "../../types";
import type { AgentScopeConfig, SkillConfig } from "../../types/config";

/**
 * T1: the type unions or compiled agents derive from what changed; rewrite both halves, propagate,
 * recompile. T2: an inlined scalar changed; propagate the config half only. T3: only `projects[]`
 * changed; nothing propagates. T4: nothing moved.
 */
export type ConsequenceTier = "T1" | "T2" | "T3" | "T4";

export type GlobalChangeSet = {
  skills: {
    added: SkillId[];
    removed: SkillId[];
    /** Apart from `otherChanged`: it decides the reference form a compiled agent emits. */
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
 * Fields an empty value leaves meaning nothing: the writer omits an empty `stack` and writes an
 * empty `selectedDomains`, and the global merge spells both out, so either reading occurs.
 */
const EMPTY_MEANS_ABSENT = new Set(["stack", "selectedDomains"]);

function isEmptyCollection(value: unknown): boolean {
  return Array.isArray(value)
    ? value.length === 0
    : isRecord(value) && Object.keys(value).length === 0;
}

/**
 * A JSON round-trip, as the writer does, so an explicitly-`undefined` field equals an absent one;
 * an empty stack or domain list equals an absent one too.
 */
function normalize(config: ProjectConfig): Record<string, unknown> {
  // Boundary cast: `JSON.parse` returns `any`; the round-trip yields the same record.
  const record = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) => !(EMPTY_MEANS_ABSENT.has(key) && isEmptyCollection(value)),
    ),
  );
}

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
    if (beforeEntry.origin !== afterEntry.origin) sourceChanged.push(id);
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

/** `prev` is undefined when no global config exists yet; every field then reads as changed. */
export function classifyGlobalChange(
  prev: ProjectConfig | undefined,
  next: ProjectConfig,
): GlobalChangeSet {
  const before = prev ? normalize(prev) : {};
  const after = normalize(next);
  const moved = (key: string): boolean => !isDeepEqual(field(before, key), field(after, key));

  return {
    skills: diffSkills(before, after),
    agents: diffAgents(before, after),
    stackChanged: moved("stack"),
    selectedDomainsChanged: moved("selectedDomains"),
    scalarsChanged: scalarKeys(before, after).filter(moved),
    projectsChanged: moved(REGISTRATION_FIELD),
  };
}

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

export function consequenceTier(changes: GlobalChangeSet): ConsequenceTier {
  if (movesTypesOrCompiledAgents(changes)) return "T1";
  if (changes.scalarsChanged.length > 0) return "T2";
  if (changes.projectsChanged) return "T3";
  return "T4";
}

export function tierNeedsDeps(tier: ConsequenceTier): boolean {
  return tier === "T1" || tier === "T2";
}

export function tierRegeneratesTypes(tier: ConsequenceTier): boolean {
  return tier === "T1";
}

export function tierPropagates(tier: ConsequenceTier): boolean {
  return tier === "T1" || tier === "T2";
}
