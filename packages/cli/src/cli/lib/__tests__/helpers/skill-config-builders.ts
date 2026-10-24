import type {
  AgentName,
  Category,
  ProjectConfig,
  SkillAssignment,
  SkillConfig,
  SkillScope,
} from "../../../types/index.js";

/** Config shapes with ids widened to `string`: fixture-marketplace ids aren't `SkillId` members. */
export type FixtureSkillConfig = Omit<SkillConfig, "id"> & { id: string };

type FixtureSkillAssignment = Omit<SkillAssignment, "id"> & { id: string };

export type FixtureStackAgentConfig = Partial<Record<Category, FixtureSkillAssignment[]>>;

export type FixtureProjectConfig = Omit<ProjectConfig, "skills" | "stack"> & {
  skills: FixtureSkillConfig[];
  stack?: Partial<Record<AgentName, FixtureStackAgentConfig>>;
};

/** The factories' own default, not the product's (`DEFAULT_SELECTION_OPTIONS.scope` is global). */
export const FACTORY_DEFAULT_SCOPE: SkillScope = "project";

/** `<Id extends string>`, not `SkillId`: fixture-marketplace ids aren't catalogue members. */
export function buildSkillConfig<Id extends string>(
  id: Id,
  overrides?: Partial<Omit<SkillConfig, "id">>,
): Omit<SkillConfig, "id"> & { id: Id } {
  return {
    id,
    scope: overrides?.scope ?? FACTORY_DEFAULT_SCOPE,
    origin: overrides?.origin ?? "eject",
    ...(overrides?.displayName !== undefined && { displayName: overrides.displayName }),
    ...(overrides?.excluded !== undefined && { excluded: overrides.excluded }),
  };
}

/** `<Id extends string>`, not `SkillId`: fixture-marketplace ids aren't catalogue members. */
export function buildSkillConfigs<Id extends string>(
  skillIds: readonly Id[],
  overrides?: Partial<Omit<SkillConfig, "id">>,
): Array<Omit<SkillConfig, "id"> & { id: Id }> {
  return skillIds.map((id) => buildSkillConfig(id, overrides));
}
