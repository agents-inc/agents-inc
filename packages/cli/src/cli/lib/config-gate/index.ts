import os from "os";
import path from "path";
import type { ProjectConfig, SkillId } from "../../types";
import type { SkillConfig, SourceEntry } from "../../types/config";
import { CLAUDE_SRC_DIR, CLI_INVOKE_COMMAND, STANDARD_FILES } from "../../consts";
import { ensureDir, writeFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { isHomeDirectory } from "../installation/is-home-directory";
import { getProjectConfigPath } from "../installation/install-base-dir";
import { loadProjectConfigFromDir } from "../configuration/project-config";
import { normalizeStackRecord } from "../stacks/stacks-loader";
import { isActiveAt } from "../configuration/scope-predicates";
import { splitConfigByScope } from "../configuration/config-generator";
import { generateConfigSource } from "../configuration/config-writer";
import {
  regenerateConfigTypes,
  type ConfigTypesBackgroundData,
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
  writeGlobalTypesHalfFromData,
} from "./pair-writer.js";
import {
  buildConfigTypesBackgroundData,
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
import { NOTHING_RECOMPILED, recompilePropagated } from "./recompile.js";
import type { PropagatedRecompileSummary } from "../operations/project/recompile-project-agents.js";

export type { GateDeps } from "./deps.js";
export type { ConsequenceTier, GlobalChangeSet } from "./classify.js";
export { GlobalPairWriteViolation } from "./gate-token.js";

/**
 * What one gated write did, for the caller to render.
 *
 * A write that propagates recompiles the propagated projects' agents itself:
 * both audited gaps in the previous contract (a project-context source
 * migration, a global uninstall) were instances of a caller forgetting to. A
 * report the caller may only log cannot go stale the same way, and per-project
 * failure isolation already lives in `recompilePropagatedProjectAgents`, so
 * internalizing the recompile adds no new failure mode.
 */
export type GateReport = {
  /** True when either half of the global pair was actually rewritten. */
  globalWritten: boolean;
  changes: GlobalChangeSet;
  propagated: PropagationResult;
  recompile: PropagatedRecompileSummary;
};

/**
 * The gate's public entry points are the ONLY code that mints the pair-write
 * privilege, and each one holds it across its whole consequence flow rather than
 * around the individual write (D-309).
 *
 * `pair-writer.ts` used to open the token inside each of its own functions, which
 * meant reaching that module by any route — a dynamic import, a re-export — came
 * with the privilege attached, and the runtime tripwire in `utils/fs.ts` had
 * nothing left to refuse. Moving the mint here inverts that: the private writers
 * REQUIRE a token they cannot produce, so authorization is a property of how the
 * write was ENTERED, which is exactly what the gate is meant to guarantee.
 *
 * The window is wider than the write itself — propagation and the recompile run
 * inside it too. That is accepted: everything in the window is the gate's own
 * code carrying out consequences the same entry already owes.
 *
 * Every entry below that writes or drives a write opens the token with
 * `withGateToken`, including `propagateGlobalRemoval`, which today reaches only
 * project pairs — the rule is "a gate entry holds the privilege for its flow",
 * not "the ones whose current implementation happens to need it".
 *
 * The two exceptions are `writeProjectPartial` and
 * `writeMarketplaceScaffoldConfig`. Both refuse the home directory as their first
 * act and then write a PROJECT's or a MARKETPLACE's own config, which the
 * tripwire never guards; handing them the global-pair privilege would only blunt
 * the refusal they exist to make.
 */

/** A write whose classification obliged nothing beyond the global pair. */
const NOTHING_PROPAGATED: PropagationResult = { updated: [], skipped: [] };

function report(
  globalWritten: boolean,
  changes: GlobalChangeSet,
  propagated: PropagationResult = NOTHING_PROPAGATED,
  recompile: PropagatedRecompileSummary = NOTHING_RECOMPILED,
): GateReport {
  return { globalWritten, changes, propagated, recompile };
}

/**
 * Carries out a classified global change's consequences: fan the change out to
 * every registered project, then recompile the ones it rewrote.
 *
 * `currentProjectDir` is excluded from the fan-out — its own pair is written by
 * the call that triggered this, and its agents are compiled by the command.
 */
async function applyConsequences(
  globalConfig: ProjectConfig,
  changes: GlobalChangeSet,
  deps: LoadedGateDeps,
  currentProjectDir?: string,
): Promise<{ propagated: PropagationResult; recompile: PropagatedRecompileSummary }> {
  const tier = consequenceTier(changes);
  if (!tierPropagates(tier) || !globalConfig.projects?.length) {
    return { propagated: NOTHING_PROPAGATED, recompile: NOTHING_RECOMPILED };
  }

  const propagated = await propagateGlobalChangesToProjects(
    globalConfig,
    deps.matrix,
    deps.agents,
    currentProjectDir,
    { regenerateTypes: tierRegeneratesTypes(tier) },
  );
  if (propagated.updated.length > 0) {
    verbose(`Propagated global changes to ${propagated.updated.length} project(s)`);
  }

  const recompile = tierRegeneratesTypes(tier)
    ? await recompilePropagated(propagated.updated)
    : NOTHING_RECOMPILED;

  return { propagated, recompile };
}

/**
 * Loaders for a caller that holds no matrix of its own. Nothing is fetched
 * unless classification proves the write has consequences that read it, so a
 * registration-only mutation stays offline.
 *
 * `matrixOnly` + `skipExtraSources` are the offline policy the other config
 * readers already use: extra-source loading only annotates wizard UI tagging and
 * never changes the emitted config or types.
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
      return (await loadAgentDefs({ projectDir })).agents;
    },
  };
}

export type WizardWriteArgs = {
  finalConfig: ProjectConfig;
  matrix: LoadedGateDeps["matrix"];
  agents: LoadedGateDeps["agents"];
  projectDir: string;
  projectConfigPath: string;
  projectInstallationExists: boolean;
};

/**
 * Writes config.ts and config-types.ts split by scope.
 * When installing into a project directory:
 * - Global config/types go to ~/.claude-src/
 * - Project config/types go to {projectDir}/.claude-src/ (with import from global)
 * When installing from home directory, writes a single standalone config.
 */
export async function writeScopedFromWizard(args: WizardWriteArgs): Promise<GateReport> {
  return withGateToken(async () => {
    const { finalConfig, matrix, agents, projectDir, projectConfigPath } = args;
    // Use os.homedir() at runtime (not GLOBAL_INSTALL_ROOT constant) so the path
    // agrees with getGlobalConfigImportPath() which also calls os.homedir() at runtime
    const homeDir = os.homedir();
    const deps: LoadedGateDeps = { matrix, agents };

    if (!isHomeDirectory(projectDir)) {
      return writeFromProjectContext(args, homeDir, deps);
    }

    // Installing from ~/ — write directly to global config (no import preamble)
    const priorGlobal = await loadProjectConfigFromDir(homeDir);
    const changes = classifyGlobalChange(priorGlobal?.config, finalConfig);
    const globalWritten = await writeGlobalPair(finalConfig, projectConfigPath, matrix, agents);

    const { propagated, recompile } = await applyConsequences(finalConfig, changes, deps);
    return report(globalWritten, changes, propagated, recompile);
  });
}

async function writeFromProjectContext(
  args: WizardWriteArgs,
  homeDir: string,
  deps: LoadedGateDeps,
): Promise<GateReport> {
  const { finalConfig, matrix, agents, projectDir, projectConfigPath } = args;

  // Installing from project — split by scope for project config generation.
  const { global: globalConfig, project: projectSplitConfig } = splitConfigByScope(finalConfig);
  const globalConfigPath = getProjectConfigPath(homeDir);

  // Merge new global-scoped items into the existing global config.
  // - Existing items are preserved (never removed from global during project init)
  // - New global items are added
  // - If no existing global config, write the full global split
  const existingGlobal = await loadProjectConfigFromDir(homeDir);
  const effective = await resolveEffectiveGlobalConfig(
    globalConfig,
    existingGlobal?.config,
    projectDir,
  );
  const effectiveGlobalConfig = effective.config;

  const changes = classifyGlobalChange(existingGlobal?.config, effectiveGlobalConfig);

  let globalWritten = false;
  if (effective.changed) {
    await ensureDir(path.dirname(globalConfigPath));
    globalWritten = await writeGlobalPair(effectiveGlobalConfig, globalConfigPath, matrix, agents);
    verbose(`Updated global config at ${globalConfigPath}`);
  } else {
    verbose("Global config unchanged, skipping write");
  }

  const { propagated, recompile } = await applyConsequences(
    effectiveGlobalConfig,
    changes,
    deps,
    projectDir,
  );

  // Reconcile the project's own entries against the global config this write inlines.
  // Without it this branch hands the raw split straight to the inlining writer, so a
  // skill/agent the project owns at project scope AND a colliding live global install
  // both land as active entries in the same project config.
  const reconciledProjectConfig = reconcileProjectSplitAgainstGlobal(
    projectSplitConfig,
    effectiveGlobalConfig,
    matrix,
  );

  // Write project config if the project installation already exists OR if there are project-scoped items.
  // Skip only when no existing project installation AND no project-scoped items — creating an empty
  // project config with just `import globalConfig` and `{ ...globalConfig }` is pointless.
  const hasProjectItems =
    reconciledProjectConfig.skills.length > 0 || reconciledProjectConfig.agents.length > 0;

  if (args.projectInstallationExists || hasProjectItems) {
    await ensureDir(path.dirname(projectConfigPath));
    await writeProjectConfigPair(
      projectDir,
      reconciledProjectConfig,
      effectiveGlobalConfig,
      matrix,
      agents,
    );
    verbose(`Updated project config at ${projectConfigPath}`);
  } else {
    verbose(
      "Skipped project config — no existing project installation and no project-scoped items",
    );
  }

  return report(globalWritten, changes, propagated, recompile);
}

/**
 * Regenerates a single scope's config-types.ts from its persisted config,
 * matching the wizard write path exactly (D-228 writer selection):
 * - global scope (home dir): standalone unions narrowed to the config's entries
 * - project scope: import-and-extend form (falls back to standalone when no
 *   global config-types.ts exists)
 *
 * Writes no config half at either scope: the config on disk is the input.
 * Returns whether a file was actually rewritten (always false at project scope,
 * where the writer does not report).
 */
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
        getProjectConfigPath(projectDir),
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
 * Regenerates a scope's config-types.ts from the config already on disk, which
 * is the truth and is never rewritten — the documented hand-edit workflow is
 * "edit config.ts, then compile", so the file the user edited must survive it.
 *
 * At the home directory the types are the standalone unions narrowed to that
 * config, and the fan-out is UNCONDITIONAL: a hand edit leaves no prior state to
 * diff against, so there is nothing to classify and the only safe assumption is
 * that every registered project's inlined copy is stale. At project and
 * marketplace directories the import-and-extend writer applies and nothing is
 * propagated — a project config is nobody else's input.
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

    const propagated = await propagateGlobalChangesToProjects(
      config,
      deps.matrix,
      deps.agents,
      options?.currentProjectDir,
    );
    if (propagated.updated.length > 0) {
      verbose(`Propagated global changes to ${propagated.updated.length} project(s)`);
    }
    const recompile = await recompilePropagated(propagated.updated);

    return report(globalWritten, changes, propagated, recompile);
  });
}

