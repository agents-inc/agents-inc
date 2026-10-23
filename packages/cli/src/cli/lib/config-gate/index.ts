import os from "os";
import path from "path";
import type { ProjectConfig } from "../../types";
import type { AuthoritativeScope } from "../configuration/config-merger";
import { CLI_INVOKE_COMMAND } from "../../consts";
import { ensureDir, writeFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { isHomeDirectory } from "../installation/is-home-directory";
import type { Provider } from "../../consts";
import { getInstalledConfigPath, getProjectConfigPath } from "../installation/install-base-dir";
import { providerInUse } from "../installation/install-layout";
import { loadProjectConfigFromDir } from "../configuration/project-config";
import { normalizeStackRecord } from "../stacks/stacks-loader";
import { splitConfigByScope } from "../configuration/config-generator";
import { matrix as activeMatrix } from "../matrix/matrix-provider";
import { generateConfigSource } from "../configuration/config-writer";
import {
  buildConfigTypesBackgroundData,
  regenerateConfigTypes,
  type ConfigTypesExtras,
} from "../configuration/config-types-writer";
import {
  classifyGlobalChange,
  consequenceTier,
  tierPropagates,
  tierRegeneratesTypes,
  NO_CHANGES,
  type GlobalChangeSet,
} from "./classify.js";
import { resolveGateDeps, type GateDeps, type LoadedGateDeps } from "./deps.js";
import { GlobalPairWriteViolation, withGateToken } from "./gate-token.js";
import {
  ensureBlankPair as ensureBlankPairInternal,
  writeGlobalConfigHalf,
  writeGlobalPair,
  writeGlobalTypesHalf,
} from "./pair-writer.js";
import {
  buildProjectTypesExtras,
  mergeGlobalConfigs,
  normalizeProjectPath,
  propagateGlobalChangesToProjects,
  pruneGlobalEntriesFromRegisteredProjects,
  reconcileProjectSplitAgainstGlobal,
  resolveEffectiveGlobalConfig,
  writeProjectConfigPair,
  type PropagationResult,
} from "./propagate.js";
import { NOTHING_RECOMPILED, pairRewriteSummary, recompilePropagated } from "./recompile.js";
import { pairsRewrittenSince, snapshotProjectPairs } from "./pair-snapshot.js";
import type { PropagatedRecompileSummary } from "../operations/project/recompile-project-agents.js";

export type { GateDeps } from "./deps.js";
export type { ConsequenceTier, GlobalChangeSet } from "./classify.js";
export { GlobalPairWriteViolation } from "./gate-token.js";

/** A propagating write recompiles the propagated projects itself, so no caller can forget to. */
export type GateReport = {
  /** True when either half of the global pair was actually rewritten. */
  globalWritten: boolean;
  changes: GlobalChangeSet;
  propagated: PropagationResult;
  recompile: PropagatedRecompileSummary;
};

/**
 * Only these entry points mint the pair-write privilege, held across each whole consequence flow;
 * the private writers require it. `writeProjectPartial` is the exception: it refuses the home
 * directory and writes only a project's own config.
 */

const NOTHING_PROPAGATED: PropagationResult = {
  updated: [],
  unreadable: [],
  gone: [],
  notOurs: [],
  failed: [],
};

/** Whether a gated write moved anything the global install's compiled sub-agents are built from. */
export function movedGlobalAgentInputs(written: GateReport): boolean {
  return tierRegeneratesTypes(consequenceTier(written.changes));
}

function report(
  globalWritten: boolean,
  changes: GlobalChangeSet,
  propagated: PropagationResult = NOTHING_PROPAGATED,
  recompile: PropagatedRecompileSummary = NOTHING_RECOMPILED,
): GateReport {
  return { globalWritten, changes, propagated, recompile };
}

type FanOut = { propagated: PropagationResult; recompile: PropagatedRecompileSummary };

/**
 * Runs `propagate` over the registered projects, then recompiles what it updated where `recompiles`.
 * A project whose config pair changed counts as rewritten whether or not its sub-agents did.
 */
async function fanOut(
  projects: readonly string[],
  provider: Provider,
  propagate: () => Promise<PropagationResult>,
  recompiles: boolean,
): Promise<FanOut> {
  const pairsBefore = await snapshotProjectPairs(projects, provider);
  const propagated = await propagate();
  const pairsRewritten = await pairsRewrittenSince(pairsBefore, propagated.updated, provider);

  const recompile = recompiles
    ? await recompilePropagated(propagated.updated, pairsRewritten)
    : pairRewriteSummary(propagated.updated, pairsRewritten);
  return { propagated, recompile };
}

function sayPropagated(propagated: PropagationResult): void {
  if (propagated.updated.length > 0) {
    verbose(`Propagated global changes to ${propagated.updated.length} project(s)`);
  }
}

/** `currentProjectDir` is left out of the fan-out: its pair and agents are the caller's. */
async function applyConsequences(
  globalConfig: ProjectConfig,
  changes: GlobalChangeSet,
  deps: LoadedGateDeps,
  provider: Provider,
  currentProjectDir?: string,
): Promise<FanOut> {
  const tier = consequenceTier(changes);
  const projects = globalConfig.projects ?? [];
  if (!tierPropagates(tier) || projects.length === 0) {
    return { propagated: NOTHING_PROPAGATED, recompile: NOTHING_RECOMPILED };
  }

  const regenerateTypes = tierRegeneratesTypes(tier);
  const reached = await fanOut(
    projects,
    provider,
    () =>
      propagateGlobalChangesToProjects(globalConfig, deps.agents, provider, currentProjectDir, {
        regenerateTypes,
      }),
    regenerateTypes,
  );
  sayPropagated(reached.propagated);
  return reached;
}

/**
 * Nothing is fetched unless classification needs it, so a registration-only mutation stays offline.
 */
export function lazyGateDeps(projectDir: string): GateDeps {
  return {
    loadMatrix: async () => {
      const { loadSkillsMatrixFromSource } = await import("../loading/source-loader.js");
      const { matrix } = await loadSkillsMatrixFromSource({
        projectDir,
        skipExtraSources: true,
        matrixOnly: true,
      });
      return matrix;
    },
    loadAgents: async () => {
      const { loadAgentDefs } = await import("../operations/project/load-agent-defs.js");
      return (await loadAgentDefs()).agents;
    },
  };
}

export type WriteConfigByScopeArgs = {
  finalConfig: ProjectConfig;
  matrix: LoadedGateDeps["matrix"];
  agents: LoadedGateDeps["agents"];
  projectDir: string;
  projectConfigPath: string;
  projectInstallationExists: boolean;
  /**
   * Read by the project branch only: whether the global config matches this session or absorbs it.
   */
  authoritativeScope?: AuthoritativeScope;
};

/** From a project, splits config and types by scope; from home, writes one standalone config. */
export async function writeConfigByScope(args: WriteConfigByScopeArgs): Promise<GateReport> {
  return withGateToken(async () => {
    const { matrix, agents, projectDir } = args;
    // os.homedir() at call time, matching getGlobalConfigImportPath().
    const homeDir = os.homedir();
    const deps: LoadedGateDeps = { matrix, agents };

    return isHomeDirectory(projectDir)
      ? writeFromHome(args, homeDir, deps)
      : writeFromProjectContext(args, homeDir, deps);
  });
}

/** At home the project IS the global installation, so the provider is home's own. */
async function writeFromHome(
  args: WriteConfigByScopeArgs,
  homeDir: string,
  deps: LoadedGateDeps,
): Promise<GateReport> {
  const { finalConfig, projectConfigPath } = args;
  const provider = providerInUse(homeDir);
  const priorGlobal = await loadProjectConfigFromDir(homeDir, provider);
  const changes = classifyGlobalChange(priorGlobal?.config, finalConfig);
  const globalWritten = await writeGlobalPair(
    finalConfig,
    projectConfigPath,
    deps.matrix,
    deps.agents,
  );

  const { propagated, recompile } = await applyConsequences(finalConfig, changes, deps, provider);
  return report(globalWritten, changes, propagated, recompile);
}

async function writeFromProjectContext(
  args: WriteConfigByScopeArgs,
  homeDir: string,
  deps: LoadedGateDeps,
): Promise<GateReport> {
  const { finalConfig, projectDir } = args;

  const { global: globalConfig, project: projectSplitConfig } = splitConfigByScope(finalConfig);
  // The project's provider: each provider family inherits and propagates only within itself.
  const provider = providerInUse(projectDir);
  const globalConfigPath = getProjectConfigPath(homeDir, provider);

  // Merged into the existing global config: project init adds, never removes.
  const existingGlobal = await loadProjectConfigFromDir(homeDir, provider);
  const effective = await resolveEffectiveGlobalConfig(
    globalConfig,
    existingGlobal?.config,
    projectDir,
    args.authoritativeScope,
  );
  const effectiveGlobalConfig = effective.config;

  const changes = classifyGlobalChange(existingGlobal?.config, effectiveGlobalConfig);
  const globalWritten = await writeGlobalPairWhenChanged(effective, globalConfigPath, deps);

  const { propagated, recompile } = await applyConsequences(
    effectiveGlobalConfig,
    changes,
    deps,
    provider,
    projectDir,
  );

  // Reconcile with the inlined global, or a colliding global entry lands active beside ours.
  const reconciledProjectConfig = reconcileProjectSplitAgainstGlobal(
    projectSplitConfig,
    effectiveGlobalConfig,
    deps.matrix,
  );
  await writeProjectPairWhenOwed(
    args,
    provider,
    reconciledProjectConfig,
    effectiveGlobalConfig,
    deps,
  );

  return report(globalWritten, changes, propagated, recompile);
}

async function writeGlobalPairWhenChanged(
  effective: { config: ProjectConfig; changed: boolean },
  globalConfigPath: string,
  deps: LoadedGateDeps,
): Promise<boolean> {
  if (!effective.changed) {
    verbose("Global config unchanged, skipping write");
    return false;
  }

  await ensureDir(path.dirname(globalConfigPath));
  const written = await writeGlobalPair(
    effective.config,
    globalConfigPath,
    deps.matrix,
    deps.agents,
  );
  verbose(`Updated global config at ${globalConfigPath}`);
  return written;
}

/** Skips only when no project installation exists and nothing is the project's own. */
async function writeProjectPairWhenOwed(
  project: Pick<
    WriteConfigByScopeArgs,
    "projectDir" | "projectConfigPath" | "projectInstallationExists"
  >,
  provider: Provider,
  reconciledProjectConfig: ProjectConfig,
  effectiveGlobalConfig: ProjectConfig,
  deps: LoadedGateDeps,
): Promise<void> {
  if (!project.projectInstallationExists && !holdsAnythingOfItsOwn(reconciledProjectConfig)) {
    verbose(
      "Skipped project config — no existing project installation and no project-scoped items",
    );
    return;
  }

  await ensureDir(path.dirname(project.projectConfigPath));
  await writeProjectConfigPair(
    project.projectDir,
    provider,
    reconciledProjectConfig,
    effectiveGlobalConfig,
    deps.matrix,
    deps.agents,
  );
  verbose(`Updated project config at ${project.projectConfigPath}`);
}

function holdsAnythingOfItsOwn(projectConfig: ProjectConfig): boolean {
  return projectConfig.skills.length > 0 || projectConfig.agents.length > 0;
}

/** Matches `writeConfigByScope`'s writer choice; writes no config half; false at project scope. */
export async function writeScopeConfigTypes(
  projectDir: string,
  config: ProjectConfig,
  deps: LoadedGateDeps,
  extras?: ConfigTypesExtras,
): Promise<boolean> {
  return withGateToken(async () => {
    if (isHomeDirectory(projectDir)) {
      return writeGlobalTypesHalf(
        config,
        getInstalledConfigPath(projectDir),
        deps.matrix,
        deps.agents,
        extras,
      );
    }

    await regenerateConfigTypes(
      projectDir,
      Promise.resolve(buildConfigTypesBackgroundData(deps.matrix, deps.agents)),
      extras ?? buildProjectTypesExtras(config, deps.matrix),
    );
    return false;
  });
}

/**
 * The config on disk is the truth and survives. At home the fan-out is unconditional, since a hand
 * edit leaves nothing to diff; elsewhere nothing propagates.
 */
export async function reconcileTypesFromDisk(
  projectDir: string,
  config: ProjectConfig,
  deps: LoadedGateDeps,
  options?: { extras?: ConfigTypesExtras; currentProjectDir?: string },
): Promise<GateReport> {
  return withGateToken(async () => {
    const changes = classifyGlobalChange(undefined, config);
    const globalWritten = await writeScopeConfigTypes(projectDir, config, deps, options?.extras);

    if (!isHomeDirectory(projectDir)) return report(false, changes);
    if (!config.projects?.length) return report(globalWritten, changes);

    const provider = providerInUse(projectDir);
    const { propagated, recompile } = await fanOut(
      config.projects,
      provider,
      () =>
        propagateGlobalChangesToProjects(config, deps.agents, provider, options?.currentProjectDir),
      true,
    );
    sayPropagated(propagated);

    return report(globalWritten, changes, propagated, recompile);
  });
}

/** Closed, so no caller-authored transform runs inside the only code allowed to write the pair. */
export type GlobalMutation =
  | {
      kind: "deregister-project";
      projectDir: string;
      /** The project's: of the two globals a home may hold, it is registered with its own. */
      provider: Provider;
    }
  | { kind: "set-source"; source: string; fallbackName: string };

/** The config on disk with required fields filled, so a scalar mutation cannot empty an install. */
function fillRequiredFields(
  partial: Partial<ProjectConfig>,
  fallbackName: string | undefined,
): ProjectConfig {
  const name = partial.name ?? fallbackName;
  if (!name) {
    throw new Error(
      `Cannot write config: no project config found. Run \`${CLI_INVOKE_COMMAND} init\` first.`,
    );
  }
  return { ...partial, name, skills: partial.skills ?? [], agents: partial.agents ?? [] };
}

/** Applies a mutation to the config on disk, or null when it is a no-op. */
function applyMutation(
  mutation: GlobalMutation,
  current: Partial<ProjectConfig>,
): Partial<ProjectConfig> | null {
  switch (mutation.kind) {
    case "deregister-project": {
      const projects = current.projects ?? [];
      if (projects.length === 0) return null;
      const normalized = normalizeProjectPath(mutation.projectDir);
      const filtered = projects.filter((p) => p !== normalized);
      return filtered.length === projects.length ? null : { ...current, projects: filtered };
    }
    case "set-source":
      return { ...current, marketplace: mutation.source };
    default: {
      const _exhaustive: never = mutation;
      return _exhaustive;
    }
  }
}

/** A `set-source` runs at home, whose installation is the global it mutates. */
function globalProviderFor(mutation: GlobalMutation, homeDir: string): Provider {
  return mutation.kind === "deregister-project" ? mutation.provider : providerInUse(homeDir);
}

/** The name a mutation invents when the global config has none yet. */
function fallbackNameFor(mutation: GlobalMutation): string | undefined {
  return mutation.kind === "set-source" ? mutation.fallbackName : undefined;
}

/** Every mutation is classified: a source change propagates, a deregistration does not. */
export async function mutateGlobal(mutation: GlobalMutation, deps: GateDeps): Promise<GateReport> {
  return withGateToken(async () => {
    const homeDir = os.homedir();
    const provider = globalProviderFor(mutation, homeDir);
    // The full loader normalizes the stack; re-emitting bare values drops exclusive categories.
    const loadedGlobal = await loadProjectConfigFromDir(homeDir, provider);
    if (!loadedGlobal) return report(false, NO_CHANGES);

    const current = loadedGlobal.config;
    const mutated = applyMutation(mutation, current);
    if (!mutated) return report(false, NO_CHANGES);

    const prior = fillRequiredFields(current, fallbackNameFor(mutation));
    const next = fillRequiredFields(mutated, fallbackNameFor(mutation));
    const changes = classifyGlobalChange(prior, next);

    const globalWritten = await writeGlobalConfigHalf(
      next,
      getProjectConfigPath(homeDir, provider),
    );
    if (!next.projects?.length) return report(globalWritten, changes);

    const loaded = await resolveGateDeps(deps, consequenceTier(changes));
    if (!loaded) return report(globalWritten, changes);

    const { propagated, recompile } = await applyConsequences(next, changes, loaded, provider);
    return report(globalWritten, changes, propagated, recompile);
  });
}

/**
 * Prunes CLI-inlined global entries from registered projects after a global uninstall. Call it
 * after the global manifest is removed. `provider` is passed because its folder is already gone.
 */
export async function propagateGlobalRemoval(
  preRemovalGlobalConfig: ProjectConfig,
  deps: LoadedGateDeps,
  provider: Provider,
): Promise<GateReport> {
  return withGateToken(async () => {
    const changes = classifyGlobalChange(preRemovalGlobalConfig, {
      ...preRemovalGlobalConfig,
      skills: [],
      agents: [],
    });

    const { propagated, recompile } = await fanOut(
      preRemovalGlobalConfig.projects ?? [],
      provider,
      () => pruneGlobalEntriesFromRegisteredProjects(preRemovalGlobalConfig, deps.agents, provider),
      true,
    );

    return report(false, changes, propagated, recompile);
  });
}

/** No classification or fan-out: a pair created here has no registered projects. */
export async function ensureBlankPair(provider: Provider): Promise<boolean> {
  return withGateToken(() => ensureBlankPairInternal(provider));
}

export type WriteProjectPartialOptions = {
  /** Name to invent when the partial has none. Absent → a missing name is an error. */
  fallbackName?: string;
};

/** The lenient loader leaves bare exclusive values that a re-emit would drop; normalized here. */
function withNormalizedStack(partial: Partial<ProjectConfig>): Partial<ProjectConfig> {
  if (!partial.stack) return partial;
  return { ...partial, stack: normalizeStackRecord(partial.stack) };
}

/** Refuses the home directory: the global config half is written only by the gate. */
export async function writeProjectPartial(
  projectDir: string,
  partial: Partial<ProjectConfig>,
  options: WriteProjectPartialOptions = {},
): Promise<void> {
  if (isHomeDirectory(projectDir)) {
    throw new GlobalPairWriteViolation(getInstalledConfigPath(projectDir));
  }

  const configPath = getInstalledConfigPath(projectDir);
  await ensureDir(path.dirname(configPath));
  await writeFile(
    configPath,
    generateConfigSource(
      fillRequiredFields(withNormalizedStack(partial), options.fallbackName),
      activeMatrix,
    ),
  );
}

/** Exported so readers match registrations by the stored rule; it writes nothing. */
export { mergeGlobalConfigs, normalizeProjectPath };

/** Read-only: names what a fan-out would reach, so a run can say so before it writes. */
export { projectsAFanOutReaches } from "./propagate.js";
