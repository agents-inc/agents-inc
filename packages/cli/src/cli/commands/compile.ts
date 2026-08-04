import { Flags } from "@oclif/core";
import os from "os";
import { BaseCommand } from "../base-command";
import { setVerbose, verbose } from "../utils/logger";
import {
  detectBothInstallations,
  type BothInstallations,
  loadAgentDefs,
  type AgentDefs,
  compileAgents,
  discoverInstalledSkills,
  type DiscoveredSkills,
} from "../lib/operations";
import {
  ConfigLoadError,
  effectivelyExcludedSkillIds,
  loadProjectConfig,
  loadProjectConfigFromDir,
  resolveSource,
} from "../lib/configuration";
import { getStackSkillIds } from "../lib/stacks";
import { loadSkillsMatrixFromSource } from "../lib/loading";
import { CLI_INVOKE_COMMAND, STANDARD_FILES } from "../consts";
import { EXIT_CODES } from "../lib/exit-codes";
import { getErrorMessage } from "../utils/errors";
import {
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  INFO_MESSAGES,
  configTypesRefreshFailed,
  globalScopedAgentsHint,
  registeredProjectUpdateSkipped,
} from "../utils/messages";
import { reconcileTypesFromDisk, type GateReport } from "../lib/config-gate/index.js";
import type { Installation } from "../lib/installation";
import type { SkillScope } from "../types/config";
import type { AgentDefinition, AgentName, SkillDefinitionMap } from "../types";

export default class Compile extends BaseCommand {
  static summary = "Compile agents using local skills and agent definitions";

  static description =
    "Compile agents with resolved skill references. Compiles to the Claude plugin directory.";

  static examples = [
    "<%= config.bin %> <%= command.id %>",
    "<%= config.bin %> <%= command.id %> --verbose",
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose logging",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Compile);
    setVerbose(flags.verbose);
    const cwd = process.cwd();

    const installations = await this.detectInstallations(cwd);
    await this.resolveAndLogSource(flags.source);
    const agentDefs = await this.loadAgentDefsOrFail(cwd);
    await this.compileAllScopes(installations, agentDefs, cwd, flags.source);
  }

