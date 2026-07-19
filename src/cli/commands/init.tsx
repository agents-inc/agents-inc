import os from "os";
import React from "react";

import { Flags } from "@oclif/core";
import { render, Box, Text, useApp } from "ink";

import { BaseCommand } from "../base-command.js";
import { type WizardResultV2 } from "../components/wizard/wizard.js";
import { runWizardSession } from "../components/wizard/run-wizard-session.js";
import { useTerminalDimensions } from "../components/hooks/use-terminal-dimensions.js";
import { type SourceLoadResult } from "../lib/loading/index.js";
import {
  loadSource,
  loadAgentDefs,
  copyLocalSkills,
  requireMarketplace,
  installPluginSkills,
  pluginInstallFailureError,
  writeProjectConfig,
  compileAgentsAllScopes,
  type CompilationResult,
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
  EJECT_SOURCE,
} from "../consts.js";
import { SelectList, type SelectListItem } from "../components/common/select-list.js";
import { Spinner } from "../components/common/spinner.js";
import { getErrorMessage } from "../utils/errors.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { getSkillById } from "../lib/matrix/matrix-provider";
import type { ProjectConfig } from "../types/index.js";
import { type StartupMessage } from "../utils/logger.js";
import { SUCCESS_MESSAGES, STATUS_MESSAGES } from "../utils/messages.js";
import { ensureBlankGlobalConfig } from "../lib/configuration/config-writer.js";

const DASHBOARD_OPTIONS: SelectListItem<string>[] = [
  { label: "Edit", value: "edit" },
  { label: "Compile", value: "compile" },
  { label: "Doctor", value: "doctor" },
  { label: "List", value: "list" },
];