/**
 * Regenerates a scope's `config-types.ts` after `new skill` / `new agent` /
 * `new marketplace` scaffolded an entity whose literal the unions must carry.
 *
 * Fronts the raw types writer because the home directory is reachable at those
 * call sites — all three run at `process.cwd()` — and the raw writer refuses it.
 * Here the write goes through the pair writer holding the gate token instead.
 *
 * No fan-out: a scaffolded entity widens the types unions only. The global
 * `config.ts` is untouched, so no registered project's inlined copy of it went
 * stale and there is nothing to propagate.
 */
export async function writeScaffoldedEntityTypes(
  projectDir: string,
  backgroundData: Promise<ConfigTypesBackgroundData>,
  extras?: ConfigTypesExtras,
): Promise<void> {
  await withGateToken(async () => {
    if (!isHomeDirectory(projectDir)) {
      await regenerateConfigTypes(projectDir, backgroundData, extras);
      return;
    }

    const data = await backgroundData;
    const loaded = await loadProjectConfigFromDir(projectDir);
    await writeGlobalTypesHalfFromData(
      getProjectConfigPath(projectDir),
      data,
      loaded?.config,
      extras,
    );
  });
}

/**
 * The transforms the gate will apply to the global config on a caller's behalf.
 *
 * A closed union rather than a caller-supplied function: every variant is
 * analysable and testable on its own, and no caller-authored transform runs
 * inside the only code allowed to write the pair.
 */
