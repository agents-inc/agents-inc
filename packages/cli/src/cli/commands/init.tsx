import os from "os";
import React from "react";

import { Flags, type Interfaces } from "@oclif/core";
import { Box, Text, useApp } from "ink";
import { render } from "../components/render.js";

import { BaseCommand } from "../base-command.js";
import { type WizardResultV2 } from "../components/wizard/wizard.js";
import { runWizardSession } from "../components/wizard/run-wizard-session.js";
import { useTerminalDimensions } from "../components/hooks/use-terminal-dimensions.js";
import { type SourceLoadResult } from "../lib/loading/index.js";
import {
  loadSource,
  loadAgentDefs,
  copyLocalSkills,
  writeProjectConfig,
  compileAgentsAllScopes,
  type CompilationResult,
  type SkillCopyResult,
  discoverInstalledSkills,
} from "../lib/operations/index.js";
import { fetchSeedConfig } from "../lib/seed/fetch-seed.js";
import { seedToWizardResult, type SeedMapping } from "../lib/seed/seed-to-wizard.js";
import { getInstallationInfo } from "../lib/plugins/plugin-info.js";
import {
  loadProjectConfig,
  loadProjectConfigFromDir,
} from "../lib/configuration/project-config.js";
import { activeAgentNames } from "../lib/configuration/scope-predicates.js";
import {
  type InstallMode,
  detectInstallation,
  detectGlobalInstallation,
  detectProjectInstallation,
  deriveInstallMode,
  resolveInstallPaths,
  buildAgentScopeMap,
  isHomeDirectory,
  INSTALL_MODE_LABELS,
  INSTALL_MODE_DESCRIPTIONS,
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
import type { AgentName, MergedSkillsMatrix, ProjectConfig, SkillScope } from "../types/index.js";
import { type StartupMessage } from "../utils/logger.js";
import {
  SUCCESS_MESSAGES,
  STATUS_MESSAGES,
  sharedConfigExistingInstall,
  sharedConfigGlobalInstall,
} from "../utils/messages.js";
import type { SeedPayload } from "@workspace/matrix/seed";

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

/**
 * What `init` decided to install, and the little each producer knows that the shared spine does
 * not. Keeping these on the value rather than branching on a flag downstream is what stops the
 * two paths growing separate copies of the install sequence.
 */
/**
 * The source this run was pointed at, as oclif hands it over.
 *
 * `source` is a required key holding `string | undefined` rather than `source?: string`
 * because that is what oclif produces: a non-required flag still gets its key written on
 * the parse result, set to `undefined` when it was not passed. Under
 * `exactOptionalPropertyTypes` the two are different types, and `?` would be describing a
 * producer that never omits the key.
 */
type SourceFlags = { source: string | undefined };

type Selection = {
  result: WizardResultV2;
  sourceResult: SourceLoadResult;
  /** Whether a person is at the terminal, so the permission notice may wait for them. */
  interactive: boolean;
  /** What to say if the selection turns out to be empty — only the producer knows why it is. */
  emptyMessage: string;
};

/**
 * Whether a decoded selection would write anything into the user's own ~/.claude. Skills and
 * sub-agents are asked separately because either can be globally scoped on its own: a shared
 * configuration can pin every skill to the project and still send a sub-agent home, and the
 * reverse.
 */
function writesGlobalContent(result: WizardResultV2): boolean {
  return (
    result.skills.some((skill) => skill.scope === "global") ||
    result.agentConfigs.some((agent) => agent.scope === "global")
  );
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
  ];

  static flags = {
    source: Flags.string({
      char: "s",
      description: "Skills source path or URL",
      required: false,
    }),
    from: Flags.string({
      description: "Install a configuration shared from agentsinc.sh by its id, without the wizard",
      helpValue: "<id>",
    }),
  };

  /**
   * One spine, two producers. The wizard and a shared id differ only in *where the selection
   * comes from* — everything after it (the empty guard, the install pipeline) is identical, so it
   * lives here once rather than being written twice and drifting.
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    const projectDir = process.cwd();

    // Every route below reads the configs first — to show a dashboard, to refuse a shared id, or
    // to inline the global one. One that exists but cannot be read is recreated, not installed
    // over, and saying so here is what keeps the raw loader error off the screen.
    await this.ensureConfigReadable(projectDir);

    // Only a bare `init` is diverted to the dashboard. An id is an explicit instruction to install
    // *that* configuration, so it overrides an existing installation instead.
    if (!flags.from && (await this.showDashboardIfInitialized(projectDir))) return;

    const selection = flags.from
      ? await this.selectionFromSharedConfig(flags.from, flags, projectDir)
      : await this.selectionFromWizard(flags, projectDir);

    if (!selection) this.exit(EXIT_CODES.CANCELLED);

    // On the spine rather than in either producer: a broken constraint is a fact about the
    // selection, not about where it came from, and `edit` reports the same fact the same way
    // the moment the wizard hands it one. Both producers run the same validator over the same
    // matrix — the wizard over what was chosen, `--from` over what survived the decode — so
    // what is said here is this catalog's verdict either way.
    this.reportValidationErrors(selection.result.validation);

    // A sub-agent is installable on its own — it has front-matter, a prompt and a compiled file
    // without owning a single skill — so only a selection with neither is nothing to install.
    if (selection.result.skills.length === 0 && selection.result.selectedAgents.length === 0) {
      // The producer supplies the wording because only it knows why empty means what it means:
      // nothing chosen, versus a payload this catalog cannot install.
      this.error(selection.emptyMessage, { exit: EXIT_CODES.ERROR });
    }

    await this.handleInstallation(
      selection.result,
      selection.sourceResult,
      flags,
      selection.interactive,
    );
  }

  /** The interactive producer: load the source, run the wizard, return what was chosen. */
  private async selectionFromWizard(
    flags: SourceFlags,
    projectDir: string,
  ): Promise<Selection | null> {
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
    if (!result) return null;

    return {
      result,
      sourceResult,
      // A person is already at the terminal, so the permission notice can wait for them.
      interactive: true,
      emptyMessage: "No skills selected",
    };
  }

  /**
   * The `--from <id>` producer: fetch and map, no wizard. Nothing here may assume a TTY — running
   * headless is most of why the flag exists.
   *
   * It is also greenfield-only, which is what the two refusals are: a shared configuration is
   * installed whole, so anything it would have to install over has to be uninstalled first.
   */
  private async selectionFromSharedConfig(
    id: string,
    flags: SourceFlags,
    projectDir: string,
  ): Promise<Selection> {
    await this.refuseInstalledProject(projectDir);

    this.log(`Fetching configuration ${id}...`);
    const fetched = await fetchSeedConfig(id);
    if (!fetched.ok) {
      this.error(fetched.error, { exit: EXIT_CODES.ERROR });
    }

    const { sourceResult } = await this.loadSourceOrFail(flags);
    const { result, skippedSkillIds, skippedAgentNames } = this.decodeSeedOrFail(
      fetched.payload,
      sourceResult.matrix,
    );

    await this.refuseBlockingGlobalInstall(result);

    // Named, not counted. "3 skills were skipped" cannot be acted on; the ids can, and this is the
    // one moment the user can tell whether what they shared is what they are getting.
    if (skippedSkillIds.length > 0) {
      this.warn(
        `Skipped ${skippedSkillIds.length} skill(s) this catalog does not know: ${skippedSkillIds.join(", ")}`,
      );
    }
    if (skippedAgentNames.length > 0) {
      this.warn(
        `Skipped ${skippedAgentNames.length} unknown sub-agent(s): ${skippedAgentNames.join(", ")}`,
      );
    }

    if (result.skills.length > 0) {
      this.log(
        `Installing ${result.skills.length} skill(s) across ${result.selectedAgents.length} sub-agent(s)\n`,
      );
    }

    return {
      result,
      sourceResult,
      interactive: false,
      emptyMessage: `Configuration '${id}' contains no skills this catalog can install.`,
    };
  }

  /**
   * Refuses to install a shared configuration into a directory that already has one.
   *
   * Project-scoped detection rather than `detectInstallation`, whose global fallback would refuse
   * every clean project on a machine with a global install — including for a payload that never
   * goes near it. Whether a global install is in the way is a question about the PAYLOAD, and
   * {@link refuseBlockingGlobalInstall} is where it is asked.
   *
   * This runs before the fetch: there is nothing to learn from the network about a directory that
   * is already spoken for.
   */
  private async refuseInstalledProject(projectDir: string): Promise<void> {
    const installation = await detectProjectInstallation(projectDir);
    if (!installation) return;

    this.error(sharedConfigExistingInstall(installation.configPath), { exit: EXIT_CODES.ERROR });
  }

  /**
   * The other half of the same rule. A payload carrying global-scoped skills or sub-agents writes
   * into the user's own ~/.claude, so an installation there is in its way even when this project
   * is spotless. A payload with nothing global cannot reach that far and is never refused for it.
   */
  private async refuseBlockingGlobalInstall(result: WizardResultV2): Promise<void> {
    if (!writesGlobalContent(result)) return;

    const globalInstallation = await detectGlobalInstallation();
    if (!globalInstallation) return;

    this.error(sharedConfigGlobalInstall(globalInstallation.configPath), {
      exit: EXIT_CODES.ERROR,
    });
  }

  /**
   * The decode refuses a payload the config model has nowhere to write (see `seedToWizardResult`).
   * That is a failure of this command, reported with this command's exit code rather than left to
   * surface as an unhandled throw.
   */
  private decodeSeedOrFail(payload: SeedPayload, matrix: MergedSkillsMatrix): SeedMapping {
    try {
      return seedToWizardResult(payload, matrix);
    } catch (error) {
      this.handleError(error);
    }
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

  private async loadSourceOrFail(
    flags: SourceFlags,
  ): Promise<{ sourceResult: SourceLoadResult; startupMessages: StartupMessage[] }> {
    try {
      const loaded = await loadSource({
        // The one load that may CHOOSE a source rather than read the stored one.
        caller: "init",
        ...(flags.source !== undefined && { sourceFlag: flags.source }),
        projectDir: process.cwd(),
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
    const selectedAgents = globalConfig?.agents && activeAgentNames(globalConfig.agents);
    const globalSkills = globalConfig?.skills;

    return runWizardSession({
      hydrate: {
        ...(selectedAgents !== undefined && { initialAgents: selectedAgents }),
        ...(globalSkills !== undefined && {
          installedSkillIds: globalSkills.map((s) => s.id),
          installedSkillConfigs: globalSkills,
        }),
        ...(globalConfig?.agents !== undefined && { installedAgentConfigs: globalConfig.agents }),
        isEditingFromGlobalScope: isGlobalRoot,
      },
      props: {
        version: this.config.version,
        logo: ASCII_LOGO,
        initialAgents: selectedAgents,
        installedSkillIds: globalConfig?.skills.map((s) => s.id),
        startupMessages,
      },
      onCancel: () => this.log("Setup cancelled"),
      clearTerminal: () => this.clearTerminal(),
    });
  }

  private async handleInstallation(
    result: WizardResultV2,
    sourceResult: SourceLoadResult,
    flags: SourceFlags,
    /**
     * Whether the caller can hold the terminal. The permission notice is an Ink app with no exit
     * of its own, so `waitUntilExit()` only ever resolves because a person is there to end it —
     * which is fine after the wizard and a hang everywhere else. `--from` sets this false: it has
     * to complete over a pipe and in CI.
     */
    interactive = true,
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
      await this.installPluginSkillsReported(pluginSkills, resolvedMarketplace, projectDir);
    }
    // The shared install reporter hard-errors on any failure, so reaching here with
    // a resolved marketplace means plugin mode fully succeeded.
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

      await this.showPermissionNotice(projectDir, interactive);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * The permission notice, where there is one to show. It is an Ink app with no exit of its own,
   * so `waitUntilExit()` only ever resolves because a person is there to end it — which is fine
   * after the wizard and a hang everywhere else. Without a terminal to hold, one frame is
   * rendered and let go: the notice is information, not a prompt, so there is nothing to answer
   * and nothing to wait for.
   */
  private async showPermissionNotice(projectDir: string, interactive: boolean): Promise<void> {
    const permissionWarning = await checkPermissions(projectDir);
    if (!permissionWarning) return;

    if (!interactive) {
      const { unmount } = render(permissionWarning);
      unmount();
      return;
    }

    const { waitUntilExit } = render(permissionWarning);
    await waitUntilExit();
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
        installMode === "mixed"
          ? `${INSTALL_MODE_LABELS.mixed} (${ejectedSkills.length} eject, ${pluginSkills.length} plugin)`
          : INSTALL_MODE_DESCRIPTIONS[installMode]
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

  private async writeConfigAndCompile(
    result: WizardResultV2,
    sourceResult: SourceLoadResult,
    flags: SourceFlags,
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
      ...(flags.source !== undefined && { sourceFlag: flags.source }),
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

    this.reportPropagatedRecompile(configResult.propagation);

    return { configResult, compileResult, agentScopeMap };
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

  const activeSkills = loaded?.config.skills.filter((s) => !s.excluded);
  const skillCount = info?.skillCount ?? 0;
  const agentCount = info?.agentCount ?? 0;
  const mode = info?.mode ?? (activeSkills ? deriveInstallMode(activeSkills) : "eject");
  const source = loaded?.config.source;

  return { skillCount, agentCount, mode, ...(source !== undefined && { source }) };
}
