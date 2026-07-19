import os from "os";
import path from "path";
import { BaseCommand } from "../base-command";
import { getErrorMessage } from "../utils/errors";
import { EXIT_CODES } from "../lib/exit-codes";
import { validateProjectConfig } from "../lib/configuration";
import { loadSource, detectProject } from "../lib/operations";
import { matrix } from "../lib/matrix/matrix-provider";
import { discoverLocalSkills } from "../lib/skills";
import { getStackSkillIds } from "../lib/stacks";
import { filterExcludedEntries } from "../lib/agents";
import { isHomeDirectory, installBaseDir } from "../lib/installation";
import type { MergedSkillsMatrix, ProjectConfig, SkillConfig } from "../types";
import { fileExists, glob, directoryExists } from "../utils/fs";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  EJECT_SOURCE,
  LOCAL_SKILLS_PATH,
  STANDARD_FILES,
  UI_SYMBOLS,
} from "../consts";
import { countBy } from "remeda";
import { setVerbose } from "../utils/logger";

type CheckKind = "config" | "skills" | "agents" | "orphans" | "installed" | "source";

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

function checkConfigValid(config: ProjectConfig | null): ConfigCheckOutput {
  if (!config) {
    return {
      result: {
        kind: "config",
        status: "fail",
        message: `${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS} not found`,
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
        message: `${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS} has errors`,
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
        message: `${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS} has warnings`,
        details: validation.warnings,
      },
      config,
    };
  }

  return {
    result: {
      kind: "config",
      status: "pass",
      message: `${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS} is valid`,
    },
    config,
  };
}

async function checkSkillsResolved(
  config: ProjectConfig,
  matrix: MergedSkillsMatrix,
  projectDir: string,
): Promise<CheckResult> {
  // Filter excluded skill IDs from the stack check
  const activeIds = new Set(config.skills.filter((s) => !s.excluded).map((s) => s.id));
  const excludedIds = new Set(
    config.skills.filter((s) => s.excluded && !activeIds.has(s.id)).map((s) => s.id),
  );
  const uniqueSkills = config.stack
    ? getStackSkillIds(config.stack).filter((id) => !excludedIds.has(id))
    : [];

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

  const projectAgentsDir = path.join(projectDir, CLAUDE_DIR, "agents");
  const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, "agents");
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
  const projectAgentsDir = path.join(projectDir, CLAUDE_DIR, "agents");
  const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, "agents");

  const [projectExists, globalExists] = await Promise.all([
    directoryExists(projectAgentsDir),
    !isHomeDirectory(projectDir) ? directoryExists(globalAgentsDir) : false,
  ]);

  if (!projectExists && !globalExists) {
    return {
      kind: "orphans",
      status: "pass",
      message: "No agents directory",
    };
  }

  const projectMdFiles = projectExists ? await glob("*.md", projectAgentsDir) : [];
  const globalMdFiles = globalExists ? await glob("*.md", globalAgentsDir) : [];

  // Project files: only active project-scoped agents should have .md files here
  const activeProjectAgents: Set<string> = new Set(
    (config.agents ?? []).filter((a) => a.scope === "project" && !a.excluded).map((a) => a.name),
  );
  // Global files: all global-scoped agents (including excluded) still serve other projects
  const knownGlobalAgents: Set<string> = new Set(
    (config.agents ?? []).filter((a) => a.scope === "global").map((a) => a.name),
  );

  const orphanedFiles: string[] = [];
  for (const file of projectMdFiles) {
    const agentName = file.replace(/\.md$/, "");
    if (!activeProjectAgents.has(agentName)) {
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
    tip: `  Tip: Run '${CLI_INVOKE_COMMAND} compile' to reinstall missing skill files`,
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

    this.logCheck("Source Reachable", sourceResult);

    return [configResult, skillsResult, agentsResult, orphansResult, installedResult, sourceResult];
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