  private async detectInstallations(cwd: string): Promise<BothInstallations> {
    let installations: BothInstallations;
    try {
      installations = await detectBothInstallations(cwd);
    } catch (error) {
      // A corrupt config (file present but unparseable) must not let compile run
      // config-less — that resurrects every deselected agent. Hard-error naming
      // the offending file before any compilation happens.
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

  private async resolveAndLogSource(sourceFlag?: string): Promise<void> {
    this.log(STATUS_MESSAGES.RESOLVING_SOURCE);
    try {
      const sourceConfig = await resolveSource(sourceFlag);
      this.log(`Source: ${sourceConfig.sourceOrigin}`);
    } catch (error) {
      this.log(ERROR_MESSAGES.FAILED_RESOLVE_SOURCE);
      this.handleError(error);
    }
  }

  private async loadAgentDefsOrFail(cwd: string): Promise<AgentDefs> {
    this.log(STATUS_MESSAGES.LOADING_AGENT_PARTIALS);
    try {
      const defs = await loadAgentDefs({ projectDir: cwd });
      this.log("Agent partials loaded");
      verbose(`  Agents: ${defs.agentSourcePaths.agentsDir}`);
      verbose(`  Templates: ${defs.agentSourcePaths.templatesDir}`);
      return defs;
    } catch (error) {
      this.log(ERROR_MESSAGES.FAILED_LOAD_AGENT_PARTIALS);
      this.handleError(error);
    }
  }

  private async compileAllScopes(
    installations: BothInstallations,
    agentDefs: AgentDefs,
    cwd: string,
    sourceFlag?: string,
  ): Promise<void> {
    // When both installations exist, filter each pass to its own scope to prevent
    // the project pass from overwriting global agents with zero-skill versions
    // (the project config's stack only has project agent entries).
    const passes = buildCompilePasses(installations, cwd, agentDefs);

    let totalPassesWithSkills = 0;
    for (const pass of passes) {
      const hadSkills = await this.runCompilePass(pass, cwd, sourceFlag);
      if (hadSkills) totalPassesWithSkills++;
    }

    if (totalPassesWithSkills === 0) {
      this.error(
        `No skills found. Add skills with '${CLI_INVOKE_COMMAND} add <skill>' or create in .claude/skills/.`,
        { exit: EXIT_CODES.ERROR },
      );
    }
  }

  private async discoverAllSkills(projectDir: string): Promise<DiscoveredSkills> {
    this.log(STATUS_MESSAGES.DISCOVERING_SKILLS);
    const result = await discoverInstalledSkills(projectDir);
    if (result.totalSkillCount === 0) return result;
    this.log(formatDiscoveryMessage(result));
    return result;
  }

  /**
   * A stack skill that is not among the discovered skills is dropped from every
   * agent that references it. The resolver only records that at verbose level, so
   * the default output would claim a successful recompile of an agent that no
   * longer matches config.ts. Name each dropped skill instead.
   */
  private async warnUnresolvedStackSkills(
    projectDir: string,
    allSkills: SkillDefinitionMap,
  ): Promise<void> {
    const loaded = await loadProjectConfig(projectDir);
    if (!loaded?.config.stack) return;

    const excludedIds = effectivelyExcludedSkillIds(loaded.config.skills);
    const unresolved = getStackSkillIds(loaded.config.stack).filter(
      (id) => !excludedIds.has(id) && !(id in allSkills),
    );

    for (const id of unresolved) {
      this.warn(
        `Skill '${id}' is configured but was not found — agents will be compiled without it.`,
      );
    }
  }

  /**
   * The project pass compiled no agents, but the project config may still declare
   * global-scope agents whose stack lives in the global config. Without a pointer
   * the "No agents to recompile" line reads as a silent no-op after a global stack
   * change, so name the global context and the count.
   */
  private async hintGlobalScopedAgents(projectDir: string): Promise<void> {
    const loaded = await loadProjectConfigFromDir(projectDir);
    if (!loaded) return;

    const globalAgentCount = loaded.config.agents.filter(
      (agent) => !agent.excluded && agent.scope === "global",
    ).length;
    if (globalAgentCount === 0) return;

    this.log(globalScopedAgentsHint(globalAgentCount));
  }

  /**
   * The documented hand-edit workflow is "edit config.ts, then run compile", and
   * the type unions in config-types.ts are derived from config.ts — so a compile
   * pass that leaves them untouched strands stale unions after a hand-edit.
   * Regenerates them from the scope's persisted config exactly as the wizard
   * write path would: standalone narrowed unions at global scope, import-and-
   * extend at project scope. `matrixOnly` keeps the default-source path offline.
   * A failed refresh downgrades to a warning — the compiled agents are already
   * written and remain valid; only the type unions may still be stale.
   *
   * `skipExtraSources: true` is NOT a divergence from the wizard's full
   * multi-source load: extra-source loading only annotates each skill's
   * `availableSources`/`activeSource` for wizard UI tagging — it never adds
   * skills or categories to the matrix, and the config-types writer never reads
   * those annotations, so the emitted types are byte-identical either way
   * (pinned by the skipExtraSources parity test in local-installer.test.ts).
   * Skipping avoids fetching every registered extra source (network on a cold
   * cache, plus unreachable-remote warnings) on this offline compile path.
   */
  private async refreshConfigTypes(
    pass: CompilePass,
    cwd: string,
    sourceFlag?: string,
  ): Promise<void> {
    let report: GateReport;
    try {
      const loaded = await loadProjectConfigFromDir(pass.projectDir);
      if (!loaded) {
        verbose(
          `No config found at ${pass.projectDir} — skipping ${STANDARD_FILES.CONFIG_TYPES_TS} refresh`,
        );
        return;
      }

      const { matrix } = await loadSkillsMatrixFromSource({
        sourceFlag,
        projectDir: pass.projectDir,
        skipExtraSources: true,
        matrixOnly: true,
      });
      // `cwd` is excluded from the fan-out: when compile runs inside a registered
      // project, the project pass compiles that project's agents itself, so
      // letting the home pass reach it would compile them twice.
      report = await reconcileTypesFromDisk(
        pass.projectDir,
        loaded.config,
        { matrix, agents: pass.agents },
        { currentProjectDir: cwd },
      );
      this.log(INFO_MESSAGES.CONFIG_TYPES_REFRESHED);
    } catch (error) {
      this.warn(configTypesRefreshFailed(getErrorMessage(error)));
      return;
    }

    this.reportPropagation(report);
  }

  /**
   * Renders the fan-out the refresh above performed. Kept out of the refresh's
   * catch on purpose: a project the fan-out could not reach is reported as that,
   * not as a failure to refresh the type unions — which did succeed.
   */
  private reportPropagation(report: GateReport): void {
    for (const skippedPath of report.propagated.skipped) {
      this.warn(registeredProjectUpdateSkipped(skippedPath));
    }
    for (const warning of report.recompile.warnings) {
      this.warn(warning);
    }
    if (report.propagated.updated.length === 0) return;

    const { recompiledCount, failedCount } = report.recompile;
    const failureSuffix = failedCount > 0 ? ` (${failedCount} failed)` : "";
    this.log(`Recompiled agents in ${recompiledCount} registered projects${failureSuffix}`);
  }

  private async runCompilePass(
    params: CompilePass,
    cwd: string,
    sourceFlag?: string,
  ): Promise<boolean> {
    const { label, projectDir, installation, sourcePath, scopeFilter } = params;

    this.log("");
    this.log(`Compiling ${label.toLowerCase()} agents...`);
    this.log("");

    verbose(`  Project: ${projectDir}`);
    verbose(`  Agents: ${installation.agentsDir}`);

    const { allSkills, totalSkillCount } = await this.discoverAllSkills(projectDir);

    if (totalSkillCount === 0) {
      this.log(`No skills found for ${label.toLowerCase()} pass, skipping`);
      // The config loads independently of discovered skills: a hand-edited
      // config.ts can list skills while nothing is installed for this scope,
      // and its type unions must follow the config rather than stay stale.
      await this.refreshConfigTypes(params, cwd, sourceFlag);
      return false;
    }

    await this.warnUnresolvedStackSkills(projectDir, allSkills);

    this.log(STATUS_MESSAGES.RECOMPILING_AGENTS);
    try {
      const recompileResult = await compileAgents({
        projectDir,
        sourcePath,
        skills: allSkills,
        pluginDir: projectDir,
        outputDir: installation.agentsDir,
        scopeFilter,
      });

      if (recompileResult.failed.length > 0) {
        this.log(
          `Recompiled ${recompileResult.compiled.length} ${label.toLowerCase()} agents (${recompileResult.failed.length} failed)`,
        );
        for (const warning of recompileResult.warnings) {
          this.warn(warning);
        }
      } else if (recompileResult.compiled.length > 0) {
        this.log(`Recompiled ${recompileResult.compiled.length} ${label.toLowerCase()} agents`);
      } else {
        this.log(INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE);
        if (label === "Project") {
          await this.hintGlobalScopedAgents(projectDir);
        }
      }

      if (recompileResult.compiled.length > 0) {
        verbose(`  Compiled: ${recompileResult.compiled.join(", ")}`);
      }
    } catch (error) {
      this.log(ERROR_MESSAGES.FAILED_COMPILE_AGENTS);
      this.handleError(error);
    }

    await this.refreshConfigTypes(params, cwd, sourceFlag);

    this.log("");
    this.logSuccess(`${label} compile complete!`);
    this.log("");

    return true;
  }
}

type CompilePass = {
  label: "Global" | "Project";
  projectDir: string;
  installation: Installation;
  sourcePath: string;
  agents: Record<AgentName, AgentDefinition>;
  scopeFilter?: SkillScope;
};

function buildCompilePasses(
  installations: BothInstallations,
  cwd: string,
  agentDefs: AgentDefs,
): CompilePass[] {
  const { sourcePath, agents } = agentDefs;
  const passes: CompilePass[] = [];

  if (installations.global) {
    passes.push({
      label: "Global",
      projectDir: os.homedir(),
      installation: installations.global,
      sourcePath,
      agents,
      scopeFilter: installations.hasBoth ? "global" : undefined,
    });
  }

  if (installations.project) {
    passes.push({
      label: "Project",
      projectDir: cwd,
      installation: installations.project,
      sourcePath,
      agents,
      scopeFilter: installations.hasBoth ? "project" : undefined,
    });
  }

  return passes;
}

function formatDiscoveryMessage(result: DiscoveredSkills): string {
  const { totalSkillCount, pluginSkillCount } = result;
  const localCount = totalSkillCount - pluginSkillCount;

  if (pluginSkillCount > 0 && localCount > 0) {
    return `Discovered ${totalSkillCount} skills (${pluginSkillCount} from plugins, ${localCount} local)`;
  }

  return pluginSkillCount > 0
    ? `Discovered ${pluginSkillCount} skills from plugins`
    : `Discovered ${totalSkillCount} local skills`;
}
