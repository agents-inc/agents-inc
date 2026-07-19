export {
  type BuildStepValidation,
  validateBuildStep,
  buildCategoriesForDomain,
  isCompatibleWithSelectedFrameworks,
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
} from "./scope-diff";