export type GlobalMutation =
  | { kind: "migrate-skill-sources"; sources: ReadonlyMap<SkillId, string> }
  | { kind: "deregister-project"; projectDir: string }
  | { kind: "set-source"; source: string; fallbackName: string }
  | { kind: "add-source"; entry: SourceEntry }
  | { kind: "remove-source"; name: string };

/** The migrated `source` for an active-global entry, or the entry unchanged. */
function withMigratedSource(
  skill: SkillConfig,
  migratedSources: ReadonlyMap<SkillId, string>,
): SkillConfig {
  if (!isActiveAt(skill, "global")) return skill;
  const source = migratedSources.get(skill.id);
  if (source === undefined || source === skill.source) return skill;
  return { ...skill, source };
}

/**
 * Rewrites `source` on exactly the active-global entries listed in `migratedSources`,
 * returning every other entry — including global entries this session did not migrate —
 * identical by reference.
 */
export function applyMigratedGlobalSources(
  globalSkills: SkillConfig[],
  migratedSources: ReadonlyMap<SkillId, string>,
): { skills: SkillConfig[]; changed: boolean } {
  const skills = globalSkills.map((skill) => withMigratedSource(skill, migratedSources));
  return { skills, changed: skills.some((skill, index) => skill !== globalSkills[index]) };
}

