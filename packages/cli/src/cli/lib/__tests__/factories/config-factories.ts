import type {
  AgentName,
  AgentScopeConfig,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillConfig,
  SkillId,
} from "../../../types";
import type { InstallSelection } from "@workspace/compile/seed-to-config";
import type { SourceLoadResult } from "../../loading/source-loader";
import type { ResolvedConfig } from "../../configuration/config";
import type { GateReport } from "../../config-gate/index.js";
import type { ConfigWriteResult } from "../../operations/index.js";
import type { TestProjectConfig } from "../fixtures/create-test-source";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { NO_CHANGES } from "../../config-gate/classify.js";
import { NOTHING_RECOMPILED } from "../../config-gate/recompile.js";
import { EJECT_SOURCE } from "../../../consts";
import { TEST_CUSTOM_SOURCE_URL } from "../test-constants.js";
import { typedKeys } from "../../../utils/typed-object";
import { buildSkillConfigs, FACTORY_DEFAULT_SCOPE } from "../helpers/skill-config-builders.js";
import type { FixtureProjectConfig } from "../helpers/skill-config-builders.js";

export function buildSourceConfig(
  overrides?: Partial<ResolvedConfig> & Record<string, unknown>,
): Record<string, unknown> {
  // A plain record: source config is parse-boundary data callers vary freely.
  return {
    marketplace: "github:test-org/skills",
    ...overrides,
  };
}

/** Defaults to a write that changed the global pair and reached nobody. */
export function buildGateReport(
  propagatedTo: string[] = [],
  overrides?: Partial<GateReport>,
): GateReport {
  return {
    globalWritten: true,
    changes: NO_CHANGES,
    propagated: { updated: propagatedTo, unreadable: [], gone: [], notOurs: [], failed: [] },
    recompile: { ...NOTHING_RECOMPILED, rewrittenCount: propagatedTo.length },
    ...overrides,
  };
}

/** A fresh write whose gate reached nobody. `config` and `configPath` have no default. */
export function buildConfigWriteResult(
  config: ProjectConfig,
  configPath: string,
  overrides?: Partial<ConfigWriteResult>,
): ConfigWriteResult {
  return { config, configPath, wasMerged: false, propagation: buildGateReport(), ...overrides };
}

/**
 * Overloaded: catalogue ids get a `ProjectConfig`; only ids outside the generated union (see
 * {@link FixtureProjectConfig}) get the widened shape.
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
 * Invalid parse-boundary data: the project-level ref under its pre-rename key. The ref is not the
 * default public one, so a loader ignoring the stale key cannot pass by coincidence.
 */
export function buildPreRenameProjectConfig(): Record<string, unknown> {
  return { ...buildProjectConfig(), source: TEST_CUSTOM_SOURCE_URL };
}

/** Spelled out, because `buildSkillConfigs` follows the type and cannot produce the old shape. */
export function buildPreRenameSkillEntryConfig(): Record<string, unknown> {
  return {
    ...buildProjectConfig(),
    skills: [{ id: "web-framework-react", scope: FACTORY_DEFAULT_SCOPE, source: EJECT_SOURCE }],
  };
}

export function buildInstallSelection(
  skills: SkillConfig[],
  overrides?: Partial<InstallSelection>,
): InstallSelection {
  const selectedAgents = overrides?.selectedAgents ?? [];
  // generateProjectConfigFromSkills requires a config per selected agent; override to test a
  // mismatch.
  const defaultAgentConfigs =
    selectedAgents.length > 0 ? buildAgentConfigs([...selectedAgents]) : [];
  return {
    skills,
    selectedAgents: [],
    agentConfigs: defaultAgentConfigs,
    assignedStack: {},
    selectedStackId: null,
    selectedDomains: [],
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
    ...(overrides?.codexModel !== undefined && { codexModel: overrides.codexModel }),
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
    marketplaceSkillIds: new Set(typedKeys<SkillId>(matrix.skills)),
    ...overrides,
  };
}

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
    // Boundary cast: loose test identifiers, some fictional; the builders do no matrix lookups.
    agents: buildAgentConfigs(agents as AgentName[]),
    skills: buildSkillConfigs(skillIds as SkillId[]),
    ...overrides,
  };
}
