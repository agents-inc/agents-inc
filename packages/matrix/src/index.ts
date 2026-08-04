// The public API. Import from "@workspace/matrix" only — never reach into ./vendor or ./generated.

export { CATALOG } from "./read-model/catalog"
export type {
  Catalog,
  CatalogDomain,
  CatalogCategory,
  CatalogSkill,
  SkillRequirement,
} from "./read-model/catalog"

export { SUB_AGENT_GROUPS, SUB_AGENTS_BY_ID } from "./read-model/sub-agents"
export type { SubAgent, SubAgentGroup } from "./read-model/sub-agents"

export { STACKS, expandStack } from "./read-model/stacks"
export type { CatalogStack, StackExpansion } from "./read-model/stacks"

export {
  DOMAIN_ORDER,
  DOMAIN_LABELS,
  DOMAIN_DESCRIPTIONS,
  compareDomains,
} from "./read-model/domains"

export { MATRIX_VERSION } from "./read-model/source"

export {
  SEED_VERSION,
  seedModelSchema,
  seedEffortSchema,
  seedLoadStateSchema,
  seedSkillSchema,
  seedAgentSchema,
  seedPayloadSchema,
} from "./seed"
export type {
  SeedModel,
  SeedEffort,
  SeedLoadState,
  SeedSkill,
  SeedAgent,
  SeedPayload,
} from "./seed"

export { DOMAINS } from "./vendor/generated/source-types"
export type {
  Domain,
  SkillId,
  SkillSlug,
  Category,
  AgentName,
} from "./vendor/generated/source-types"