type DashboardProps = {
  onSelect: (command: string) => void;
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
): Promise<string | null> {
  const data = await getDashboardData(projectDir);

  // Non-interactive: print text summary and exit (CI, piped, tests)
  if (!process.stdin.isTTY) {
    const output = log ?? console.log;
    output(formatDashboardText(data));
    return null;
  }

  // First-wins resolution from the component callbacks, unmounting at the
  // resolution site (promptConfirm model) — never read closure-mutated flags
  // after waitUntilExit.
  const selectedCommand = await new Promise<string | null>((resolve) => {
    const instance = render(
      <Dashboard
        onSelect={(command) => {
          instance.clear();
          instance.unmount();
          resolve(command);
        }}
        onCancel={() => {
          instance.clear();
          instance.unmount();
          resolve(null);
        }}
      />,
    );
    // App exit without a callback (e.g. Ctrl+C) or a render failure counts as
    // a cancel; resolve is first-wins, so a prior selection is unaffected.
    instance.waitUntilExit().then(
      () => resolve(null),
      () => resolve(null),
    );
  });

  process.stdout.write("\x1b[H\x1b[2J\x1b[3J");

  return selectedCommand;
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

    const isGlobalRoot = isHomeDirectory(projectDir);
    await this.ensureGlobalConfig(isGlobalRoot);

    const { unmount, clear: clearSpinner } = render(<Spinner label="Loading skills..." />);
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
    const existingInstallation = await detectInstallation(projectDir);
    if (!existingInstallation) return false;

    const selectedCommand = await showDashboard(projectDir, (msg) => this.log(msg));
    if (selectedCommand) {
      await this.config.runCommand(selectedCommand);
    }
    return true;
  }

  private async ensureGlobalConfig(isGlobalRoot: boolean): Promise<void> {
    // Auto-create blank global config on first init from a project directory.
    // This ensures the project config can always import from global.
    if (!isGlobalRoot) {
      const created = await ensureBlankGlobalConfig();
      if (created) {
        this.log("Created blank global config at ~/" + CLAUDE_SRC_DIR);
      }
    }
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
    flags: { source?: string; refresh: boolean },
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
        ? await this.requireMarketplaceOrExit(sourceResult, "install plugin skills")
        : null;

    if (installMode === "eject" || installMode === "mixed") {
      await this.copyEjectSkillsStep(ejectedSkills, projectDir, sourceResult, installMode);
    }

    if (resolvedMarketplace !== null) {
      await this.installPluginsStep(pluginSkills, resolvedMarketplace, projectDir);
    }
    // installPluginsStep hard-errors on any failure, so reaching here with a
    // resolved marketplace means plugin mode fully succeeded.
    const pluginModeSucceeded = resolvedMarketplace !== null;

    try {
      const { configResult, compileResult, projectPaths } = await this.writeConfigAndCompile(
        result,
        sourceResult,
        flags,
        installMode,
      );
      this.reportSuccess(
        configResult,
        compileResult,
        projectPaths,
        installMode,
        pluginModeSucceeded,
        ejectedSkills,
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
  ): Promise<void> {
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

  /**
   * Lazily resolves the marketplace for plugin operations and hard-errors when
   * resolution fails. Plugin install intent is inviolable — we never silently
   * fall back to eject or skip. Call BEFORE any filesystem mutation so that a
   * failure leaves no partial state on disk.
   */
  private async requireMarketplaceOrExit(
    sourceResult: SourceLoadResult,
    purpose: string,
  ): Promise<string> {
    const required = await requireMarketplace(sourceResult, purpose);
    if (!required.ok) {
      this.error(required.error, { exit: EXIT_CODES.ERROR });
    }
    if (required.registered) {
      this.log(`Registering marketplace "${required.marketplace}"...`);
    }
    return required.marketplace;
  }

  private async writeConfigAndCompile(
    result: WizardResultV2,
    sourceResult: SourceLoadResult,
    flags: { source?: string; refresh: boolean },
    installMode: InstallMode,
  ): Promise<{
    configResult: Awaited<ReturnType<typeof writeProjectConfig>>;
    compileResult: CompilationResult;
    projectPaths: ReturnType<typeof resolveInstallPaths>;
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
    const projectPaths = resolveInstallPaths(cwd, "project");
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

    return { configResult, compileResult, projectPaths };
  }

  private reportSuccess(
    configResult: Awaited<ReturnType<typeof writeProjectConfig>>,
    compileResult: CompilationResult,
    projectPaths: ReturnType<typeof resolveInstallPaths>,
    installMode: InstallMode,
    pluginModeSucceeded: boolean,
    copiedSkills: WizardResultV2["skills"],
  ): void {
    this.log(`${SUCCESS_MESSAGES.INIT_SUCCESS}\n`);

    const isEjectOutput =
      installMode === "eject" || (installMode === "mixed" && !pluginModeSucceeded);
    if (isEjectOutput && copiedSkills.length > 0) {
      this.log("Skills copied to:");
      this.log(`  ${projectPaths.skillsDir}`);
      for (const skill of copiedSkills) {
        const displayName = getSkillById(skill.id).displayName;
        this.log(`    ${displayName}/`);
      }
      this.log("");
    }
    this.log("Agents compiled to:");
    this.log(`  ${projectPaths.agentsDir}`);
    for (const agentName of compileResult.compiled) {
      this.log(`    ${agentName}.md`);
    }
    this.log("");
    this.log("Configuration:");
    this.log(`  ${configResult.configPath}`);
    this.log("");
    this.log("To customize agent-skill assignments:");
    this.log(`  1. Edit .claude-src/config.ts`);
    this.log(`  2. Run '${CLI_INVOKE_COMMAND} compile' to regenerate agents`);
    this.log("");
  }
}

export type DashboardData = {
  skillCount: number;
  agentCount: number;
  mode: InstallMode;
  source?: string;
};

/** Gathers dashboard data from the installation and project config. */
export async function getDashboardData(projectDir: string): Promise<DashboardData> {
  const [info, loaded] = await Promise.all([getInstallationInfo(), loadProjectConfig(projectDir)]);

  const activeSkills = loaded?.config?.skills?.filter((s) => !s.excluded);
  const skillCount = activeSkills?.length ?? 0;
  const agentCount = info?.agentCount ?? 0;
  const mode = info?.mode ?? (activeSkills ? deriveInstallMode(activeSkills) : "eject");
  const source = loaded?.config?.source;

  return { skillCount, agentCount, mode, source };
}
