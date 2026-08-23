export { loadSkillCategories, loadSkillRules, extractAllSkills } from "./matrix-loader";

export {
  claimSlug,
  mergeMatrixWithSkills,
  relationshipsForSource,
  synthesizeCategory,
} from "./skill-resolution";

export {
  getUnmetRequiredBy,
  getCellState,
  hasUnmetRequirements,
  getUnmetRequirementsReason,
  validateSelection,
  getAvailableSkills,
  getSkillsByCategory,
} from "./matrix-resolver";

export { type MatrixHealthIssue, checkMatrixHealth } from "./matrix-health-check";

export { matrix, initializeMatrix, getSkillById, findStack } from "./matrix-provider";
