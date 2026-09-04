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
  discoverInstalledSkills,
  type DiscoveredSkills,
} from "../lib/operations";
import {
  ConfigLoadError,
  effectivelyExcludedSkillIds,
  isActiveAt,
  loadProjectConfig,
  loadProjectConfigFromDir,
  resolveSource,
} from "../lib/configuration";
import { getStackSkillIds, resolveAgentConfigToSkills } from "../lib/stacks";
import { loadSkillsMatrixFromSource, type UnusableSkillMetadata } from "../lib/loading";
import { STANDARD_FILES } from "../consts";
import { EXIT_CODES } from "../lib/exit-codes";
import { getErrorMessage } from "../utils/errors";
import {
  ERROR_MESSAGES,
  STATUS_MESSAGES,
  INFO_MESSAGES,
  configTypesRefreshFailed,
  globalScopedAgentsHint,
  recompileSummary,
  registeredProjectUpdateSkipped,
  scopeBlockedStackAssignment,
  skillMetadataUnusableDetail,
  skillMetadataUnusableError,
} from "../utils/messages";
import { reconcileTypesFromDisk, type GateReport } from "../lib/config-gate/index.js";
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
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Compile);
    setVerbose(flags.verbose);
    const cwd = process.cwd();

    const installations = await this.detectInstallations(cwd);
    await this.resolveAndLogSource(cwd);
    const agentDefs = await this.loadAgentDefsOrFail();
    await this.runCompilePasses(installations, agentDefs, cwd);
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

  /**
   * Names where the marketplace came from — the project's own config first, then the global
   * one, then the default. `compile` takes no `--marketplace`: it recompiles an installation
   * that already recorded which marketplace its skill references answer to, and reading
   * a different one would write agents against a catalogue config.ts does not name.
   */
  private async resolveAndLogSource(projectDir: string): Promise<void> {
    this.log(STATUS_MESSAGES.RESOLVING_SOURCE);
    try {
      // ABORT on an unreadable config, and unreachable with one: `detectInstallation` reads the
      // same file first and already hard-errors, at both scopes — verified by hand at both.
      // The posture is recorded anyway, because what makes it unreachable is a guard in another
      // command's private helper rather than anything visible from here.
      const sourceConfig = await resolveSource({ caller: "stored", projectDir });
      this.log(`Marketplace: ${sourceConfig.sourceOrigin}`);
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

    let totalPassesWithSkills = 0;
    for (const pass of passes) {
      const hadSkills = await this.runCompilePass(pass, cwd);
      if (hadSkills) totalPassesWithSkills++;
    }

    if (totalPassesWithSkills === 0) {
      this.error(ERROR_MESSAGES.NO_SKILLS_TO_COMPILE, { exit: EXIT_CODES.ERROR });
    }
  }

  /**
   * Discovers what this pass compiles from, and refuses the run when any installed
   * skill's metadata.yaml exists but describes no skill — before a count is printed,
   * an agent is written or the type unions are regenerated. Skipping such a skill is
   * what the config-types pass already does; loading it anyway is what this pass
   * used to do, so a single run both loaded and skipped the same file.
   */
  private async discoverAllSkills(projectDir: string): Promise<DiscoveredSkills> {
    this.log(STATUS_MESSAGES.DISCOVERING_SKILLS);
    const result = await discoverInstalledSkills(projectDir);
    if (result.unusableMetadata.length > 0) {
      this.refuseUnusableSkillMetadata(result.unusableMetadata);
    }
    if (result.totalSkillCount === 0) return result;
    this.log(formatDiscoveryMessage(result));
    return result;
  }

  /**
   * Names each offending file and its reason, then exits. The detail is LOGGED and
   * only the refusal is raised: oclif hard-wraps error text at the terminal width,
   * and a path broken across two lines is one nobody can copy.
   */
  private refuseUnusableSkillMetadata(entries: UnusableSkillMetadata[]): never {
    for (const entry of entries) {
      this.log(skillMetadataUnusableDetail(entry));
    }
    this.error(skillMetadataUnusableError(entries), { exit: EXIT_CODES.ERROR });
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
   * `config.ts` is the hand-editable half of the pair, so it can declare a pair the scope
   * rule forbids: a GLOBAL sub-agent whose stack carries a PROJECT-scoped skill. The
   * compile-time filter in `buildCompileAgents` drops that reference on the way to the
   * resolver and `compile` rewrites nothing in `config.ts`, so the row survives and is
   * dropped again on every future run — while the recompile summary reports a clean pass
   * over an agent that no longer carries what its own config says it does.
   *
   * The sibling of {@link warnUnresolvedStackSkills} one layer over: there the skill is
   * missing from disk, here it is present and unreachable from that sub-agent.
   */
  private async warnScopeDroppedStackPairs(projectDir: string): Promise<void> {
    const loaded = await loadProjectConfig(projectDir);
    if (!loaded?.config.stack) return;

    for (const [skillId, agentNames] of findScopeDroppedStackPairs(loaded.config)) {
      this.warn(scopeBlockedStackAssignment(agentNames, skillId));
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
   * Loads this pass's skills catalogue and returns it, seating the module-level
   * singleton (`matrix` in `matrix-provider.ts`) on the way — which is what the
   * RENDER needs, because `compileAgents` reaches the catalogue through
   * `stacks-loader.ts`'s `statedUsageFor`/`liveCategoryOf` and those read the
   * singleton directly rather than any value a caller threads through. Called
   * first, before anything in the pass renders. Left unseated, the singleton stays
   * at its process-start default (`BUILT_IN_MATRIX`, which never carries a local
   * skill), so a locally-installed skill's stated `usageGuidance` silently falls
   * back to the generic per-category placeholder — different bytes from what
   * `install` last wrote, so a following `compile` rewrites every agent that
   * carries one.
   *
   * Scoped to `pass.projectDir`, never the invoking `cwd`: a global pass must seat
   * the global installation's own local skills, not the invoking directory's.
   *
   * `skipExtraSources: true` is NOT a divergence from the wizard's full
   * multi-source load: extra-source loading only annotates each skill's
   * `availableSources`/`activeSource` for wizard UI tagging — it never adds skills
   * or categories to the matrix, and neither the render path nor the config-types
   * writer ever reads those annotations, so the emitted output is byte-identical
   * either way (pinned by the skipExtraSources parity test in
   * local-installer.test.ts). Skipping avoids fetching every registered extra
   * source (network on a cold cache, plus unreachable-remote warnings) on this
   * offline compile path. `matrixOnly` keeps the default-source path itself
   * offline too.
   *
   * The seated matrix is RETURNED as well as seated, and `null` on a failure, so
   * the two halves can take the postures they each need. The RENDER degrades: it
   * reads the singleton whatever happens, and falls back to the same
   * category-placeholder behavior compile had before this seat existed. The type
   * refresh ABORTS on `null` — it derives every union from the catalogue, so with
   * none loaded it would narrow them to whatever the built-in catalogue happens
   * to carry, dropping every marketplace-only and local category and, at global
   * scope, propagating that into every registered project.
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
   * The documented hand-edit workflow is "edit config.ts, then run compile", and
   * the type unions in config-types.ts are derived from config.ts — so a compile
   * pass that leaves them untouched strands stale unions after a hand-edit.
   * Regenerates them from the scope's persisted config exactly as the wizard
   * write path would: standalone narrowed unions at global scope, import-and-
   * extend at project scope. A failed refresh downgrades to a warning — the
   * compiled agents are already written and remain valid; only the type unions
   * may still be stale.
   *
   * Takes the catalogue {@link seatMatrixForPass} returned rather than reading the
   * singleton it seated, so this refresh cannot run against a seat that is not the
   * one this pass asked for. `null` means the seat failed, and the refresh is
   * skipped whole: every union here is DERIVED from the catalogue, so writing them
   * without one is not a degraded answer but a wrong one — the unions narrow to
   * the built-in catalogue's own categories, and `config.ts` beside them still
   * keys its `stack` under the ones that just vanished, so the pair stops
   * type-checking. Skipping falls under the same warning as any other failed
   * refresh, for the same reason.
   */
  private async refreshConfigTypes(
    pass: CompilePass,
    cwd: string,
    seatedMatrix: MergedSkillsMatrix | null,
  ): Promise<void> {
    if (!seatedMatrix) {
      this.warn(
        configTypesRefreshFailed(`no skills catalogue could be loaded for ${pass.projectDir}`),
      );
      return;
    }

    let report: GateReport;
    try {
      const loaded = await loadProjectConfigFromDir(pass.projectDir);
      if (!loaded) {
        verbose(
          `No config found at ${pass.projectDir} — skipping ${STANDARD_FILES.CONFIG_TYPES_TS} refresh`,
        );
        return;
      }

      // `cwd` is excluded from the fan-out, which only a global pass can perform:
      // whatever this invocation was run from is this command's own subject, so a
      // fan-out must never reach back into it.
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

  /**
   * Renders the fan-out the refresh above performed. Kept out of the refresh's
   * catch on purpose: a project the fan-out could not reach is reported as that,
   * not as a failure to refresh the type unions — which did succeed.
   */
  private reportPropagation(report: GateReport): void {
    for (const skippedPath of report.propagated.skipped) {
      this.warn(registeredProjectUpdateSkipped(skippedPath));
    }
    this.reportPropagatedRecompile(report);
  }

  private async runCompilePass(params: CompilePass, cwd: string): Promise<boolean> {
    const { label, projectDir, installation, sourcePath, scopeFilter } = params;

    this.log("");
    this.log(`Compiling ${label.toLowerCase()} agents...`);
    this.log("");

    verbose(`  Project: ${projectDir}`);
    verbose(`  Agents: ${installation.agentsDir}`);

    // Before anything below reads the matrix — including the early return just
    // past skill discovery, which still calls refreshConfigTypes.
    const seatedMatrix = await this.seatMatrixForPass(projectDir);

    const { allSkills, totalSkillCount } = await this.discoverAllSkills(projectDir);

    if (totalSkillCount === 0) {
      this.log(`No skills found for ${label.toLowerCase()} pass, skipping`);
      // The config loads independently of discovered skills: a hand-edited
      // config.ts can list skills while nothing is installed for this scope,
      // and its type unions must follow the config rather than stay stale.
      await this.refreshConfigTypes(params, cwd, seatedMatrix);
      return false;
    }

    await this.warnUnresolvedStackSkills(projectDir, allSkills);
    await this.warnScopeDroppedStackPairs(projectDir);

    this.log(STATUS_MESSAGES.RECOMPILING_AGENTS);
    try {
      const recompileResult = await compileAgents({
        projectDir,
        sourcePath,
        skills: allSkills,
        pluginDir: projectDir,
        outputDir: installation.agentsDir,
        ...(scopeFilter !== undefined && { scopeFilter }),
      });

      const { compiled, rewritten, failed, warnings } = recompileResult;
      const summary = recompileSummary(
        rewritten.length,
        compiled.length - rewritten.length,
        `${label.toLowerCase()} agents`,
      );

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
          await this.hintGlobalScopedAgents(projectDir);
        }
      }

      if (compiled.length > 0) {
        verbose(`  Compiled: ${compiled.join(", ")}`);
      }
    } catch (error) {
      this.log(ERROR_MESSAGES.FAILED_COMPILE_AGENTS);
      this.handleError(error);
    }

    await this.refreshConfigTypes(params, cwd, seatedMatrix);

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
  agents: Partial<Record<AgentName, AgentDefinition>>;
  scopeFilter?: SkillScope;
};

/**
 * The single pass this invocation owns.
 *
 * A compile run inside a project is a PROJECT-scope operation and writes nothing
 * outside that project: it compiles the project's own agents and refreshes the
 * project's own type unions, and never the global install's or another
 * registered project's. Propagation is a global operation's consequence — the
 * global config is what every project's config inlines — and a project compile
 * is not one.
 *
 * The global pass is therefore reached only where no project installation is in
 * play: at the home directory (where `detectBothInstallations` returns no
 * project by construction), or in a directory that has no config of its own, so
 * the global install is the only thing there is to compile.
 *
 * `scopeFilter` still narrows the project pass whenever both installations
 * exist: the project's config inlines the global entries, so an unfiltered pass
 * would compile global-scoped agents into the project's own agents directory.
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

/**
 * Every project-scoped skill that a GLOBAL sub-agent's stack assigns to itself, with the
 * sub-agents that assign it — exactly the pairs `buildCompileAgents`' scope filter drops on
 * the way to the resolver.
 *
 * Grouped by skill rather than emitted per pair, so one sentence accounts for every
 * sub-agent one skill was kept away from.
 */
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

/** True when this sub-agent's stack names the skill, in any of its categories. */
function stackAssignsSkill(agentStack: StackAgentConfig | undefined, skillId: SkillId): boolean {
  if (!agentStack) return false;
  return resolveAgentConfigToSkills(agentStack).some((ref) => ref.id === skillId);
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
