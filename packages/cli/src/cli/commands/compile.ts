import { Flags } from "@oclif/core";
import os from "os";
import { unique } from "remeda";
import { BaseCommand } from "../base-command";
import { setVerbose, verbose } from "../utils/logger";
import {
  detectBothInstallations,
  type BothInstallations,
  loadAgentDefs,
  type AgentDefs,
  compileAgents,
  type CompilationResult,
  discoverInstalledSkills,
  type DiscoveredSkills,
} from "../lib/operations";
import {
  ConfigLoadError,
  effectivelyExcludedSkillIds,
  isActiveAt,
  loadInstalledConfig,
  resolveSource,
  type LoadedProjectConfig,
} from "../lib/configuration";
import { getStackSkillIds, resolveAgentConfigToSkills } from "../lib/stacks";
import { loadSkillsMatrixFromSource } from "../lib/loading";
import { STANDARD_FILES } from "../consts";
import { EXIT_CODES } from "../lib/exit-codes";
import { getErrorMessage } from "../utils/errors";
import { plural } from "../utils/string";
import {
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  INFO_MESSAGES,
  configTypesRefreshFailed,
  globalScopedAgentsHint,
  recompileSummary,
  registeredProjectUpdateFailed,
  scopeBlockedStackAssignment,
  skillMetadataUnusableError,
} from "../utils/messages";
import { reconcileTypesFromDisk, type GateReport } from "../lib/config-gate/index.js";
import { namedByActiveEntries } from "../lib/configuration/scope-diff.js";
import { switchedOffPluginSkillIds } from "../lib/operations/skills/discover-skills.js";
import {
  hostCompilesAgent,
  providerAtScope,
  providerInUse,
} from "../lib/installation/install-layout.js";
import { providerFlag, providerNamedBy } from "../lib/installation/provider-flag.js";
import { hostCompileNotices } from "../lib/hosts/host-compile-notices.js";
import type { Installation } from "../lib/installation";
import type { SkillScope } from "../types/config";
import type {
  AgentDefinition,
  AgentName,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillDefinitionMap,
  SkillId,
  StackAgentConfig,
} from "../types";

export default class Compile extends BaseCommand {
  static summary = "Compile agents using local skills and agent definitions";

