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
export {
  type AgentGroup,
  type AgentItem,
  BUILT_IN_AGENT_GROUPS,
  BUILT_IN_AGENT_IDS,
  firstFocusableAgent,
} from "./agent-roster";
