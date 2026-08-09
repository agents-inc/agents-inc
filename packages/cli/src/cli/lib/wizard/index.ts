export {
  type BuildStepValidation,
  validateBuildStep,
  buildCategoriesForDomain,
} from "./build-step-logic";
export {
  type AgentDiffRow,
  type DiffRowStatus,
  type ScopeDiff,
  type ScopeDiffInput,
  type SkillDiffRow,
  type ScopeBadges,
  agentSlotKey,
  computeScopeDiff,
  deriveScopeBadges,
  formatScopeTag,
  skillSlotKey,
} from "./scope-diff";
export { orderDomains } from "./domain-order";
