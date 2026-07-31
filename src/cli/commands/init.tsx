import os from "os";
import React from "react";

import { Flags, type Interfaces } from "@oclif/core";
import { render, Box, Text, useApp } from "ink";

import { BaseCommand, type SourceRefreshFlags } from "../base-command.js";
import { type WizardResultV2 } from "../components/wizard/wizard.js";
import { runWizardSession } from "../components/wizard/run-wizard-session.js";
import { useTerminalDimensions } from "../components/hooks/use-terminal-dimensions.js";
import { type SourceLoadResult } from "../lib/loading/index.js";
import {
  loadSource,
  loadAgentDefs,
  copyLocalSkills,
  installPluginSkills,
  pluginInstallFailureError,
  writeProjectConfig,
  compileAgentsAllScopes,
  recompilePropagatedProjectAgents,
  type CompilationResult,
  type SkillCopyResult,
  discoverInstalledSkills,
} from "../lib/operations/index.js";
import { getInstallationInfo } from "../lib/plugins/plugin-info.js";
import {
  loadProjectConfig,
  loadProjectConfigFromDir,
} from "../lib/configuration/project-config.js";
import {
  type InstallMode,
  detectInstallation,
  detectGlobalInstallation,
  deriveInstallMode,
  resolveInstallPaths,
  buildAgentScopeMap,
  isHomeDirectory,
  INSTALL_MODE_LABELS,
} from "../lib/installation/index.js";
import { checkPermissions } from "../lib/permission-checker.js";
import {
  ASCII_LOGO,
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  EDIT_PROJECT_SETUP_FLAG,
  EJECT_SOURCE,
  STANDARD_FILES,
} from "../consts.js";
import { clearTerminalScreen } from "../utils/terminal.js";
import { SelectList, type SelectListItem } from "../components/common/select-list.js";
import { promptValue } from "../components/common/prompt-confirm.js";
import { Spinner } from "../components/common/spinner.js";
import { getErrorMessage } from "../utils/errors.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import type { AgentName, ProjectConfig, SkillScope } from "../types/index.js";
import { type StartupMessage } from "../utils/logger.js";
import { SUCCESS_MESSAGES, STATUS_MESSAGES } from "../utils/messages.js";

const DASHBOARD_OPTIONS = [
  { label: "Edit", value: "edit" },
  { label: "Compile", value: "compile" },
  { label: "Doctor", value: "doctor" },
  { label: "List", value: "list" },
] as const satisfies readonly SelectListItem<string>[];

/** The commands offered by the project dashboard (single source: DASHBOARD_OPTIONS). */
export type DashboardCommand = (typeof DASHBOARD_OPTIONS)[number]["value"];

type DashboardProps = {
  onSelect: (command: DashboardCommand) => void;
  onCancel: () => void;
};

const Dashboard: React.FC<DashboardProps> = ({ onSelect, onCancel }) => {
  const { exit } = useApp();
  const { rows: terminalHeight } = useTerminalDimensions();

  return (
    <Box flexDirection="column" height={terminalHeight}>
      <Box marginBottom={1}>
        <Text>{ASCII_LOGO}</Text>
      </Box>
      <SelectList
        items={DASHBOARD_OPTIONS}
        onSelect={(command) => {
          onSelect(command);
          exit();
        }}
        onCancel={() => {
          onCancel();
          exit();
        }}
      />
    </Box>
  );
};

/** Formats the dashboard summary as plain text lines (for non-interactive/test output). */
export function formatDashboardText(data: DashboardData): string {
  const modeLabel = INSTALL_MODE_LABELS[data.mode];
  const lines = [
    DEFAULT_BRANDING.NAME,
    "",
    `  Skills:  ${data.skillCount} installed`,
    `  Agents:  ${data.agentCount} compiled`,
    `  Mode:    ${modeLabel}`,
  ];
  if (data.source) {
    lines.push(`  Source:  ${data.source}`);
  }
  lines.push("");
  lines.push(`  [Edit]  [Compile]  [Doctor]  [List]`);
  return lines.join("\n");
}

/**
 * Shows the project dashboard and returns the selected command (or null if cancelled).
 * In non-interactive environments (no TTY), prints the summary text and returns null.
 */
