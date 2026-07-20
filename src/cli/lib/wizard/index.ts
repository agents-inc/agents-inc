export {
  type BuildStepValidation,
  validateBuildStep,
  buildCategoriesForDomain,
  isCompatibleWithSelectedFrameworks,
  FRAMEWORK_CATEGORY_ID,
} from "./build-step-logic";
export {
  type AgentDiffRow,
  type DiffRowStatus,
  type ScopeDiff,
  type ScopeDiffInput,
  type SkillDiffRow,
  type ScopeBadges,
  computeScopeDiff,
  deriveScopeBadges,
  formatScopeTag,
} from "./scope-diff";
export { orderDomains } from "./domain-order";
