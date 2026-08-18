import type {
  AgentName,
  AgentScopeConfig,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillConfig,
  SkillId,
} from "../../../types";
import type { WizardResultV2 } from "../../../components/wizard/wizard";
import type { SourceLoadResult } from "../../loading/source-loader";
import type { ResolvedConfig } from "../../configuration/config";
import type { GateReport } from "../../config-gate/index.js";
import type { TestProjectConfig } from "../fixtures/create-test-source";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { NO_CHANGES } from "../../config-gate/classify.js";
import { NOTHING_RECOMPILED } from "../../config-gate/recompile.js";
import { EJECT_SOURCE } from "../../../consts";
import { TEST_CUSTOM_SOURCE_URL } from "../test-constants.js";
import { buildSkillConfigs, FACTORY_DEFAULT_SCOPE } from "../helpers/wizard-simulation.js";
import type { FixtureProjectConfig } from "../helpers/wizard-simulation.js";

export function buildSourceConfig(
  overrides?: Partial<ResolvedConfig> & Record<string, unknown>,
): Record<string, unknown> {
  // Record return kept: source config is parse-boundary data callers vary with arbitrary fields.
  return {
    marketplace: "github:test-org/skills",
    ...overrides,
  };
}

/**
 * The report a gated config write returns. Defaults to a write that changed the
 * global pair and reached nobody; pass `propagatedTo` for a fan-out, whose
 * projects are all reported as having had their agents rewritten.
 */
export function buildGateReport(
  propagatedTo: string[] = [],
  overrides?: Partial<GateReport>,
): GateReport {
  return {
    globalWritten: true,
    changes: NO_CHANGES,
    propagated: { updated: propagatedTo, skipped: [] },
    recompile: { ...NOTHING_RECOMPILED, rewrittenCount: propagatedTo.length },
    ...overrides,
  };
}

/**
 * Overloaded rather than widened outright: a caller that names catalogue skills
 * still gets a `ProjectConfig` back, and only one that names ids outside the
 * generated union — a fixture marketplace's, see {@link FixtureProjectConfig} —
 * gets the widened shape. Widening the single signature made every unit caller
 * that feeds the result to a production function fail instead.
 */
export function buildProjectConfig(overrides?: Partial<ProjectConfig>): ProjectConfig;
export function buildProjectConfig(overrides: Partial<FixtureProjectConfig>): FixtureProjectConfig;
export function buildProjectConfig(
  overrides?: Partial<FixtureProjectConfig>,
): FixtureProjectConfig {
  return {
    name: "test-project",
    agents: buildAgentConfigs(["web-developer"]),
    skills: buildSkillConfigs(["web-framework-react"]),
    ...overrides,
  };
}

/**
 * A saved config whose PROJECT-LEVEL source ref still sits under the field name it carried
 * before the rename. Deliberately-invalid parse-boundary data — the shape the loader has to
 * refuse rather than pass through — so it is a plain record: `ProjectConfig` has no place to
 * put the key any more. One definition because the schema, the loader and `resolveSource`
 * all have to refuse the same file.
 *
 * The ref is deliberately NOT the default public one: a loader that ignores the stale key
 * falls through to `DEFAULT_SOURCE`, and if the two were the same string nothing could tell
 * a silent repoint from a correct read.
 */
export function buildPreRenameProjectConfig(): Record<string, unknown> {
  return { ...buildProjectConfig(), source: TEST_CUSTOM_SOURCE_URL };
}

/**
 * A saved config one of whose SKILL ENTRIES still carries its provenance under the field
 * name it had before the rename. The entry is spelled out rather than taken from
 * `buildSkillConfigs`, which follows the type and therefore stops producing the old shape
 * the moment the rename lands.
 */
export function buildPreRenameSkillEntryConfig(): Record<string, unknown> {
  return {
    ...buildProjectConfig(),
    skills: [{ id: "web-framework-react", scope: FACTORY_DEFAULT_SCOPE, source: EJECT_SOURCE }],
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
    domainSelections: {},
    selectedDomains: [],
    unresolvableSkillIds: [],
    cancelled: false,
    validation: { valid: true, errors: [] },
    ...overrides,
  };
}

export function buildAgentConfigs(
  agentNames: AgentName[],
  overrides?: Partial<Omit<AgentScopeConfig, "name">>,
): AgentScopeConfig[] {
  return agentNames.map((name) => ({
    name,
    scope: overrides?.scope ?? FACTORY_DEFAULT_SCOPE,
    ...(overrides?.excluded !== undefined && { excluded: overrides.excluded }),
    ...(overrides?.model !== undefined && { model: overrides.model }),
    ...(overrides?.effort !== undefined && { effort: overrides.effort }),
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
  const skillIds = skills.map((s) => (typeof s === "string" ? s : s.id));
  return {
    name: "test-project",
    description: "Test project",
    // Boundary cast: test callers pass loose string agent/skill identifiers
    // (some fictional). Emit the object-shaped config the loader schema requires —
    // buildAgentConfigs/buildSkillConfigs do no matrix lookups, so loose IDs are safe.
    agents: buildAgentConfigs(agents as AgentName[]),
    skills: buildSkillConfigs(skillIds as SkillId[]),
    ...overrides,
  };
}
