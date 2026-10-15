import type {
  AgentName,
  Category,
  ProjectConfig,
  SkillAssignment,
  SkillConfig,
  SkillScope,
} from "../../../types/index.js";

/**
 * The three config shapes a fixture builds, with their skill ids widened to `string`.
 *
 * `SkillId` is the PUBLIC catalogue's generated union. A fixture that installs from
 * a fixture MARKETPLACE records ids in that marketplace's namespace (`e2eSkillId`
 * in e2e/helpers/create-e2e-source.ts), so no such id is a member of it. The file
 * these shapes produce on disk is the one production writes; only the union the
 * fixture is checked against is the wrong one, and per CLAUDE.md a fabricated id
 * widens rather than casting itself into a union it is not in.
 *
 * They live beside `buildSkillConfig` because that is the lowest factory that has
 * to name one, and both the unit factories and the E2E fixtures build on it.
 */
export type FixtureSkillConfig = Omit<SkillConfig, "id"> & { id: string };

type FixtureSkillAssignment = Omit<SkillAssignment, "id"> & { id: string };

export type FixtureStackAgentConfig = Partial<Record<Category, FixtureSkillAssignment[]>>;

export type FixtureProjectConfig = Omit<ProjectConfig, "skills" | "stack"> & {
  skills: FixtureSkillConfig[];
  stack?: Partial<Record<AgentName, FixtureStackAgentConfig>>;
};

/**
 * The scope every config factory writes when its caller names none.
 *
 * This is the factories' OWN choice, not a mirror of any product default. It says "an installed
 * entry that this test has nothing to say about lives in the project" — the shape the overwhelming
 * majority of specs arrange — and it is paired with the `origin: "eject"` default below for the
 * same reason.
 *
 * It is deliberately NOT `DEFAULT_SELECTION_OPTIONS.scope` from `@workspace/matrix`, which is
 * `global`: that constant answers "what does an untouched *pick* do?", a question about a fresh
 * selection rather than about a saved config row. A spec asserting what an untouched pick produces
 * must name its scope explicitly rather than lean on this.
 */
export const FACTORY_DEFAULT_SCOPE: SkillScope = "project";

/**
 * Build a single SkillConfig from an id with default scope and origin.
 *
 * Generic over the id rather than fixed to `SkillId` for the reason
 * `createMockSkillAssignment` gives: a catalogue literal still yields a
 * `SkillConfig`, while a marketplace-namespaced fixture id — not a member of the
 * generated union — yields the same shape with `id: string`, and no cast.
 */
export function buildSkillConfig<Id extends string>(
  id: Id,
  overrides?: Partial<Omit<SkillConfig, "id">>,
): Omit<SkillConfig, "id"> & { id: Id } {
  return {
    id,
    scope: overrides?.scope ?? FACTORY_DEFAULT_SCOPE,
    origin: overrides?.origin ?? "eject",
    ...(overrides?.excluded !== undefined && { excluded: overrides.excluded }),
  };
}

/** Build a SkillConfig array from skill IDs with default scope and origin */
export function buildSkillConfigs<Id extends string>(
  skillIds: readonly Id[],
  overrides?: Partial<Omit<SkillConfig, "id">>,
): Array<Omit<SkillConfig, "id"> & { id: Id }> {
  return skillIds.map((id) => buildSkillConfig(id, overrides));
}
