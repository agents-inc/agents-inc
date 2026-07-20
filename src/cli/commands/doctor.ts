import os from "os";
import path from "path";
import { BaseCommand } from "../base-command";
import { getErrorMessage } from "../utils/errors";
import { EXIT_CODES } from "../lib/exit-codes";
import { effectivelyExcludedSkillIds, validateProjectConfig } from "../lib/configuration";
import { loadSource, detectProject } from "../lib/operations";
import { matrix } from "../lib/matrix/matrix-provider";
import { discoverLocalSkills } from "../lib/skills";
import { getStackSkillIds } from "../lib/stacks";
import { filterExcludedEntries, listAgentMdFiles } from "../lib/agents";
import { getVerifiedPluginInstallPaths, parseMarketplacePluginRef } from "../lib/plugins";
import { isHomeDirectory, installBaseDir, resolveInstallPaths } from "../lib/installation";
import type { MergedSkillsMatrix, ProjectConfig, SkillConfig } from "../types";
import { fileExists, directoryExists } from "../utils/fs";
import {
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  EJECT_SOURCE,
  LOCAL_SKILLS_PATH,
  STANDARD_FILES,
  UI_SYMBOLS,
} from "../consts";
import { countBy, unique } from "remeda";
import { setVerbose } from "../utils/logger";

type CheckKind = "config" | "skills" | "agents" | "orphans" | "installed" | "plugins" | "source";

type CheckResult = {
  kind: CheckKind;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  details?: string[];
};

type ConfigCheckOutput = {
  result: CheckResult;
  config: ProjectConfig | null;
};

/** Project-relative path to the config file, shown in doctor messages. */
const CONFIG_TS_REL = `${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`;

function checkConfigValid(config: ProjectConfig | null): ConfigCheckOutput {
  if (!config) {
    return {
      result: {
        kind: "config",
        status: "fail",
        message: `${CONFIG_TS_REL} not found`,
        details: [`Run '${CLI_INVOKE_COMMAND} init' to create a configuration`],
      },
      config: null,
    };
  }

  const validation = validateProjectConfig(config);

  if (!validation.valid) {
    return {
      result: {
        kind: "config",
        status: "fail",
        message: `${CONFIG_TS_REL} has errors`,
        details: validation.errors,
      },
      config: null,
    };
  }

  if (validation.warnings.length > 0) {
    return {
      result: {
        kind: "config",
        status: "warn",
        message: `${CONFIG_TS_REL} has warnings`,
        details: validation.warnings,
      },
      config,
    };
  }

  return {
    result: {
      kind: "config",
      status: "pass",
      message: `${CONFIG_TS_REL} is valid`,
    },
    config,
  };
}

async function checkSkillsResolved(
  config: ProjectConfig,
  matrix: MergedSkillsMatrix,
  projectDir: string,
): Promise<CheckResult> {
  // config.ts declares skills both directly and through the stack. A global-only
  // install has a populated skills array and no stack at all, so keying this check
  // off the stack alone would report "No skills configured" for a real install.
  const excludedIds = effectivelyExcludedSkillIds(config.skills);
  const stackIds = config.stack ? getStackSkillIds(config.stack) : [];
  const uniqueSkills = unique([...stackIds, ...config.skills.map((s) => s.id)]).filter(
    (id) => !excludedIds.has(id),
  );

  if (uniqueSkills.length === 0) {
    return {
      kind: "skills",
      status: "pass",
      message: "No skills configured",
    };
  }

  const [localResult, globalResult] = await Promise.all([
    discoverLocalSkills(projectDir),
    !isHomeDirectory(projectDir) ? discoverLocalSkills(os.homedir()) : null,
  ]);
  const localSkillIds = new Set([
    ...(localResult?.skills.map((s) => s.id) ?? []),
    ...(globalResult?.skills.map((s) => s.id) ?? []),
  ]);

  const missingSkills: string[] = [];
  for (const skillId of uniqueSkills) {
    const inMatrix = skillId in matrix.skills;
    const inLocal = localSkillIds.has(skillId);
    if (!inMatrix && !inLocal) {
      missingSkills.push(skillId);
    }
  }

  if (missingSkills.length > 0) {
    return {
      kind: "skills",
      status: "fail",
      message: `${uniqueSkills.length - missingSkills.length}/${uniqueSkills.length} skills found`,
      details: missingSkills.map((s) => `- ${s} (not found)`),
    };
  }

  return {
    kind: "skills",
    status: "pass",
    message: `${uniqueSkills.length}/${uniqueSkills.length} skills found`,
  };
}

