export {
  loadSkillCategories,
  loadSkillRules,
  extractAllSkills,
  loadAndMergeSkillsMatrix,
} from "./matrix-loader";

export { mergeMatrixWithSkills, synthesizeCategory } from "./skill-resolution";

export {
  getDependentSkills,
  getUnmetRequiredBy,
  isDiscouraged,
  getDiscourageReason,
  isIncompatible,
  getIncompatibleReason,
  getCellState,
  getImpliedSkills,
  hasUnmetRequirements,
  getUnmetRequirementsReason,
  validateSelection,
  getAvailableSkills,
  getSkillsByCategory,
} from "./matrix-resolver";

export { type MatrixHealthIssue, checkMatrixHealth } from "./matrix-health-check";

export {
  matrix,
  initializeMatrix,
  getSkillById,
  getSkillBySlug,
  findStack,
} from "./matrix-provider";
