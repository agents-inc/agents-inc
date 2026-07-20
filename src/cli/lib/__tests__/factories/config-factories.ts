import type {
  AgentName,
  AgentScopeConfig,
  DomainSelections,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillConfig,
} from "../../../types";
import type { WizardResultV2 } from "../../../components/wizard/wizard";
import type { SourceLoadResult } from "../../loading/source-loader";
import type { ResolvedConfig } from "../../configuration/config";
import type { TestProjectConfig } from "../fixtures/create-test-source";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";

export function buildSourceConfig(
  overrides?: Partial<ResolvedConfig> & Record<string, unknown>,
): Record<string, unknown> {
  // Record return kept: source config is parse-boundary data callers vary with arbitrary fields.
  return {
    source: "github:test-org/skills",
    ...overrides,
  };
}

export function buildProjectConfig(overrides?: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: "test-project",
    agents: [{ name: "web-developer", scope: "project" }],
    skills: buildSkillConfigs(["web-framework-react"]),
    ...overrides,
  };
}

export function buildWizardResult(
  skills: SkillConfig[],
  overrides?: Partial<WizardResultV2>,
): WizardResultV2 {
  const selectedAgents = overrides?.selectedAgents ?? [];
  // Keep agentConfigs in sync with selectedAgents by default — the production
  // pipeline (generateProjectConfigFromSkills) requires every selected agent
  // to have a matching AgentScopeConfig. Callers can override agentConfigs
  // explicitly to test mismatch behavior.
  const defaultAgentConfigs =
    selectedAgents.length > 0 ? buildAgentConfigs([...selectedAgents]) : [];
  return {
    skills,
    selectedAgents: [],
    agentConfigs: defaultAgentConfigs,
    selectedStackId: null,
    domainSelections: {} as DomainSelections,
    selectedDomains: [],
    unresolvableSkillIds: [],
    cancelled: false,
    validation: { valid: true, errors: [], warnings: [] },
    ...overrides,
  };
}

export function buildAgentConfigs(
  agentNames: AgentName[],
  overrides?: Partial<Omit<AgentScopeConfig, "name">>,
): AgentScopeConfig[] {
  return agentNames.map((name) => ({
    name,
    scope: overrides?.scope ?? "project",
    ...(overrides?.excluded !== undefined && { excluded: overrides.excluded }),
  }));
}

export function buildSourceResult(
  matrix: MergedSkillsMatrix,
  sourcePath: string,
  overrides?: Partial<SourceLoadResult>,
): SourceLoadResult {
  const sourceConfig: ResolvedConfig = {
    source: sourcePath,
    sourceOrigin: "flag",
  };
  return {
    matrix,
    sourceConfig,
    sourcePath,
    isLocal: true,
    ...overrides,
  };
}

/**
 * Registers the matrix with the provider and returns a SourceLoadResult for it.
 * Composes initializeMatrix + buildSourceResult — the common per-test arrange
 * step for integration tests that both set the active matrix and pass a source
 * result into an install/copy operation.
 */
export function initMatrixAndSource(
  matrix: MergedSkillsMatrix,
  sourcePath: string,
  overrides?: Partial<SourceLoadResult>,
): SourceLoadResult {
  initializeMatrix(matrix);
  return buildSourceResult(matrix, sourcePath, overrides);
}

export function buildTestProjectConfig(
  agents: string[],
  skills: Array<string | { id: string }>,
  overrides?: Partial<TestProjectConfig>,
): TestProjectConfig {
  return {
    name: "test-project",
    description: "Test project",
    agents,
    skills,
    ...overrides,
  };
}
