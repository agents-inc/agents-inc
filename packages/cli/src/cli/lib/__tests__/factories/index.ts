export {
  createTestSkill,
  createMockSkill,
  createMockExtractedSkill,
  createMockSkillEntry,
  testSkillToResolvedSkill,
  createMockSkillDefinition,
  createMockSkillAssignment,
  sa,
  createMockCopiedSkill,
  createMockMultiSourceSkill,
  createMockSkillSource,
} from "./skill-factories.js";

export {
  createMockAgent,
  createMockAgentConfig,
  createMockCompiledAgentData,
} from "./agent-factories.js";

export {
  createMockMatrix,
  createMatrixFromTestSkills,
  buildCategoryMap,
  createComprehensiveMatrix,
  createBasicMatrix,
  createMockMatrixConfig,
} from "./matrix-factories.js";
export type { MockMatrixConfig } from "./matrix-factories.js";

export {
  buildSourceConfig,
  buildProjectConfig,
  buildWizardResult,
  buildAgentConfigs,
  buildSourceResult,
  initMatrixAndSource,
  buildTestProjectConfig,
  buildConfigWriteResult,
} from "./config-factories.js";

export {
  renderUnparseableConfigTs,
  renderConfigTsWithoutDefaultExport,
  renderSchemaViolatingConfigTs,
} from "./unloadable-config-factories.js";

export {
  createMockResolvedStack,
  createMockStack,
  createMockRawStacksConfig,
  createMockRawStacksConfigWithArrays,
  createMockRawStacksConfigWithObjects,
} from "./stack-factories.js";

export {
  createMockCompileConfig,
  createMockMarketplace,
  createMockMarketplacePlugin,
} from "./plugin-factories.js";

export {
  buildUserPluginInstallation,
  buildProjectPluginInstallation,
  renderInstalledPluginsRegistry,
  renderEnabledPluginsSettings,
} from "./plugin-registry-factories.js";

export { buildClaudeSettings, buildClaudeTrustState } from "./claude-settings-factories.js";

export { createMockCategory } from "./category-factories.js";

export { buildInstallation, buildPluginInstallation } from "./installation-factories.js";

export {
  buildLoadedSource,
  buildDiscoveredSkills,
  buildCompilationResult,
  buildSkillCopyResult,
} from "./operation-result-factories.js";

export { buildRecompileAgentsResult } from "./recompile-factories.js";
