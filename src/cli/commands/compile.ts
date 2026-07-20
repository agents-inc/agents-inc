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
  effectivelyExcludedSkillIds,
  loadProjectConfig,
  resolveSource,
} from "../lib/configuration";
import { getStackSkillIds } from "../lib/stacks";
import { CLI_INVOKE_COMMAND } from "../consts";
import { EXIT_CODES } from "../lib/exit-codes";
import { ERROR_MESSAGES, STATUS_MESSAGES, INFO_MESSAGES } from "../utils/messages";
import { type Installation } from "../lib/installation";
import type { SkillScope } from "../types/config";
import type { SkillDefinitionMap } from "../types";

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
    await this.compileAllScopes(installations, agentDefs, cwd);
  }

  private async detectInstallations(cwd: string): Promise<BothInstallations> {
    const installations = await detectBothInstallations(cwd);

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
  ): Promise<void> {
    // When both installations exist, filter each pass to its own scope to prevent
    // the project pass from overwriting global agents with zero-skill versions
    // (the project config's stack only has project agent entries).
    const passes = buildCompilePasses(installations, cwd, agentDefs.sourcePath);

    let totalPassesWithSkills = 0;
    for (const pass of passes) {
      const hadSkills = await this.runCompilePass(pass);
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

  private async runCompilePass(params: CompilePass): Promise<boolean> {
    const { label, projectDir, installation, sourcePath, scopeFilter } = params;

    this.log("");
    this.log(`Compiling ${label.toLowerCase()} agents...`);
    this.log("");

    verbose(`  Project: ${projectDir}`);
    verbose(`  Agents: ${installation.agentsDir}`);

    const { allSkills, totalSkillCount } = await this.discoverAllSkills(projectDir);

    if (totalSkillCount === 0) {
      this.log(`No skills found for ${label.toLowerCase()} pass, skipping`);
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
      }

      if (recompileResult.compiled.length > 0) {
        verbose(`  Compiled: ${recompileResult.compiled.join(", ")}`);
      }
    } catch (error) {
      this.log(ERROR_MESSAGES.FAILED_COMPILE_AGENTS);
      this.handleError(error);
    }

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
  scopeFilter?: SkillScope;
};

function buildCompilePasses(
  installations: BothInstallations,
  cwd: string,
  sourcePath: string,
): CompilePass[] {
  const passes: CompilePass[] = [];

  if (installations.global) {
    passes.push({
      label: "Global",
      projectDir: os.homedir(),
      installation: installations.global,
      sourcePath,
      scopeFilter: installations.hasBoth ? "global" : undefined,
    });
  }

  if (installations.project) {
    passes.push({
      label: "Project",
      projectDir: cwd,
      installation: installations.project,
      sourcePath,
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