/**
 * The config a partial write commits: the scalars and arrays already on disk,
 * with the required fields filled. Mirrors what the partial writer has always
 * defaulted, so a scalar mutation cannot silently empty an install.
 */
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
    case "migrate-skill-sources": {
      const { skills, changed } = applyMigratedGlobalSources(
        current.skills ?? [],
        mutation.sources,
      );
      return changed ? { ...current, skills } : null;
    }
    case "deregister-project": {
      const projects = current.projects ?? [];
      if (projects.length === 0) return null;
      const normalized = normalizeProjectPath(mutation.projectDir);
      const filtered = projects.filter((p) => p !== normalized);
      return filtered.length === projects.length ? null : { ...current, projects: filtered };
    }
    case "set-source":
      return { ...current, source: mutation.source };
    case "add-source": {
      const sources = current.sources ?? [];
      if (sources.some((s) => s.name === mutation.entry.name)) {
        throw new Error(`Source "${mutation.entry.name}" already exists`);
      }
      return { ...current, sources: [...sources, mutation.entry] };
    }
    case "remove-source": {
      const sources = current.sources ?? [];
      const filtered = sources.filter((s) => s.name !== mutation.name);
      if (filtered.length === sources.length)
        throw new Error(`Source "${mutation.name}" not found`);
      return { ...current, sources: filtered };
    }
    default: {
      const _exhaustive: never = mutation;
      return _exhaustive;
    }
  }
}

/** The name a mutation invents when the global config has none yet. */
function fallbackNameFor(mutation: GlobalMutation): string | undefined {
  return mutation.kind === "set-source" ? mutation.fallbackName : undefined;
}

/**
 * Applies a typed transform to the global config and carries out whatever its
 * classification obliges. No variant is exempt from classification by
 * construction: a source change propagates because project configs inline the
 * global scalars, and a deregistration does not because nothing inlines the
 * registration list.
 */
export async function mutateGlobal(mutation: GlobalMutation, deps: GateDeps): Promise<GateReport> {
  return withGateToken(async () => {
    const homeDir = os.homedir();
    // The full loader, not the scalar one: it normalizes every stack assignment
    // back to `SkillAssignment[]`. The writer compacts an exclusive category to its
    // bare value on the way out, and re-emitting that bare form without
    // normalization drops the category — so a scalar mutation would silently strip
    // every exclusive category from the global stack.
    const loadedGlobal = await loadProjectConfigFromDir(homeDir);
    if (!loadedGlobal) return report(false, NO_CHANGES);

    const current = loadedGlobal.config;
    const mutated = applyMutation(mutation, current);
    if (!mutated) return report(false, NO_CHANGES);

    const prior = fillRequiredFields(current, fallbackNameFor(mutation));
    const next = fillRequiredFields(mutated, fallbackNameFor(mutation));
    const changes = classifyGlobalChange(prior, next);

    const globalWritten = await writeGlobalConfigHalf(next, getProjectConfigPath(homeDir));
    if (!next.projects?.length) return report(globalWritten, changes);

    const loaded = await resolveGateDeps(deps, consequenceTier(changes));
    if (!loaded) return report(globalWritten, changes);

    const { propagated, recompile } = await applyConsequences(next, changes, loaded);
    return report(globalWritten, changes, propagated, recompile);
  });
}