async function checkAgentsCompiled(
  config: ProjectConfig,
  projectDir: string,
): Promise<CheckResult> {
  const agents = config.agents ?? [];

  if (agents.length === 0) {
    return {
      kind: "agents",
      status: "pass",
      message: "No agents configured",
    };
  }

  const projectAgentsDir = resolveInstallPaths(projectDir, "project").agentsDir;
  const globalAgentsDir = resolveInstallPaths(projectDir, "global").agentsDir;
  const agentChecks = await Promise.all(
    agents.map(async (agent) => {
      // Check scope-appropriate directory for the agent
      const agentsDir = agent.scope === "global" ? globalAgentsDir : projectAgentsDir;
      const agentPath = path.join(agentsDir, `${agent.name}.md`);
      return { name: agent.name, compiled: await fileExists(agentPath) };
    }),
  );
  const missingAgents = agentChecks.filter((c) => !c.compiled).map((c) => c.name);

  if (missingAgents.length > 0) {
    return {
      kind: "agents",
      status: "warn",
      message: `${missingAgents.length} agent${missingAgents.length === 1 ? "" : "s"} need${missingAgents.length === 1 ? "s" : ""} recompilation`,
      details: missingAgents.map((a) => `- ${a} (missing)`),
    };
  }

  return {
    kind: "agents",
    status: "pass",
    message: `${agents.length}/${agents.length} agents compiled`,
  };
}

async function checkNoOrphans(config: ProjectConfig, projectDir: string): Promise<CheckResult> {
  const projectAgentsDir = resolveInstallPaths(projectDir, "project").agentsDir;
  const globalAgentsDir = resolveInstallPaths(projectDir, "global").agentsDir;

  // At home scope both scopes resolve to the same agents directory, so it is
  // listed once and its files are matched against both scopes' known names.
  const scopesShareAgentsDir = isHomeDirectory(projectDir);

  const [projectExists, globalExists] = await Promise.all([
    directoryExists(projectAgentsDir),
    !scopesShareAgentsDir ? directoryExists(globalAgentsDir) : false,
  ]);

  if (!projectExists && !globalExists) {
    return {
      kind: "orphans",
      status: "pass",
      message: "No agents directory",
    };
  }

  const projectMdFiles = projectExists ? await listAgentMdFiles(projectAgentsDir) : [];
  const globalMdFiles = globalExists ? await listAgentMdFiles(globalAgentsDir) : [];

  // Project files: only active project-scoped agents should have .md files here
  const activeProjectAgents: Set<string> = new Set(
    (config.agents ?? []).filter((a) => a.scope === "project" && !a.excluded).map((a) => a.name),
  );
  // Global files: all global-scoped agents (including excluded) still serve other projects
  const knownGlobalAgents: Set<string> = new Set(
    (config.agents ?? []).filter((a) => a.scope === "global").map((a) => a.name),
  );

  const knownProjectDirAgents = scopesShareAgentsDir
    ? new Set([...activeProjectAgents, ...knownGlobalAgents])
    : activeProjectAgents;

  const orphanedFiles: string[] = [];
  for (const file of projectMdFiles) {
    const agentName = file.replace(/\.md$/, "");
    if (!knownProjectDirAgents.has(agentName)) {
      orphanedFiles.push(agentName);
    }
  }
  for (const file of globalMdFiles) {
    const agentName = file.replace(/\.md$/, "");
    if (!knownGlobalAgents.has(agentName)) {
      orphanedFiles.push(agentName);
    }
  }

  if (orphanedFiles.length > 0) {
    return {
      kind: "orphans",
      status: "warn",
      message: `${orphanedFiles.length} orphaned agent file${orphanedFiles.length === 1 ? "" : "s"}`,
      details: orphanedFiles.map((f) => `- ${f}.md (not in config)`),
    };
  }

  return {
    kind: "orphans",
    status: "pass",
    message: "No orphaned agent files",
  };
}

async function checkSkillsInstalled(
  config: ProjectConfig,
  projectDir: string,
): Promise<CheckResult> {
  const skills: SkillConfig[] = config.skills ?? [];
  const ejectSkills = skills.filter((s) => s.source === EJECT_SOURCE);

  if (ejectSkills.length === 0) {
    return {
      kind: "installed",
      status: "pass",
      message: "No eject-mode skills configured",
    };
  }

  const skillChecks = await Promise.all(
    ejectSkills.map(async (skill) => {
      const baseDir = installBaseDir(projectDir, skill.scope);
      const skillMdPath = path.join(baseDir, LOCAL_SKILLS_PATH, skill.id, STANDARD_FILES.SKILL_MD);
      return { id: skill.id, installed: await fileExists(skillMdPath) };
    }),
  );
  const missingSkills = skillChecks.filter((c) => !c.installed).map((c) => c.id);

  if (missingSkills.length > 0) {
    return {
      kind: "installed",
      status: "warn",
      message: `${missingSkills.length} skill${missingSkills.length === 1 ? "" : "s"} missing from disk`,
      details: missingSkills.map((s) => `- ${s} (not found in ${LOCAL_SKILLS_PATH}/)`),
    };
  }

  return {
    kind: "installed",
    status: "pass",
    message: `${ejectSkills.length}/${ejectSkills.length} eject-mode skills installed`,
  };
}

