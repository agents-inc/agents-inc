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

// The roster as the CLI's metadata.yaml files declare it. The output preview
// needs these definitions: `SubAgent` drops `tools`, which compiled frontmatter
// is written from.
export { AGENT_DEFINITIONS } from "./generated/agents"
export type { GeneratedAgentDefinition } from "./generated/agents"

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

// The vendored catalogue in its wire shape. The editor merges external skills
// into it and rebuilds the read models, so they follow every other skill's rules.
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
  seedScopeSchema,
  installableSeedPayloadSchema,
  isSeedScopePairWritable,
  seedAgentScope,
  unwritableSeedAssignments,
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
  SeedScope,
  UnwritableSeedAssignment,
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

export {
  AGENT_NAMES,
  DOMAINS,
  SKILL_IDS,
} from "./vendor/generated/source-types"
export type {
  Domain,
  SkillId,
  SkillSlug,
  Category,
  AgentName,
} from "./vendor/generated/source-types"

// The CLI's own domain types, vendored byte-for-byte by
// scripts/generate-matrix-package.ts so `@workspace/compile` renders against the
// same declarations the CLI writes with.
export { CODEX_MODEL_NAMES, EFFORT_NAMES, MODEL_NAMES } from "./vendor/matrix"
export type {
  CategoryDefinition,
  CategoryMap,
  CodexModelName,
  EffortLevel,
  MergedSkillsMatrix,
  ModelName,
  PermissionMode,
  ResolvedSkill,
  SelectionValidation,
  ValidationError,
} from "./vendor/matrix"
export type {
  CategoryPath,
  PluginSkillRef,
  Skill,
  SkillAssignment,
  SkillDefinition,
} from "./vendor/skills"
export type {
  AgentConfig,
  AgentDefinition,
  AgentHookDefinition,
  CompiledAgentData,
} from "./vendor/agents"
export type {
  AgentScopeConfig,
  ProjectConfig,
  SkillConfig,
  SkillScope,
} from "./vendor/config"
export type { Stack, StackAgentConfig } from "./vendor/stacks"