  static description =
    "Compile agents with resolved skill references. Compiles to the Claude plugin directory.";

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --verbose",
  ];

  static flags = {
    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose logging",
      default: false,
    }),
    provider: providerFlag(),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Compile);
    setVerbose(flags.verbose);
    const cwd = process.cwd();
    const namedProvider = providerNamedBy(flags.provider);

    await this.sayWhenTheGlobalInstallationStandsIn(namedProvider);
    // First: `providerInUse` below picks by roster order when a scope holds both providers.
    await this.refuseAnAmbiguousInstallation(cwd, "compile", namedProvider);
    await this.ensureConfigReadable(cwd);
    const installations = await this.detectInstallations(cwd);
    await this.refuseUnofferablePlacements(cwd);
    await this.resolveAndLogSource(cwd);
    const agentDefs = await this.loadAgentDefsOrFail();
    await this.runCompilePasses(installations, agentDefs, cwd);
    await this.reportWhatThisHostCannotCarry(installations, cwd);
  }

  /** Runs after the passes, so the trust notice describes the tree this run wrote. */
  private async reportWhatThisHostCannotCarry(
    installations: BothInstallations,
    cwd: string,
  ): Promise<void> {
    const root = rootThisRunCompiled(installations, cwd);

    for (const notice of await hostCompileNotices(providerInUse(root), cwd)) {
      this.log(notice);
    }
  }

  private async detectInstallations(cwd: string): Promise<BothInstallations> {
    let installations: BothInstallations;
    try {
      installations = await detectBothInstallations(cwd);
    } catch (error) {
      // Compiling config-less would resurrect every deselected agent.
      if (error instanceof ConfigLoadError) {
        this.error(error.message, { exit: EXIT_CODES.ERROR });
      }
      throw error;
    }

    if (!installations.global && !installations.project) {
      this.error(ERROR_MESSAGES.NO_INSTALLATION, {
        exit: EXIT_CODES.ERROR,
      });
    }

    return installations;
  }

  /** No `--marketplace`: an installation recompiles against the marketplace config.ts recorded. */
  private async resolveAndLogSource(projectDir: string): Promise<void> {
    this.log(STATUS_MESSAGES.RESOLVING_SOURCE);
    try {
      // ABORT on an unreadable config (already refused earlier by `detectInstallations`).
      const sourceConfig = await resolveSource({ caller: "stored", projectDir });
      this.log(`Marketplace setting from: ${sourceConfig.sourceOrigin}`);
    } catch (error) {
      this.log(ERROR_MESSAGES.FAILED_RESOLVE_SOURCE);
      this.handleError(error);
    }
  }

  private async loadAgentDefsOrFail(): Promise<AgentDefs> {
    this.log(STATUS_MESSAGES.LOADING_AGENT_PARTIALS);
    try {
      const defs = await loadAgentDefs();
      this.log("Agent partials loaded");
      verbose(`  Agents: ${defs.agentSourcePaths.agentsDir}`);
      return defs;
    } catch (error) {
      this.log(ERROR_MESSAGES.FAILED_LOAD_AGENT_PARTIALS);
      this.handleError(error);
    }
  }

  private async runCompilePasses(
    installations: BothInstallations,
    agentDefs: AgentDefs,
    cwd: string,
  ): Promise<void> {
    const passes = buildCompilePasses(installations, cwd, agentDefs);

    let passesCompiled = 0;
    for (const pass of passes) {
      const compiled = await this.runCompilePass(pass, cwd);
      if (compiled) passesCompiled++;
    }

    if (passesCompiled === 0) {
      this.error(ERROR_MESSAGES.NO_SKILLS_TO_COMPILE, { exit: EXIT_CODES.ERROR });
    }
  }

  /** Refuses the run, before anything is written, when an installed skill's metadata is unusable. */
  private async discoverAllSkills(projectDir: string): Promise<DiscoveredSkills> {
    this.log(STATUS_MESSAGES.DISCOVERING_SKILLS);
    const result = await discoverInstalledSkills(projectDir);
    if (result.unusableMetadata.length > 0) {
      this.refuseUnusableSkillMetadata(result.unusableMetadata, skillMetadataUnusableError);
    }
    if (result.totalSkillCount === 0) return result;
    this.log(formatDiscoveryMessage(result));
    return result;
  }

  /** The resolver drops a missing stack skill silently except at verbose level. */
  private async warnUnresolvedStackSkills(
    projectDir: string,
    loaded: LoadedProjectConfig | null,
    allSkills: SkillDefinitionMap,
  ): Promise<void> {
    if (!loaded?.config.stack) return;

    const excludedIds = effectivelyExcludedSkillIds(loaded.config.skills);
    const unresolved = getStackSkillIds(loaded.config.stack).filter(
      (id) => !excludedIds.has(id) && !(id in allSkills),
    );
    if (unresolved.length === 0) return;

    const switchedOff = await switchedOffPluginSkillIds(projectDir);
    for (const id of unresolved) {
      this.warn(unresolvedSkillWarning(id, switchedOff));
    }
  }

  /**
   * A hand-edited config.ts can give a global sub-agent a project-scoped skill, which the compile
   * filter silently drops on every run.
   */
  private warnScopeDroppedStackPairs(loaded: LoadedProjectConfig | null): void {
    if (!loaded?.config.stack) return;

    const namedBy = namedByActiveEntries(loaded.config.skills);
    for (const [skillId, agentNames] of findScopeDroppedStackPairs(loaded.config)) {
      this.warn(scopeBlockedStackAssignment(agentNames, skillId, namedBy));
    }
  }

  /** Points at global-scope agents so "No agents to recompile" doesn't read as a silent no-op. */
  private hintGlobalScopedAgents(loaded: LoadedProjectConfig | null, projectDir: string): void {
    if (!loaded) return;

    const globalAgentCount = countCompiledGlobalAgents(loaded.config, projectDir);
    if (globalAgentCount === 0) return;

    this.log(globalScopedAgentsHint(globalAgentCount));
  }

  /**
   * Seats the matrix singleton the render reads (else local skills lose their stated usage), and
   * returns it, `null` on failure: the render degrades, the type refresh skips. Extra sources only
   * annotate skills, so skipping them keeps output identical and the path offline.
   */
  private async seatMatrixForPass(projectDir: string): Promise<MergedSkillsMatrix | null> {
    try {
      const { matrix: seated } = await loadSkillsMatrixFromSource({
        projectDir,
        skipExtraSources: true,
        matrixOnly: true,
      });
      return seated;
    } catch (error) {
      this.warn(`Failed to load skills matrix for ${projectDir}: ${getErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Regenerates config-types.ts after a hand-edit; failure only warns, as the agents are written.
   * Skipped without a catalogue, since unions derived from none would be wrong, not just stale.
   */
  private async refreshConfigTypes(
    pass: CompilePass,
    cwd: string,
    seatedMatrix: MergedSkillsMatrix | null,
    loaded: LoadedProjectConfig | null,
  ): Promise<void> {
    if (!seatedMatrix) {
      this.warn(
        configTypesRefreshFailed(`no skills catalogue could be loaded for ${pass.projectDir}`),
      );
      return;
    }
    if (!loaded) {
      verbose(
        `No config found at ${pass.projectDir} — skipping ${STANDARD_FILES.CONFIG_TYPES_TS} refresh`,
      );
      return;
    }

    let report: GateReport;
    try {
      // A global pass's fan-out must not reach back into the invoking directory.
      report = await reconcileTypesFromDisk(
        pass.projectDir,
        loaded.config,
        { matrix: seatedMatrix, agents: pass.agents },
        { currentProjectDir: cwd },
      );
      this.log(INFO_MESSAGES.CONFIG_TYPES_REFRESHED);
    } catch (error) {
      this.warn(configTypesRefreshFailed(getErrorMessage(error)));
      return;
    }

    this.reportPropagation(report);
  }

  /** Outside the refresh's catch: an unreachable project is not a failed refresh. */
  private reportPropagation(report: GateReport): void {
    this.reportProjectsOutOfReach(report.propagated);
    for (const projectPath of report.propagated.failed) {
      this.warn(registeredProjectUpdateFailed(projectPath));
    }
    this.reportFanOut(report);
  }

  private async runCompilePass(pass: CompilePass, cwd: string): Promise<boolean> {
    const { projectDir } = pass;
    this.announcePass(pass);

    const seatedMatrix = await this.seatMatrixForPass(projectDir);
    const { allSkills, totalSkillCount } = await this.discoverAllSkills(projectDir);
    // One read serves the pass: nothing in it writes config.ts before the type refresh.
    const loaded = await loadInstalledConfig(projectDir);
    // A skipped pass is a refused run, which writes nothing, config-types.ts included.
    if (!this.announceWhetherPassCompiles(pass, totalSkillCount, loaded)) return false;

    await this.warnUnresolvedStackSkills(projectDir, loaded, allSkills);
    this.warnScopeDroppedStackPairs(loaded);
    await this.recompilePassAgents(pass, allSkills, loaded);
    await this.refreshConfigTypes(pass, cwd, seatedMatrix, loaded);

    this.log("");
    this.logSuccess(`${pass.label} compile complete!`);
    this.log("");
    return true;
  }

  private announcePass({ label, projectDir, installation }: CompilePass): void {
    this.log("");
    this.log(`Compiling ${label.toLowerCase()} agents...`);
    this.log("");

    verbose(`  Project: ${projectDir}`);
    verbose(`  Agents: ${installation.agentsDir}`);
  }

  /** A pass with no skills still compiles when its config declares base agents only. */
  private announceWhetherPassCompiles(
    pass: CompilePass,
    totalSkillCount: number,
    loaded: LoadedProjectConfig | null,
  ): boolean {
    if (totalSkillCount > 0) return true;

    const passName = pass.label.toLowerCase();
    if (declaresOnlyBaseAgents(pass, loaded)) {
      this.log(`No skills configured for ${passName} pass, compiling base agents`);
      return true;
    }

    this.log(`No skills found for ${passName} pass, skipping`);
    return false;
  }

  private async recompilePassAgents(
    pass: CompilePass,
    skills: SkillDefinitionMap,
    loaded: LoadedProjectConfig | null,
  ): Promise<void> {
    const { projectDir, installation, sourcePath, scopeFilter } = pass;

    this.log(STATUS_MESSAGES.RECOMPILING_AGENTS);
    try {
      const recompileResult = await compileAgents({
        projectDir,
        sourcePath,
        skills,
        pluginDir: projectDir,
        outputDir: installation.agentsDir,
        ...(scopeFilter !== undefined && { scopeFilter }),
      });
      this.reportRecompile(recompileResult, pass, loaded);
    } catch (error) {
      this.log(ERROR_MESSAGES.FAILED_COMPILE_AGENTS);
      this.handleError(error);
    }
  }

  private reportRecompile(
    result: CompilationResult,
    { label, projectDir }: CompilePass,
    loaded: LoadedProjectConfig | null,
  ): void {
    const { compiled, failed, warnings } = result;
    const summary = recompileSummary(result, `${label.toLowerCase()} agent`);

    if (failed.length > 0) {
      this.log(`${summary} (${failed.length} failed)`);
      for (const warning of warnings) {
        this.warn(warning);
      }
    } else if (compiled.length > 0) {
      this.log(summary);
    } else {
      this.log(INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE);
      if (label === "Project") {
        this.hintGlobalScopedAgents(loaded, projectDir);
      }
    }

    if (compiled.length > 0) {
      verbose(`  Compiled: ${compiled.join(", ")}`);
    }
  }
}

type CompilePass = {
  label: "Global" | "Project";
  projectDir: string;
  installation: Installation;
  sourcePath: string;
  agents: Partial<Record<AgentName, AgentDefinition>>;
  scopeFilter?: SkillScope;
};

/**
 * One pass: the project's when there is one (writing nothing outside it), else the global's.
 * `scopeFilter` keeps inlined global agents out of the project's agents directory.
 */
function buildCompilePasses(
  installations: BothInstallations,
  cwd: string,
  agentDefs: AgentDefs,
): CompilePass[] {
  const { sourcePath, agents } = agentDefs;

  if (installations.project) {
    return [
      {
        label: "Project",
        projectDir: cwd,
        installation: installations.project,
        sourcePath,
        agents,
        ...(installations.hasBoth && { scopeFilter: "project" as const }),
      },
    ];
  }

  if (installations.global) {
    return [
      {
        label: "Global",
        projectDir: os.homedir(),
        installation: installations.global,
        sourcePath,
        agents,
      },
    ];
  }

  return [];
}

/** Mirrors the root {@link buildCompilePasses} picks. */
function rootThisRunCompiled(installations: BothInstallations, cwd: string): string {
  return installations.project ? cwd : os.homedir();
}

/**
 * A skill-less pass still compiles a config of base agents only. One that declares skills none of
 * which are on disk lost them, and is skipped rather than recompiled without them.
 */
function declaresOnlyBaseAgents(pass: CompilePass, loaded: LoadedProjectConfig | null): boolean {
  if (!loaded) return false;

  const { skills, agents } = loaded.config;
  const declaresASkill = skills.some((skill) => !skill.excluded);
  const compilesAnAgent = agents.some((agent) =>
    pass.scopeFilter === undefined ? !agent.excluded : isActiveAt(agent, pass.scopeFilter),
  );
  return !declaresASkill && compilesAnAgent;
}

/** Codex leaves some sub-agents out: a global one counts only if the global host compiles it. */
function countCompiledGlobalAgents(config: ProjectConfig, projectDir: string): number {
  const globalHost = providerAtScope(projectDir, "global");
  return config.agents.filter(
    (agent) => isActiveAt(agent, "global") && hostCompilesAgent(globalHost, agent.name),
  ).length;
}

/** Project-scoped skills a global sub-agent's stack names, grouped by skill. */
function findScopeDroppedStackPairs(config: ProjectConfig): [SkillId, AgentName[]][] {
  const stack = config.stack ?? {};
  const globalAgentNames = config.agents
    .filter((agent) => isActiveAt(agent, "global"))
    .map((agent) => agent.name);
  const projectScopedIds = unique(
    config.skills.filter((skill) => isActiveAt(skill, "project")).map((skill) => skill.id),
  );

  return projectScopedIds
    .map((skillId): [SkillId, AgentName[]] => [
      skillId,
      globalAgentNames.filter((agentName) => stackAssignsSkill(stack[agentName], skillId)),
    ])
    .filter(([, agentNames]) => agentNames.length > 0);
}

function stackAssignsSkill(agentStack: StackAgentConfig | undefined, skillId: SkillId): boolean {
  if (!agentStack) return false;
  return resolveAgentConfigToSkills(agentStack).some((ref) => ref.id === skillId);
}

/** A switched-off plugin is installed, so "not found" would send the user looking for it. */
function unresolvedSkillWarning(id: SkillId, switchedOff: ReadonlySet<string>): string {
  const why = switchedOff.has(id) ? "its plugin is switched off" : "was not found";
  return `Skill '${id}' is configured but ${why} — agents will be compiled without it.`;
}

function formatDiscoveryMessage(result: DiscoveredSkills): string {
  const { totalSkillCount, pluginSkillCount } = result;
  const localCount = totalSkillCount - pluginSkillCount;

  if (pluginSkillCount > 0 && localCount > 0) {
    return `Discovered ${plural(totalSkillCount, "skill")} (${pluginSkillCount} from plugins, ${localCount} local)`;
  }

  return pluginSkillCount > 0
    ? `Discovered ${plural(pluginSkillCount, "skill")} from plugins`
    : `Discovered ${plural(totalSkillCount, "local skill")}`;
}