/**
 * Plugin-mode skills have no files under `.claude/skills/` — they live in the
 * Claude plugin registry. Verifying them means asking the registry for the scope
 * each skill was installed at, not looking on disk.
 */
async function checkPluginSkillsInstalled(
  config: ProjectConfig,
  projectDir: string,
): Promise<CheckResult> {
  const pluginSkills: SkillConfig[] = config.skills.filter((s) => s.source !== EJECT_SOURCE);

  if (pluginSkills.length === 0) {
    return {
      kind: "plugins",
      status: "pass",
      message: "No plugin-mode skills configured",
    };
  }

  const baseDirs = unique(pluginSkills.map((s) => installBaseDir(projectDir, s.scope)));
  const missingPerBaseDir = await Promise.all(
    baseDirs.map(async (baseDir) => {
      const installedIds = new Set(
        (await getVerifiedPluginInstallPaths(baseDir)).map((plugin) =>
          parseMarketplacePluginRef(plugin.pluginKey),
        ),
      );
      return pluginSkills
        .filter((skill) => installBaseDir(projectDir, skill.scope) === baseDir)
        .filter((skill) => !installedIds.has(skill.id))
        .map((skill) => skill.id);
    }),
  );
  const missingSkills = missingPerBaseDir.flat();

  if (missingSkills.length > 0) {
    return {
      kind: "plugins",
      status: "warn",
      message: `${missingSkills.length} skill${missingSkills.length === 1 ? "" : "s"} not installed as plugins`,
      details: missingSkills.map((s) => `- ${s} (no enabled plugin found)`),
    };
  }

  return {
    kind: "plugins",
    status: "pass",
    message: `${pluginSkills.length}/${pluginSkills.length} plugin-mode skills installed`,
  };
}

async function checkSourceReachable(projectDir: string): Promise<CheckResult> {
  try {
    const { sourceResult: result } = await loadSource({
      projectDir,
    });

    const skillCount = Object.keys(matrix.skills).length;
    const sourceLabel = result.isLocal ? "local" : "remote";

    return {
      kind: "source",
      status: "pass",
      message: `Connected to ${sourceLabel}: ${result.sourcePath}`,
      details: [`${skillCount} skills available`],
    };
  } catch (error) {
    const message = getErrorMessage(error);
    return {
      kind: "source",
      status: "fail",
      message: "Failed to load source",
      details: [message],
    };
  }
}

const CHECK_WIDTH = 20;

function formatCheckName(name: string): string {
  return name.padEnd(CHECK_WIDTH);
}

