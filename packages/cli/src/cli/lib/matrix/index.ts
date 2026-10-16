export { loadSkillCategories, loadSkillRules, extractAllSkills } from "./matrix-loader";

export {
  claimSlug,
  mergeMatrixWithSkills,
  relationshipsForSource,
  synthesizeCategory,
} from "./skill-resolution";

export { type MatrixHealthIssue, checkMatrixHealth } from "./matrix-health-check";

export { matrix, initializeMatrix, getSkillById } from "./matrix-provider";
