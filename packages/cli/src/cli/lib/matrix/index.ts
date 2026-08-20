export { loadSkillCategories, loadSkillRules, extractAllSkills } from "./matrix-loader";

export {
  claimSlug,
  mergeMatrixWithSkills,
  relationshipsForSource,
  synthesizeCategory,
} from "./skill-resolution";

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
