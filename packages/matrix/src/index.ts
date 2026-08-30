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

// The roster as the CLI's own metadata.yaml files declare it, beside the read
// model built from it. `SubAgent` is the shape the grid and the roster need —
// a label, a domain, a flavor — and it deliberately drops `tools`,
// `disallowedTools` and `permissionMode`, which nothing on screen shows. A
// COMPILED sub-agent's frontmatter is written from exactly those, so the
// editor's output preview needs the definitions rather than the read model:
// `tools: {{ agent.tools | join: ", " }}` is the third line of every agent the
// CLI writes, and a preview built from `SubAgent` would emit it empty.
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

// The CLI's own domain types, vendored here byte-for-byte by
// scripts/generate-matrix-package.ts and surfaced so `@workspace/compile` can
// render against the SAME declarations the CLI writes with rather than a second
// copy of them. A structurally-equal duplicate would type-check on the day it
// was written and diverge silently on the first field either side added, which
// is the whole failure the vendoring exists to prevent.
export { EFFORT_NAMES, MODEL_NAMES } from "./vendor/matrix"
export type {
  CategoryDefinition,
  CategoryMap,
  DomainSelections,
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