export async function showDashboard(
  projectDir: string,
  log?: (message: string) => void,
): Promise<DashboardCommand | null> {
  const data = await getDashboardData(projectDir);

  // Non-interactive: print text summary and exit (CI, piped, tests)
  if (!process.stdin.isTTY) {
    const output = log ?? console.log;
    output(formatDashboardText(data));
    return null;
  }

  // First-wins resolution via promptValue; clearOnResolve repaints a clean
  // terminal before unmount (dashboard occupies the full height).
  const selectedCommand = await promptValue<DashboardCommand | null>(
    (resolve) => (
      <Dashboard onSelect={(command) => resolve(command)} onCancel={() => resolve(null)} />
    ),
    { onExit: null, clearOnResolve: true },
  );

  clearTerminalScreen();

  return selectedCommand;
}

/**
 * Why the dashboard is on screen.
 *
 * `"init"` — the user ran `cc init` in an already-installed directory. That is a request
 * to set this project up, so choosing Edit continues the setup: it must materialise the
 * project even if the wizard changes nothing.
 *
 * `"standalone"` — the bare `cc` dashboard. Edit is just an editor there; a pass with no
 * changes is an inspection and must leave the filesystem untouched.
 */
export type DashboardOrigin = "init" | "standalone";

/** The extra argv a dashboard selection needs to carry its origin into the command. */
function dashboardCommandArgv(command: DashboardCommand, origin: DashboardOrigin): string[] {
  if (command !== "edit" || origin !== "init") return [];
  return [`--${EDIT_PROJECT_SETUP_FLAG}`];
}

/**
 * Shared dashboard entry: when the project is already initialized, shows the
 * dashboard and runs the chosen command. Returns true when the project was
 * initialized (dashboard shown), false otherwise. Never exits the process —
 * callers decide (the init hook exits SUCCESS at its own call site).
 */
export async function runDashboardFlow(
  projectDir: string,
  config: Interfaces.Config,
  origin: DashboardOrigin,
  log?: (message: string) => void,
): Promise<boolean> {
  const installation = await detectInstallation(projectDir);
  if (!installation) return false;

  const selectedCommand = await showDashboard(projectDir, log);
  if (selectedCommand) {
    await config.runCommand(selectedCommand, dashboardCommandArgv(selectedCommand, origin));
  }
  return true;
}

export default class Init extends BaseCommand {
  static summary = `Initialize ${DEFAULT_BRANDING.NAME} in this project`;
  static description =
    "Interactive wizard to set up skills and agents. Supports Plugin Mode (native install) and Eject Mode (copy to .claude/).";

  static examples = [
    {
      description: "Start the setup wizard",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Initialize from a custom marketplace",
      command: "<%= config.bin %> <%= command.id %> --source github:org/marketplace",
    },
    {
      description: "Force refresh skills from remote",
      command: "<%= config.bin %> <%= command.id %> --refresh",
    },
  ];