/**
 * Prunes the CLI-inlined global entries from every registered project after a
 * GLOBAL uninstall, and recompiles their agents.
 *
 * Writes no pair: the pair this would derive from has just been deleted. That is
 * the reason this is its own entry rather than a flag on a writing one — the
 * removal case must not be reachable from a code path whose job is to write.
 *
 * Call AFTER the global manifest has been removed so the regenerated project
 * types fall back to the standalone form instead of importing from the
 * now-deleted global config-types.ts.
 */
export async function propagateGlobalRemoval(
  preRemovalGlobalConfig: ProjectConfig,
  deps: LoadedGateDeps,
): Promise<GateReport> {
  return withGateToken(async () => {
    const changes = classifyGlobalChange(preRemovalGlobalConfig, {
      ...preRemovalGlobalConfig,
      skills: [],
      agents: [],
      selectedAgents: [],
    });

    const propagated = await pruneGlobalEntriesFromRegisteredProjects(
      preRemovalGlobalConfig,
      deps.matrix,
      deps.agents,
    );
    const recompile = await recompilePropagated(propagated.updated);

    return report(false, changes, propagated, recompile);
  });
}

/**
 * Creates the blank global pair when none exists. No classification and no
 * fan-out: the registration list propagation reads lives in the file that was
 * just found absent, so a pair created here has no registered projects.
 */
export async function ensureBlankPair(): Promise<boolean> {
  return withGateToken(() => ensureBlankPairInternal());
}

export type WriteProjectPartialOptions = {
  /** Name to invent when the partial has none. Absent → a missing name is an error. */
  fallbackName?: string;
};

/**
 * The partial with every stack assignment normalized back to `SkillAssignment[]`.
 *
 * Every caller of this entry reads the config with the LENIENT loader
 * (`loadProjectSourceConfig`), overlays one scalar, and hands the result back.
 * That loader passes the on-disk stack through untouched, and the writer emits an
 * exclusive category in its BARE form (`"web-framework": "web-framework-react"`,
 * no array) — so on a load / re-emit round trip `compactCategories`, which keeps
 * only non-empty arrays, drops the category and the user silently loses an
 * assignment they never touched (D-308).
 *
 * Normalizing at this boundary rather than inside the writer keeps the fix on the
 * one path that can present a denormalized stack: the full loader
 * (`loadProjectConfigFromDir`) already runs `normalizeStackRecord`, so every other
 * writer input arrives normalized.
 */
function withNormalizedStack(partial: Partial<ProjectConfig>): Partial<ProjectConfig> {
  if (!partial.stack) return partial;
  return { ...partial, stack: normalizeStackRecord(partial.stack) };
}

/**
 * Writes a partial config to a PROJECT's `.claude-src/config.ts`, filling
 * required defaults. Refuses the home directory: the global pair's config half
 * may never be written without its types sibling and without classification.
 */
export async function writeProjectPartial(
  projectDir: string,
  partial: Partial<ProjectConfig>,
  options: WriteProjectPartialOptions = {},
): Promise<void> {
  if (isHomeDirectory(projectDir)) {
    throw new GlobalPairWriteViolation(getProjectConfigPath(projectDir));
  }

  const configPath = getProjectConfigPath(projectDir);
  await ensureDir(path.join(projectDir, CLAUDE_SRC_DIR));
  await writeFile(
    configPath,
    generateConfigSource(fillRequiredFields(withNormalizedStack(partial), options.fallbackName)),
  );
}

/**
 * Writes a scaffolded marketplace's `config.ts`, optionally preceded by a
 * comment. Renders the source here rather than taking rendered text so the
 * config generator stays inside the gate's reach; refuses the home directory,
 * where scaffolding a marketplace would replace the pair's config half with a
 * config that declares one dummy skill.
 */
export async function writeMarketplaceScaffoldConfig(
  marketplaceDir: string,
  config: ProjectConfig,
  leadingComment = "",
): Promise<void> {
  if (isHomeDirectory(marketplaceDir)) {
    throw new GlobalPairWriteViolation(getProjectConfigPath(marketplaceDir));
  }

  await writeFile(
    path.join(marketplaceDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
    leadingComment + generateConfigSource(config),
  );
}

/**
 * `normalizeProjectPath` is the single rule for any value compared against the
 * global config's `projects` array, so a reader that only wants to MATCH a
 * registration (never write one) gets it from here rather than reimplementing
 * `fs.realpathSync` and drifting from the rule the registrations were stored
 * under. It writes nothing, so exporting it hands out no privilege.
 */
export { mergeGlobalConfigs, normalizeProjectPath };