function formatStatus(status: CheckResult["status"]): string {
  switch (status) {
    case "pass":
      return UI_SYMBOLS.CHECK;
    case "fail":
      return UI_SYMBOLS.CROSS;
    case "warn":
      return "!";
    case "skip":
      return "-";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatCheckLine(name: string, result: CheckResult): string[] {
  const headerLine = `  ${formatCheckName(name)}${formatStatus(result.status)}  ${result.message}`;
  const detailLines = (result.details ?? []).map(
    (detail) => `  ${" ".repeat(CHECK_WIDTH)}   ${detail}`,
  );
  return [headerLine, ...detailLines];
}

function formatSummary(results: CheckResult[]): string {
  const counts = countBy(results, (r) => r.status);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  const parts = [
    `${counts.pass ?? 0} passed`,
    plural(counts.warn ?? 0, "warning"),
    plural(counts.fail ?? 0, "error"),
  ];

  return `  Summary: ${parts.join(", ")}`;
}

const TIPS: Array<{ kind: CheckKind; status: CheckResult["status"]; tip: string }> = [
  {
    kind: "agents",
    status: "warn",
    tip: `  Tip: Run '${CLI_INVOKE_COMMAND} compile' to generate missing agent files`,
  },
  {
    kind: "config",
    status: "fail",
    tip: `  Tip: Run '${CLI_INVOKE_COMMAND} init' to create or fix configuration`,
  },
  {
    kind: "skills",
    status: "fail",
    tip: "  Tip: Check skill IDs in config match available skills",
  },
  {
    kind: "installed",
    status: "warn",
    // No command is named on purpose: 'eject skills --force' re-copies every skill in the
    // source and always targets project scope, so it cannot repair a global-scoped skill
    // and it litters a plugin-mode project with local skill directories.
    tip: "  Tip: Re-eject the missing skills from the source to restore their files",
  },
];

function formatTips(results: CheckResult[]): string[] {
  return TIPS.filter((t) => results.some((r) => r.kind === t.kind && r.status === t.status)).map(
    (t) => t.tip,
  );
}

function skippedResult(kind: CheckKind): CheckResult {
  return { kind, status: "skip", message: "Skipped (config invalid)" };
}

/**
 * Wrap a check so a thrown exception becomes a `fail` result instead of crashing the
 * whole doctor run. Per-check isolation ensures one broken check does not mask others.
 */
async function safeCheck(kind: CheckKind, fn: () => Promise<CheckResult>): Promise<CheckResult> {
  try {
    return await fn();
  } catch (error) {
    return { kind, status: "fail", message: "Check threw", details: [getErrorMessage(error)] };
  }
}

export default class Doctor extends BaseCommand {
  static summary = "Diagnose common configuration issues";

  static description = `Run diagnostic checks on your ${DEFAULT_BRANDING.NAME} configuration to identify issues with config validity, skill resolution, agent compilation, and source connectivity.`;

  static examples = ["<%= config.bin %> <%= command.id %>"];

  // Override parent baseFlags to drop --source (not relevant for diagnostics)
  static baseFlags = {} as (typeof BaseCommand)["baseFlags"];

  static flags = {};

  async run(): Promise<void> {
    await this.parse(Doctor);
    setVerbose(true);
    const projectDir = process.cwd();

    this.printHeader();
    const results = await this.runAllChecks(projectDir);
    this.printResults(results);

    if (results.some((r) => r.status === "fail")) {
      this.exit(EXIT_CODES.ERROR);
    }
  }

  private printHeader(): void {
    this.log("");
    this.log(`${DEFAULT_BRANDING.NAME} Doctor`);
    this.log("");
    this.log("  Checking configuration health...");
    this.log("");
  }

  private async runAllChecks(projectDir: string): Promise<CheckResult[]> {
    const detected = await detectProject(projectDir);
    const { result: configResult, config } = checkConfigValid(detected?.config ?? null);
    this.logCheck("Config Valid", configResult);

    // loadSource (called by checkSourceReachable) populates the matrix. Run it
    // before checkSkillsResolved so skills lookups see a populated matrix; if
    // source fails, skip skills rather than reporting false "not found" errors.
    const sourceResult = await safeCheck("source", () => checkSourceReachable(projectDir));

    const filteredConfig = config ? filterExcludedEntries(config) : null;

    const skillsResult = !config
      ? skippedResult("skills")
      : sourceResult.status === "fail"
        ? {
            kind: "skills" as const,
            status: "skip" as const,
            message: "Skipped (source unreachable)",
          }
        : await safeCheck("skills", () => checkSkillsResolved(config, matrix, projectDir));
    this.logCheck("Skills Resolved", skillsResult);

    const agentsResult = filteredConfig
      ? await safeCheck("agents", () => checkAgentsCompiled(filteredConfig, projectDir))
      : skippedResult("agents");
    this.logCheck("Agents Compiled", agentsResult);

    const orphansResult = config
      ? await safeCheck("orphans", () => checkNoOrphans(config, projectDir))
      : skippedResult("orphans");
    this.logCheck("No Orphans", orphansResult);

    const installedResult = filteredConfig
      ? await safeCheck("installed", () => checkSkillsInstalled(filteredConfig, projectDir))
      : skippedResult("installed");
    this.logCheck("Skills Installed", installedResult);

    const pluginsResult = filteredConfig
      ? await safeCheck("plugins", () => checkPluginSkillsInstalled(filteredConfig, projectDir))
      : skippedResult("plugins");
    this.logCheck("Plugins Installed", pluginsResult);

    this.logCheck("Source Reachable", sourceResult);

    return [
      configResult,
      skillsResult,
      agentsResult,
      orphansResult,
      installedResult,
      pluginsResult,
      sourceResult,
    ];
  }

  private logCheck(name: string, result: CheckResult): void {
    for (const line of formatCheckLine(name, result)) {
      this.log(line);
    }
  }

  private printResults(results: CheckResult[]): void {
    this.log("");
    this.log(formatSummary(results));

    const tips = formatTips(results);
    if (tips.length > 0) {
      this.log("");
      for (const tip of tips) {
        this.log(tip);
      }
    }

    this.log("");
  }
}
