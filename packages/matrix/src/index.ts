// The public API. Import from "@workspace/matrix" only — never reach into ./vendor or ./generated.

export {
  CATALOG,
  buildCatalog,
  createSkillLookup,
  skillById,
} from "./read-model/catalog"
export type {
  Catalog,
  CatalogDomain,
  CatalogCategory,
  CatalogSkill,
  SkillRequirement,
} from "./read-model/catalog"

export {
  SUB_AGENT_GROUPS,
  SUB_AGENTS_BY_ID,
  subAgentById,
} from "./read-model/sub-agents"
export type { SubAgent, SubAgentGroup } from "./read-model/sub-agents"

export {
  STACKS,
  buildStacks,
  createStackExpander,
  expandStack,
} from "./read-model/stacks"
export type { CatalogStack, StackExpansion } from "./read-model/stacks"

export {
  DOMAIN_ORDER,
  DOMAIN_LABELS,
  DOMAIN_DESCRIPTIONS,
  compareDomains,
  isDomain,
} from "./read-model/domains"

export {
  PRELOAD_DEFAULTS,
  ROLE_FLAVORS,
  createLoadStateResolver,
  resolveLoadState,
} from "./read-model/preload-defaults"
export {
  createAssignmentResolver,
  resolveAssignment,
} from "./read-model/assignment-defaults"
export type {
  AssignmentTarget,
  SkillTaxonomy,
} from "./read-model/assignment-defaults"
export type {
  LoadState,
  RoleFlavor,
  PreloadDefaults,
  ResolveLoadStateInput,
} from "./read-model/preload-defaults"

export { DEFAULT_SELECTION_OPTIONS } from "./read-model/selection-defaults"

export {
  catalogFactsOf,
  createSelectionSemantics,
  judgeSelection,
} from "./read-model/selection-semantics"
export type {
  IncompatibilityCause,
  SelectionCatalogFacts,
  SelectionJudgement,
  SelectionSemantics,
  SelectionSkillFacts,
  SelectionVerdict,
  SkillRequirementFacts,
} from "./read-model/selection-semantics"

// The vendored catalogue in its wire shape, beside the version taken off it.
// Exported because the editor's catalogue seat derives from a matrix rather
// than holding a built `Catalog`: a skill added from outside is merged into
// this and the read models are rebuilt, so it is placed, sorted and judged by
// exactly the rules every other skill is — one derivation, no second path.
export { MATRIX, MATRIX_VERSION } from "./read-model/source"

export {
  SELECTION_SCENARIOS,
  DISCOURAGED_PAIRS,
} from "./contract/selection-scenarios"
export type {
  SelectionScenario,
  SelectionDivergence,
} from "./contract/selection-scenarios"

export {
  MAX_EXTERNAL_SKILL_BYTES,
  SEED_VERSION,
  seedModelSchema,
  seedEffortSchema,
  seedLoadStateSchema,
  seedSkillSchema,
  seedAgentSchema,
  seedSkillTreeSchema,
  seedExternalSkillSchema,
  seedPayloadSchema,
} from "./seed"
export type {
  SeedModel,
  SeedEffort,
  SeedLoadState,
  SeedSkill,
  SeedAgent,
  SeedSkillTree,
  SeedExternalSkill,
  SeedPayload,
} from "./seed"

export { matrixSchema } from "./matrix-schema"
export type {
  Matrix,
  MatrixCategory,
  MatrixSkill,
  MatrixStack,
} from "./matrix-schema"

export {
  SKILL_INDEX_FRESHNESS_HEADER,
  skillIndexEntrySchema,
  skillIndexFreshnessSchema,
  skillIndexSchema,
} from "./skill-index"
export type {
  SkillIndexEntry,
  SkillIndex,
  SkillIndexFreshness,
} from "./skill-index"

export { DOMAINS } from "./vendor/generated/source-types"
export type {
  Domain,
  SkillId,
  SkillSlug,
  Category,
  AgentName,
} from "./vendor/generated/source-types"
