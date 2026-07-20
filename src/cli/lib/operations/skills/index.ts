export {
  discoverInstalledSkills,
  discoverLocalProjectSkills,
  mergeSkills,
  type DiscoveredSkills,
} from "./discover-skills.js";
export {
  collectScopedSkillDirs,
  type ScopedSkillDir,
  type ScopedSkillDirsResult,
} from "./collect-scoped-skill-dirs.js";
export { copyLocalSkills, type SkillCopyResult } from "./copy-local-skills.js";
export {
  compareSkillsWithSource,
  buildSourceSkillsMap,
  type SkillComparisonResults,
} from "./compare-skills.js";
export { findSkillMatch, type SkillMatchResult } from "./find-skill-match.js";
export {
  installPluginSkills,
  pluginInstallFailureError,
  type PluginInstallResult,
} from "./install-plugin-skills.js";
export { uninstallPluginSkills, type PluginUninstallResult } from "./uninstall-plugin-skills.js";
