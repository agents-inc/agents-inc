export { type FetchSkillsOptions, fetchSkills } from "./skill-fetcher";

export {
  type ForkedFromMetadata,
  type LocalSkillMetadata,
  type SkillComparisonResult,
  readForkedFromMetadata,
  readLocalSkillMetadata,
  getLocalSkillsWithMetadata,
  computeSourceHash,
  compareLocalSkillsWithSource,
  injectForkedFromMetadata,
} from "./skill-metadata";

export {
  type CopiedSkill,
  type CopyProgressCallback,
  copySkill,
  copySkillFromSource,
  copySkillsToPluginFromSource,
  copySkillsToLocalFlattened,
} from "./skill-copier";

export {
  type SkillPluginOptions,
  type CompiledSkillPlugin,
  type SkillCompilationRun,
  compileSkillPlugin,
  compileAllSkillPlugins,
  printCompilationSummary,
} from "./skill-plugin-compiler";

export { type LocalSkillDiscoveryResult, discoverLocalSkills } from "./local-skill-loader";

export { deleteLocalSkill, migrateLocalSkillScope } from "./source-switcher";