  static flags = {
    ...BaseCommand.baseFlags,
    refresh: Flags.boolean({
      description: "Force refresh from remote source",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    const projectDir = process.cwd();

    if (await this.showDashboardIfInitialized(projectDir)) return;

    // The blank global config is created by writeProjectConfig() once the
    // wizard succeeds, never before it renders: a cancelled init must leave no
    // artifact that the next run could mistake for an existing installation.
    const isGlobalRoot = isHomeDirectory(projectDir);

    const { unmount, clear: clearSpinner } = render(
      <Spinner label={STATUS_MESSAGES.LOADING_SKILLS} />,
    );
    const [{ sourceResult, startupMessages }, globalConfig] = await Promise.all([
      this.loadSourceOrFail(flags),
      this.loadGlobalConfigIfExists(),
    ]);
    clearSpinner();
    unmount();

    const result = await this.runWizard(
      sourceResult,
      startupMessages,
      projectDir,
      globalConfig,
      isGlobalRoot,
    );
    if (!result) this.exit(EXIT_CODES.CANCELLED);

    if (result.skills.length === 0) {
      this.error("No skills selected", { exit: EXIT_CODES.ERROR });
    }

    await this.handleInstallation(result, sourceResult, flags);
  }

  private async showDashboardIfInitialized(projectDir: string): Promise<boolean> {
    return runDashboardFlow(projectDir, this.config, "init", (msg) => this.log(msg));
  }

  private async loadGlobalConfigIfExists(): Promise<ProjectConfig | null> {
    const globalInstall = await detectGlobalInstallation();
    if (!globalInstall) return null;
    const loaded = await loadProjectConfigFromDir(os.homedir());
    return loaded?.config ?? null;
  }

  private async loadSourceOrFail(flags: {
    source?: string;
    refresh: boolean;
  }): Promise<{ sourceResult: SourceLoadResult; startupMessages: StartupMessage[] }> {
    try {
      const loaded = await loadSource({
        sourceFlag: flags.source,
        projectDir: process.cwd(),
        forceRefresh: flags.refresh,
        captureStartupMessages: true,
      });
      return { sourceResult: loaded.sourceResult, startupMessages: loaded.startupMessages };
    } catch (error) {
      this.error(getErrorMessage(error), {
        exit: EXIT_CODES.ERROR,
      });
    }
  }

  private async runWizard(
    sourceResult: SourceLoadResult,
    startupMessages: StartupMessage[],
    projectDir: string,
    globalConfig: ProjectConfig | null,
    isGlobalRoot: boolean,
  ): Promise<WizardResultV2 | null> {
    return runWizardSession({
      hydrate: {
        initialAgents: globalConfig?.selectedAgents,
        installedSkillIds: globalConfig?.skills?.map((s) => s.id),
        installedSkillConfigs: globalConfig?.skills,
        installedAgentConfigs: globalConfig?.agents,
        isEditingFromGlobalScope: isGlobalRoot,
      },
      props: {
        version: this.config.version,
        logo: ASCII_LOGO,
        initialAgents: globalConfig?.selectedAgents,
        installedSkillIds: globalConfig?.skills?.map((s) => s.id),
        projectDir,
        startupMessages,
      },
      onCancel: () => this.log("Setup cancelled"),
      clearTerminal: () => this.clearTerminal(),
    });
  }

  private async handleInstallation(
    result: WizardResultV2,
    sourceResult: SourceLoadResult,
    flags: SourceRefreshFlags,
  ): Promise<void> {
    const projectDir = process.cwd();
    const activeSkills = result.skills.filter((s) => !s.excluded);
    const installMode = deriveInstallMode(activeSkills);
    const ejectedSkills = activeSkills.filter((s) => s.source === EJECT_SOURCE);
    const pluginSkills = activeSkills.filter((s) => s.source !== EJECT_SOURCE);

    this.logInstallPlan(installMode, ejectedSkills, pluginSkills);

    // Resolve marketplace up front — BEFORE any filesystem mutation. If
    // resolution fails in mixed mode, the hard-error must fire before
    // `copyEjectSkillsStep` copies anything to `.claude/skills/`, otherwise
    // we leave an orphaned half-install with no config.ts to recognise it.
    const resolvedMarketplace =
      pluginSkills.length > 0
        ? await this.requireMarketplaceOrExit(
            sourceResult,
            "install plugin skills",
            (marketplace) => this.log(`Registering marketplace "${marketplace}"...`),
          )
        : null;

    const copyResult =
      installMode === "eject" || installMode === "mixed"
        ? await this.copyEjectSkillsStep(ejectedSkills, projectDir, sourceResult, installMode)
        : null;

    if (resolvedMarketplace !== null) {
      await this.installPluginsStep(pluginSkills, resolvedMarketplace, projectDir);
    }
    // installPluginsStep hard-errors on any failure, so reaching here with a
    // resolved marketplace means plugin mode fully succeeded.
    const pluginModeSucceeded = resolvedMarketplace !== null;

    try {
      const { configResult, compileResult, agentScopeMap } = await this.writeConfigAndCompile(
        result,
        sourceResult,
        flags,
      );
      this.reportSuccess(
        configResult,
        compileResult,
        agentScopeMap,
        installMode,
        pluginModeSucceeded,
        copyResult,
      );

      const permissionWarning = await checkPermissions(projectDir);
      if (permissionWarning) {
        const { waitUntilExit } = render(permissionWarning);
        await waitUntilExit();
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  private logInstallPlan(
    installMode: InstallMode,
    ejectedSkills: WizardResultV2["skills"],
    pluginSkills: WizardResultV2["skills"],
  ): void {
    this.log("\n");
    this.log(`Selected ${ejectedSkills.length + pluginSkills.length} skills`);
    this.log(
      `Install mode: ${
        installMode === "plugin"
          ? `${INSTALL_MODE_LABELS.plugin} (native install)`
          : installMode === "mixed"
            ? `${INSTALL_MODE_LABELS.mixed} (${ejectedSkills.length} eject, ${pluginSkills.length} plugin)`
            : `${INSTALL_MODE_LABELS.eject} (copy to .claude/skills/)`
      }`,
    );
  }

  private async copyEjectSkillsStep(
    localSkills: WizardResultV2["skills"],
    projectDir: string,
    sourceResult: SourceLoadResult,
    installMode: InstallMode,
  ): Promise<SkillCopyResult> {
    this.log("Copying skills to local directory...");
    const copyResult = await copyLocalSkills(localSkills, projectDir, sourceResult);

    if (installMode === "mixed") {
      if (copyResult.projectCopied.length > 0 && copyResult.globalCopied.length > 0) {
        this.log(
          `Copied ${copyResult.totalCopied} local skills (${copyResult.projectCopied.length} project, ${copyResult.globalCopied.length} global)`,
        );
      } else if (copyResult.globalCopied.length > 0) {
        this.log(`Copied ${copyResult.globalCopied.length} local skills to ~/.claude/skills/`);
      } else {
        this.log(`Copied ${copyResult.projectCopied.length} local skills to .claude/skills/`);
      }
    } else {
      this.log(`Copied ${copyResult.totalCopied} skills to .claude/skills/\n`);
    }

    return copyResult;
  }

  private async installPluginsStep(
    pluginSkills: WizardResultV2["skills"],
    marketplace: string,
    projectDir: string,
  ): Promise<void> {
    this.log("Installing skill plugins...");
    const pluginResult = await installPluginSkills(pluginSkills, marketplace, projectDir);

    for (const item of pluginResult.installed) {
      this.log(`  Installed ${item.ref}`);
    }
    for (const item of pluginResult.failed) {
      this.warn(`Failed to install plugin ${item.id}: ${item.error}`);
    }

    // Plugin install intent is inviolable — if any skill failed to install, hard-error
    // BEFORE `writeConfigAndCompile` writes config.ts with orphan entries claiming
    // the skill is installed. Matches the no-plugin-to-eject-fallback rule.
    if (pluginResult.failed.length > 0) {
      this.error(pluginInstallFailureError(pluginResult.failed.length), {
        exit: EXIT_CODES.ERROR,
      });
    }

    this.log(`Installed ${pluginResult.installed.length} skill plugins\n`);
  }

  private async writeConfigAndCompile(
    result: WizardResultV2,
    sourceResult: SourceLoadResult,
    flags: SourceRefreshFlags,
  ): Promise<{
    configResult: Awaited<ReturnType<typeof writeProjectConfig>>;
    compileResult: CompilationResult;
    agentScopeMap: Map<AgentName, SkillScope>;
  }> {
    this.log("Generating configuration...");
    const configResult = await writeProjectConfig({
      wizardResult: result,
      sourceResult,
      projectDir: process.cwd(),
      sourceFlag: flags.source,
    });

    if (configResult.wasMerged) {
      this.log(`Merged with existing config at ${configResult.existingConfigPath}`);
    }

    this.log(`Configuration saved (${configResult.config.agents.length} agents)\n`);

    this.log(STATUS_MESSAGES.COMPILING_AGENTS);
    const cwd = process.cwd();
    const agentDefs = await loadAgentDefs();
    const { allSkills } = await discoverInstalledSkills(cwd);
    const agentScopeMap = buildAgentScopeMap(configResult.config);
    const compileResult = await compileAgentsAllScopes({
      projectDir: cwd,
      sourcePath: agentDefs.sourcePath,
      skills: allSkills,
      agentScopeMap,
    });
    this.log(`Compiled ${compileResult.compiled.length} agents\n`);

    await this.recompilePropagatedProjects(configResult.propagatedProjects);

    return { configResult, compileResult, agentScopeMap };
  }

  /**
   * Recompiles the agents of every OTHER registered project this run's global
   * change was propagated into — see {@link recompilePropagatedProjectAgents}
   * for the staleness rationale and per-project failure isolation.
   */
  private async recompilePropagatedProjects(projectDirs: string[]): Promise<void> {
    if (projectDirs.length === 0) return;

    const { recompiledCount, failedCount, warnings } =
      await recompilePropagatedProjectAgents(projectDirs);
    for (const warning of warnings) {
      this.warn(warning);
    }

    const failureSuffix = failedCount > 0 ? ` (${failedCount} failed)` : "";
    this.log(`Recompiled agents in ${recompiledCount} registered projects${failureSuffix}\n`);
  }

  private reportSuccess(
    configResult: Awaited<ReturnType<typeof writeProjectConfig>>,
    compileResult: CompilationResult,
    agentScopeMap: Map<AgentName, SkillScope>,
    installMode: InstallMode,
    pluginModeSucceeded: boolean,
    copyResult: SkillCopyResult | null,
  ): void {
    this.log(`${SUCCESS_MESSAGES.INIT_SUCCESS}\n`);

    const isEjectOutput =
      installMode === "eject" || (installMode === "mixed" && !pluginModeSucceeded);
    if (isEjectOutput && copyResult && copyResult.totalCopied > 0) {
      this.reportSkillsCopied(copyResult);
    }
    this.reportAgentsCompiled(compileResult.compiled, agentScopeMap);
    this.log("Configuration:");
    this.log(`  ${configResult.configPath}`);
    this.log("");
    this.log("To customize agent-skill assignments:");
    this.log(`  1. Edit ${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`);
    this.log(`  2. Run '${CLI_INVOKE_COMMAND} compile' to regenerate agents`);
    this.log("");
  }

  /**
   * Reports where the skills actually landed. `copyLocalSkills` splits by scope,
   * so a default install driven from a project directory writes every skill
   * under HOME — reporting the project path there names a directory that was
   * never written.
   *
   * This block is a filesystem listing, so the entries are the on-disk directory
   * names — skill ids, not display names. `copySkillsToLocalFlattened` names each
   * destination directory after `skill.id`, so a user can copy any line and `cd`
   * into it.
   */
  private reportSkillsCopied(copyResult: SkillCopyResult): void {
    const cwd = process.cwd();
    const groups = isHomeDirectory(cwd)
      ? [
          {
            dir: resolveInstallPaths(cwd, "project").skillsDir,
            copied: [...copyResult.globalCopied, ...copyResult.projectCopied],
          },
        ]
      : [
          { dir: resolveInstallPaths(cwd, "global").skillsDir, copied: copyResult.globalCopied },
          { dir: resolveInstallPaths(cwd, "project").skillsDir, copied: copyResult.projectCopied },
        ].filter((group) => group.copied.length > 0);

    for (const group of groups) {
      this.log("Skills copied to:");
      this.log(`  ${group.dir}`);
      for (const copied of group.copied) {
        this.log(`    ${copied.skillId}/`);
      }
      this.log("");
    }
  }

  /**
   * Reports where the agents actually landed, mirroring the scope split
   * `compileAgentsAllScopes` performs: one pass at the home root, otherwise a
   * global pass under HOME and a project pass under the project directory.
   */
  private reportAgentsCompiled(
    compiled: AgentName[],
    agentScopeMap: Map<AgentName, SkillScope>,
  ): void {
    const cwd = process.cwd();
    const groups = isHomeDirectory(cwd)
      ? [{ dir: resolveInstallPaths(cwd, "project").agentsDir, agents: compiled }]
      : [
          {
            dir: resolveInstallPaths(cwd, "global").agentsDir,
            agents: compiled.filter((name) => agentScopeMap.get(name) === "global"),
          },
          {
            dir: resolveInstallPaths(cwd, "project").agentsDir,
            agents: compiled.filter((name) => agentScopeMap.get(name) !== "global"),
          },
        ].filter((group) => group.agents.length > 0);

    for (const group of groups) {
      this.log("Agents compiled to:");
      this.log(`  ${group.dir}`);
      for (const agentName of group.agents) {
        this.log(`    ${agentName}.md`);
      }
      this.log("");
    }
  }
}

export type DashboardData = {
  skillCount: number;
  agentCount: number;
  mode: InstallMode;
  source?: string;
};

/**
 * Gathers dashboard data from the installation and project config.
 *
 * Both counts come from the same scope-aware installation so the summary cannot
 * mix a project-only figure with a global one — a default install driven from a
 * project directory puts every skill and agent under HOME.
 */
export async function getDashboardData(projectDir: string): Promise<DashboardData> {
  const [info, loaded] = await Promise.all([getInstallationInfo(), loadProjectConfig(projectDir)]);

  const activeSkills = loaded?.config?.skills?.filter((s) => !s.excluded);
  const skillCount = info?.skillCount ?? 0;
  const agentCount = info?.agentCount ?? 0;
  const mode = info?.mode ?? (activeSkills ? deriveInstallMode(activeSkills) : "eject");
  const source = loaded?.config?.source;

  return { skillCount, agentCount, mode, source };
}
