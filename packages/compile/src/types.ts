/**
 * The vocabulary an emission is written in.
 *
 * Every one of these is the CLI's own declaration, vendored into
 * `@workspace/matrix` byte-for-byte by `packages/cli/scripts/generate-matrix-package.ts`
 * and surfaced from its barrel. They are re-exported rather than restated on
 * purpose: a structurally-equal copy type-checks on the day it is written and
 * diverges silently on the first field either side adds, which is exactly the
 * drift the vendoring plus its `generate:matrix:check` gate exists to prevent.
 */
export type {
  AgentConfig,
  AgentDefinition,
  AgentName,
  AgentScopeConfig,
  Category,
  CategoryPath,
  CompiledAgentData,
  Domain,
  DomainSelections,
  EffortLevel,
  ModelName,
  PluginSkillRef,
  ProjectConfig,
  ResolvedSkill,
  SelectionValidation,
  Skill,
  SkillAssignment,
  SkillConfig,
  SkillId,
  SkillScope,
  Stack,
  StackAgentConfig,
  ValidationError,
} from "@workspace/matrix"
