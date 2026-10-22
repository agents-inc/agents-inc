import os from "os";
import React from "react";

import { Flags, type Interfaces } from "@oclif/core";
import { Box, Text, useApp } from "ink";
import { partition } from "remeda";
import { render } from "../components/render.js";

import { BaseCommand } from "../base-command.js";
import type { InstallSelection } from "@workspace/compile/seed-to-config";
import { useTerminalDimensions } from "../components/hooks/use-terminal-dimensions.js";
import { type SourceLoadResult } from "../lib/loading/index.js";
import {
  loadSource,
  sayCapturedWarnings,
  loadAgentDefs,
  copyLocalSkills,
  writeProjectConfig,
  compileAgentsAllScopes,
  compileProjectScope,
  type CompilationResult,
  type ConfigWriteResult,
  type SkillCopyResult,
  discoverInstalledSkills,
} from "../lib/operations/index.js";
import { movedGlobalAgentInputs, type GateReport } from "../lib/config-gate/index.js";
import { fetchSeedConfig } from "../lib/seed/fetch-seed.js";
import {
  registerExternalSkills,
  writeExternalSkills,
  type ExternalSkillInstall,
} from "../lib/seed/external-skills.js";
import { seedToInstallSelection, type SeedMapping } from "../lib/seed/seed-to-selection.js";
import {
  holdInstalledGlobal,
  installsAtHome,
  joinedStatement,
  notInstalledGlobally,
  readInstalledGlobal,
  type HeldGlobal,
  type InstalledGlobal,
} from "../lib/seed/seed-apply.js";
import { agentChangesAmong, type AgentChange } from "../lib/configuration/scope-diff.js";
import { isActiveAt } from "../lib/configuration/scope-predicates.js";
import { summaryPanelBlock, type SummaryPanelProps } from "../components/common/summary-panel.js";
import {
  getInstallationsByProvider,
  type ProviderInstallation,
} from "../lib/plugins/plugin-info.js";
import {
  assertNamedSourceUsable,
  isLocalSource,
  resolveBranding,
} from "../lib/configuration/config.js";
import {
  type InstallMode,
  detectInstallation,
  detectProjectInstallation,
  deriveInstallMode,
  holdsItsOwnInstallation,
  installBaseDir,
  resolveInstallPaths,
  buildAgentScopeMap,
  isHomeDirectory,
  INSTALL_MODE_LABELS,
  INSTALL_MODE_DESCRIPTIONS,
} from "../lib/installation/index.js";
import { hostAt } from "../lib/hosts/host-for.js";
import {
  agentCodec,
  chooseProviderForThisRun,
  providerInUse,
  relativeConfigPath,
} from "../lib/installation/install-layout.js";
import { providerToNameAt } from "../lib/installation/provider-to-name.js";
import { hostCompileNotices } from "../lib/hosts/host-compile-notices.js";
import {
  installationToName,
  providerFlag,
  providerNamedBy,
  providerNeedsAConfigurationToInstall,
} from "../lib/installation/provider-flag.js";
import { checkPermissions } from "../lib/permission-checker.js";
import {
  ASCII_LOGO,
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  EDITOR_ADDRESS,
  EDITOR_URL,
  EJECT_SOURCE,
  editorConfigUrl,
  type Provider,
} from "../consts.js";
import { clearTerminalScreen } from "../utils/terminal.js";
import { SelectList, type SelectListItem } from "../components/common/select-list.js";
import { promptConfirm, promptValue } from "../components/common/prompt-confirm.js";
import { Confirm } from "../components/common/confirm.js";
import { getErrorMessage } from "../utils/errors.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { openUrl } from "../utils/open-url.js";
import { plural } from "../utils/string.js";
import type {
  AgentName,
  AgentScopeConfig,
  MergedSkillsMatrix,
  SkillConfig,
  SkillId,
  SkillScope,
} from "../types/index.js";
import { type StartupMessage } from "../utils/logger.js";
import {
  ERROR_MESSAGES,
  INCOMPLETE_WORK_RECOVERY,
  SHARED_CONFIG_ARRIVALS,
  STATUS_MESSAGES,
  addMarketplaceInTheEditor,
  agentsNotCompiled,
  applySharedConfigHere,
  carriedSkillsWritten,
  globalScopedAgentsHint,
  initSucceeded,
  keptAsInstalledGlobally,
  sharedConfigExistingInstall,
  subAgentChanged,
} from "../utils/messages.js";
import type { SeedPayload } from "@workspace/matrix/seed";

const DASHBOARD_OPTIONS = [
  { label: "Edit in the web editor", value: "edit" },
  { label: "Compile", value: "compile" },
  { label: "Doctor", value: "doctor" },
  { label: "List", value: "list" },
] as const satisfies readonly SelectListItem<string>[];

const DASHBOARD_OPTIONS_LINE = `  ${DASHBOARD_OPTIONS.map(({ label }) => `[${label}]`).join("  ")}`;

type DashboardCommand = (typeof DASHBOARD_OPTIONS)[number]["value"];

/** A white-labelled name replaces the logo, because the logo spells the shipped name. */
const DashboardTitle: React.FC<{ name: string }> = ({ name }) =>
  name === DEFAULT_BRANDING.NAME ? <Text>{ASCII_LOGO}</Text> : <Text bold>{name}</Text>;

type DashboardProps = {
  data: DashboardData;
  onSelect: (command: DashboardCommand) => void;
  onCancel: () => void;
};

export const Dashboard: React.FC<DashboardProps> = ({ data, onSelect, onCancel }) => {
  const { exit } = useApp();
  const { rows: terminalHeight } = useTerminalDimensions();

  return (
    <Box flexDirection="column" height={terminalHeight}>
      <Box marginBottom={1}>
        <DashboardTitle name={data.name} />
      </Box>
      <Box marginBottom={1}>
        <Text>{dashboardCountLines(data).join("\n")}</Text>
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

/**
 * Shared by the TTY and piped dashboards so the two cannot drift apart. A scope holding two
 * installations gets a named block for each, a blank line apart.
 */
function dashboardCountLines({ installations }: DashboardData): string[] {
  const named = installations.length > 1;
  const blocks = installations.map((installation) => [
    ...(named ? [`  Provider:     ${installation.provider}`] : []),
    ...installationCountLines(installation),
  ]);
  return blankLineBetween(blocks);
}

function blankLineBetween(blocks: string[][]): string[] {
  return blocks.flatMap((block, index) => (index === 0 ? block : ["", ...block]));
}

function installationCountLines(installation: ProviderInstallation): string[] {
  return [
    `  Skills:       ${installation.skillCount} installed`,
    `  Agents:       ${installation.agentCount} compiled`,
    `  Mode:         ${INSTALL_MODE_LABELS[installation.mode]}`,
    ...(installation.marketplace ? [`  Marketplace:  ${installation.marketplace}`] : []),
  ];
}

export function formatDashboardText(data: DashboardData): string {
  return [data.name, "", ...dashboardCountLines(data), "", DASHBOARD_OPTIONS_LINE].join("\n");
}

/** Ctrl+C cancels the run; Escape (null) only leaves the dashboard. */
const DASHBOARD_INTERRUPTED = "interrupted";

type DashboardAnswer = DashboardCommand | typeof DASHBOARD_INTERRUPTED | null;

async function showDashboard(
  projectDir: string,
  log?: (message: string) => void,
): Promise<DashboardAnswer> {
  const data = await getDashboardData(projectDir);

  if (!process.stdin.isTTY) {
    const output = log ?? console.log;
    output(formatDashboardText(data));
    return null;
  }

  // clearOnResolve repaints a clean terminal before unmount: the dashboard fills the height.
  const selectedCommand = await promptValue<DashboardAnswer>(
    (resolve) => (
      <Dashboard
        data={data}
        onSelect={(command) => resolve(command)}
        onCancel={() => resolve(null)}
      />
    ),
    { onExit: DASHBOARD_INTERRUPTED, clearOnResolve: true },
  );

  clearTerminalScreen();

  return selectedCommand;
}

function dashboardCommandArgv(command: DashboardCommand): string[] {
  return command === "edit" ? ["--ui"] : [];
}

export type DashboardFlow = "not-installed" | "shown" | "cancelled";

/** Never exits the process: callers decide from the {@link DashboardFlow} it answers. */
export async function runDashboardFlow(
  projectDir: string,
  config: Interfaces.Config,
  log?: (message: string) => void,
): Promise<DashboardFlow> {
  const installation = await detectInstallation(projectDir);
  if (!installation) return "not-installed";

  const selectedCommand = await showDashboard(projectDir, log);
  if (selectedCommand === DASHBOARD_INTERRUPTED) return "cancelled";
  if (selectedCommand) {
    await config.runCommand(selectedCommand, dashboardCommandArgv(selectedCommand));
  }
  return "shown";
}

/** A required key, not `?`: oclif writes the key as `undefined` when the flag is not passed. */
type SourceFlags = { marketplace: string | undefined };

type Selection = {
  result: InstallSelection;
  sourceResult: SourceLoadResult;
  /** Where the selection was actually loaded from; a shared id may name a marketplace. */
  sourceFlags: SourceFlags;
  /** A global install's own skills, recorded as they are and never installed over. */
  installedAlready: ReadonlySet<SkillId>;
};

/** The payload names the marketplace because a skill id never says where its repository lives. */
function sharedConfigSourceFlags(flags: SourceFlags, payload: SeedPayload): SourceFlags {
  return { marketplace: flags.marketplace ?? payload.marketplace };
}

export default class Init extends BaseCommand {
  /** Resolved once in {@link install}; the closing line is printed several calls below. */
  private brandingName: string = DEFAULT_BRANDING.NAME;

  static summary = `Initialize ${DEFAULT_BRANDING.NAME} in this project`;
  static description = `Build a configuration in ${EDITOR_ADDRESS}, or install one by id with --from. Over an existing installation, shows its dashboard.`;

  static examples = [
    {
      description: "Open the editor to build a configuration",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Install a configuration built in the editor",
      command: "<%= config.bin %> <%= command.id %> --from <id>",
    },
    {
      description: "Test local marketplace changes against a configuration built in the editor",
      command: "<%= config.bin %> <%= command.id %> --from <id> --marketplace ./my-marketplace",
    },
  ];

  static flags = {
    marketplace: Flags.string({
      char: "m",
      description:
        "With --from, install from this marketplace instead of the one the configuration names. Without --from, open the editor and say how to add it there",
      required: false,
    }),
    from: Flags.string({
      description: "Install a configuration shared from agentsinc.sh by its id",
      helpValue: "<id>",
    }),
    ui: Flags.boolean({
      description: `Open ${EDITOR_ADDRESS} on the id --from names, or on the catalogue — what a bare init does where nothing is installed`,
      default: false,
    }),
    provider: providerFlag(),
  };

  /** The exit code is decided once, after every path through {@link install} has ended. */
  async run(): Promise<void> {
    await this.install();
    this.exitIfWorkIncomplete();
  }

  /** The link is printed before it is opened, so it still works where no browser can open. */
  private async openEditor(
    projectDir: string,
    provider: Provider | undefined,
    id?: string,
    marketplace?: string,
  ): Promise<void> {
    const url = id === undefined ? EDITOR_URL : editorConfigUrl(id);
    // Above the first line, so a ref the install route would refuse is refused before any output.
    const marketplaceLine =
      marketplace === undefined ? undefined : this.addMarketplaceLineOrFail(marketplace);

    const installedHere = await holdsItsOwnInstallation(projectDir);
    const toName = installedHere ? await installationToName(projectDir, provider) : provider;

    this.log(id === undefined ? `Build it at ${url}` : `Open it at ${url}`);
    if (marketplaceLine !== undefined) this.log(marketplaceLine);
    this.log(applySharedConfigHere(id, installedHere, toName));

    if (!process.stdin.isTTY) return;

    const opened = await openUrl(url);
    if (!opened.ok) this.warn(opened.error);
  }

  private async install(): Promise<void> {
    const { flags } = await this.parse(Init);
    const projectDir = process.cwd();

    // First, so a refused `--provider` leaves the filesystem untouched at both scopes.
    this.settleTheProviderForThisRun(flags);

    // Before `ensureConfigReadable`: a broken config must not block the editor route.
    if (opensTheEditor(flags)) {
      return this.openEditor(
        projectDir,
        providerNamedBy(flags.provider),
        flags.from,
        flags.marketplace,
      );
    }

    // ABORT: an unreadable config is refused here, before any route reads it.
    await this.ensureConfigReadable(projectDir);

    if (flags.from === undefined) return this.showDashboardOrOpenEditor(projectDir);

    // Its degrade arm cannot fire: `ensureConfigReadable` already refused every unreadable config.
    this.brandingName = await this.resolveBrandingName(projectDir);

    const selection = await this.selectionFromSharedConfig(flags.from, flags, projectDir);
    if (!selection) this.exit(EXIT_CODES.CANCELLED);

    this.reportValidationErrors(selection.result.validation);

    await this.handleInstallation(selection, projectDir);
  }

  private async showDashboardOrOpenEditor(projectDir: string): Promise<void> {
    const dashboard = await runDashboardFlow(projectDir, this.config, (msg) => this.log(msg));
    if (dashboard === "cancelled") this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });
    if (dashboard === "not-installed") await this.openEditor(projectDir, undefined);
  }

  /** Refused as the install route refuses it, since the line echoes the ref it was given. */
  private addMarketplaceLineOrFail(ref: string): string {
    try {
      assertNamedSourceUsable(ref);
      return addMarketplaceInTheEditor(ref, isLocalSource(ref));
    } catch (error) {
      this.handleError(error);
    }
  }

  /** `--provider` only picks which folder an install creates, so it needs `--from`. */
  private settleTheProviderForThisRun(flags: Interfaces.InferredFlags<typeof Init.flags>): void {
    const named = providerNamedBy(flags.provider);
    if (named === undefined) return;

    if (flags.from === undefined) {
      this.error(providerNeedsAConfigurationToInstall(), { exit: EXIT_CODES.INVALID_ARGS });
    }

    chooseProviderForThisRun(named);
  }

  /** Every refusal fires before anything is written. */
  private async selectionFromSharedConfig(
    id: string,
    flags: SourceFlags,
    projectDir: string,
  ): Promise<Selection | null> {
    await this.refuseInstalledProject(projectDir, id);

    const payload = await this.fetchSharedConfigOrFail(id);
    const sourceFlags = sharedConfigSourceFlags(flags, payload);
    const { sourceResult, startupMessages } = await this.loadSourceOrFail(sourceFlags, projectDir);
    // Before the decode, which would otherwise skip carried skills as unknown ids.
    const carriedSkills = this.registerExternalSkillsOrFail(
      payload,
      sourceResult.matrix,
      projectDir,
    );
    const mapping = this.decodeSeedOrFail(payload, sourceResult.matrix);
    const { result } = mapping;

    // Nothing is installed here: `refuseInstalledProject` has already refused a home that holds one.
    this.refuseProjectScopedContentAtHome(result, projectDir, false);

    const installedGlobal = await installedGlobalToHold(projectDir);
    const held = holdInstalledGlobal(result, installedGlobal);
    const arrivingCarried = notInstalledGlobally(carriedSkills, held);

    // Above the lists: a yes installs what was listed, so nothing listed may then be refused.
    await this.refuseSharedConfigBeforeAsking(
      held.result,
      arrivingCarried,
      projectDir,
      sourceResult,
    );

    // Above the skips: an "unknown" skill is often one whose file failed to parse.
    sayCapturedWarnings(startupMessages);
    this.warnOfSkippedEntries(mapping);
    this.refuseAnEmptySelection(held.result, id);

    const stackName = await this.stackNameOf(result.selectedStackId, sourceResult);
    this.logWhatGoesWhere(held, installedGlobal, stackName, {
      id: installsAtHome(result) ? id : undefined,
      provider: providerToNameAt(os.homedir(), providerInUse(projectDir)),
    });
    if (process.stdin.isTTY && !(await this.confirmInstall())) {
      this.log("Setup cancelled");
      return null;
    }

    // After the question, so a refusal or a no leaves nothing written.
    await this.writeCarriedSkills(arrivingCarried);
    this.announceArrivingSkills(held, result.selectedAgents.length);

    return {
      result: held.result,
      sourceResult,
      sourceFlags,
      installedAlready: new Set(held.installed.skillIds),
    };
  }

  /**
   * The panel where the question is asked, or where it would be: the project against the whole
   * global install it inherits. `runFromHome.id` is the id only where home would take it.
   */
  private logWhatGoesWhere(
    held: HeldGlobal,
    installedGlobal: InstalledGlobal | null,
    stackName: string | undefined,
    runFromHome: RunFromHome,
  ): void {
    const joined = joinedGlobalAgents(held, installedGlobal);
    const lines = summaryPanelBlock(
      installPanel(held, installedGlobal, joined, stackName),
      joined.map(subAgentChanged),
      [...joinedStatement(held), ...keptAsInstalledStatement(held, runFromHome)],
    );
    for (const line of lines) {
      this.log(line);
    }
  }

  private refuseAnEmptySelection(result: InstallSelection, id: string): void {
    if (!selectsNothing(result)) return;

    this.error(`Configuration '${id}' contains no skills this catalog can install.`, {
      exit: EXIT_CODES.ERROR,
    });
  }

  private announceArrivingSkills(held: HeldGlobal, agentCount: number): void {
    const arriving = notInstalledGlobally(held.result.skills, held);
    if (arriving.length === 0) return;

    this.log(`Installing ${arriving.length} skill(s) across ${agentCount} sub-agent(s)\n`);
  }

  private async confirmInstall(): Promise<boolean> {
    const outcome = await promptConfirm(({ onConfirm, onCancel }) => (
      <Confirm
        message={SHARED_CONFIG_ARRIVALS.INSTALL_CONFIRM}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ));
    return outcome === "confirmed";
  }

  /** Project-scoped: `detectInstallation`'s global fallback would refuse every clean project. */
  private async refuseInstalledProject(projectDir: string, id: string): Promise<void> {
    const installation = await detectProjectInstallation(projectDir);
    if (!installation) return;

    const provider = providerToNameAt(projectDir, providerInUse(projectDir));
    this.error(sharedConfigExistingInstall(installation.configPath, id, provider), {
      exit: EXIT_CODES.ERROR,
    });
  }

  private async fetchSharedConfigOrFail(id: string): Promise<SeedPayload> {
    this.log(`Fetching configuration ${id}...`);
    const fetched = await fetchSeedConfig(id);
    if (!fetched.ok) {
      this.error(fetched.error, { exit: EXIT_CODES.ERROR });
    }
    return fetched.payload;
  }

  private decodeSeedOrFail(payload: SeedPayload, matrix: MergedSkillsMatrix): SeedMapping {
    try {
      return seedToInstallSelection(payload, matrix);
    } catch (error) {
      this.handleError(error);
    }
  }

  private registerExternalSkillsOrFail(
    payload: SeedPayload,
    matrix: MergedSkillsMatrix,
    projectDir: string,
  ): ExternalSkillInstall[] {
    try {
      return registerExternalSkills(payload, matrix, projectDir);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async writeCarriedSkills(carried: ExternalSkillInstall[]): Promise<void> {
    if (carried.length === 0) return;

    await writeExternalSkills(carried);
    this.log(carriedSkillsWritten(carried.map((skill) => skill.id)));
  }

  private async loadSourceOrFail(
    flags: SourceFlags,
    projectDir: string,
  ): Promise<{ sourceResult: SourceLoadResult; startupMessages: StartupMessage[] }> {
    try {
      const loaded = await loadSource({
        // The one load that may choose a marketplace rather than read the stored one.
        caller: "init",
        ...(flags.marketplace !== undefined && { sourceFlag: flags.marketplace }),
        projectDir,
        captureStartupMessages: true,
      });
      return { sourceResult: loaded.sourceResult, startupMessages: loaded.startupMessages };
    } catch (error) {
      this.error(getErrorMessage(error), {
        exit: EXIT_CODES.ERROR,
      });
    }
  }

  private async handleInstallation(
    { result, sourceResult, sourceFlags, installedAlready }: Selection,
    projectDir: string,
  ): Promise<void> {
    const plan = planInstall(result, installedAlready);
    this.logInstallPlan(plan);

    // Before any copy, so a failed resolution cannot leave a half-install with no config.ts.
    const resolvedMarketplace = await this.marketplaceForPluginSkills(
      plan.pluginSkills,
      sourceResult,
      projectDir,
    );

    const copyResult = await this.copyEjectedSkills(plan, projectDir, sourceResult);

    if (resolvedMarketplace !== null) {
      await this.installPluginSkillsReported(
        plan.pluginSkills,
        resolvedMarketplace,
        projectDir,
        sourceResult.matrix,
      );
    }

    try {
      const written = await this.writeConfigAndCompile(
        result,
        sourceResult,
        sourceFlags,
        projectDir,
      );
      this.reportSuccess(written, copyResult, projectDir);

      await this.showPermissionNotice(projectDir);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async marketplaceForPluginSkills(
    pluginSkills: InstallSelection["skills"],
    sourceResult: SourceLoadResult,
    projectDir: string,
  ): Promise<string | null> {
    if (pluginSkills.length === 0) return null;

    return this.requireMarketplaceOrExit(
      sourceResult,
      "install plugin skills",
      hostAt(projectDir),
      (marketplace) => this.log(`Registering marketplace "${marketplace}"...`),
    );
  }

  /** One frame, then unmount: the notice has no exit of its own and `--from` must run headless. */
  private async showPermissionNotice(projectDir: string): Promise<void> {
    const permissionWarning = await checkPermissions(projectDir);
    if (!permissionWarning) return;

    const { unmount } = render(permissionWarning);
    unmount();
  }

  private logInstallPlan(plan: InstallPlan): void {
    this.log("\n");
    this.log(`Selected ${plural(plan.ejectedSkills.length + plan.pluginSkills.length, "skill")}`);
    this.log(`Install mode: ${installModeDescription(plan)}`);
  }

  private async copyEjectedSkills(
    { ejectedSkills, installMode }: InstallPlan,
    projectDir: string,
    sourceResult: SourceLoadResult,
  ): Promise<SkillCopyResult | null> {
    if (ejectedSkills.length === 0) return null;

    this.log("Copying skills to local directory...");
    const copyResult = await copyLocalSkills(ejectedSkills, projectDir, sourceResult);
    this.log(skillsCopiedLine(copyResult, installMode, projectDir));
    return copyResult;
  }

  private async writeConfigAndCompile(
    result: InstallSelection,
    sourceResult: SourceLoadResult,
    flags: SourceFlags,
    projectDir: string,
  ): Promise<WrittenInstall> {
    const configResult = await this.writeConfigReported(result, sourceResult, flags, projectDir);
    const agentScopeMap = buildAgentScopeMap(configResult.config);
    const compileResult = await this.compileInstalledAgents(
      configResult.propagation,
      agentScopeMap,
      projectDir,
    );
    this.reportCompilation(compileResult);
    await this.reportWhatThisHostCannotCarry(projectDir);

    this.reportFanOut(configResult.propagation);

    return { configResult, compileResult, agentScopeMap };
  }

  private async writeConfigReported(
    result: InstallSelection,
    sourceResult: SourceLoadResult,
    flags: SourceFlags,
    projectDir: string,
  ): Promise<ConfigWriteResult> {
    this.log("Generating configuration...");
    const configResult = await writeProjectConfig({
      selection: result,
      sourceResult,
      projectDir,
      ...(flags.marketplace !== undefined && { sourceFlag: flags.marketplace }),
    });

    if (configResult.wasMerged) {
      this.log(`Merged with existing config at ${configResult.existingConfigPath}`);
    }

    this.log(`Configuration saved (${plural(configResult.config.agents.length, "agent")})\n`);
    this.reportUnassignedSkills(configResult.config, result.skills);
    return configResult;
  }

  private async compileInstalledAgents(
    written: GateReport,
    agentScopeMap: Map<AgentName, SkillScope>,
    projectDir: string,
  ): Promise<CompilationResult> {
    this.log(STATUS_MESSAGES.COMPILING_AGENTS);
    // Sequential: both can reject and discovery warns, so the order decides what the user reads.
    const agentDefs = await loadAgentDefs();
    const { allSkills } = await discoverInstalledSkills(projectDir);
    const compile = compilesGlobalScope(projectDir, written)
      ? compileAgentsAllScopes
      : compileProjectScope;
    return compile({
      projectDir,
      sourcePath: agentDefs.sourcePath,
      skills: allSkills,
      agentScopeMap,
    });
  }

  private async reportWhatThisHostCannotCarry(projectDir: string): Promise<void> {
    for (const notice of await hostCompileNotices(providerInUse(projectDir), projectDir)) {
      this.log(notice);
    }
  }

  /**
   * Failures are recorded rather than aborted on: the skills and config are already written, and
   * {@link BaseCommand.exitIfWorkIncomplete} answers for them.
   */
  private reportCompilation(compileResult: CompilationResult): void {
    const { compiled, failed, warnings } = compileResult;
    const summary = `Compiled ${plural(compiled.length, "agent")}`;

    if (failed.length === 0) {
      this.log(`${summary}\n`);
      return;
    }

    this.log(`${summary} (${failed.length} failed)\n`);
    for (const warning of warnings) {
      this.warn(warning);
    }
    // Off `failed`, not `warnings`: warnings also carry entries that are not failures.
    this.recordIncompleteWork(agentsNotCompiled(failed), INCOMPLETE_WORK_RECOVERY.RECOMPILE);
  }

  private reportSuccess(
    { configResult, compileResult, agentScopeMap }: WrittenInstall,
    copyResult: SkillCopyResult | null,
    projectDir: string,
  ): void {
    // A run with work owed ends on the failure account instead of claiming success.
    if (!this.hasIncompleteWork) this.log(`${initSucceeded(this.brandingName)}\n`);

    if (copyResult !== null && copyResult.totalCopied > 0) {
      this.logDirectoryBlocks("Skills copied to:", skillsCopiedBlocks(projectDir, copyResult));
    }
    this.logDirectoryBlocks(
      "Agents compiled to:",
      agentsCompiledBlocks(projectDir, compileResult.compiled, agentScopeMap),
    );
    this.reportConfiguration(configResult, agentScopeMap, projectDir);
  }

  private reportConfiguration(
    { configPath, propagation }: ConfigWriteResult,
    agentScopeMap: Map<AgentName, SkillScope>,
    projectDir: string,
  ): void {
    const paths = {
      global: resolveInstallPaths(projectDir, "global").configPath,
      project: configPath,
    };
    const split = splitAgentScopes(projectDir, agentScopeMap);

    this.log("Configuration:");
    for (const written of configsWritten(projectDir, paths, propagation.globalWritten)) {
      this.log(`  ${written}`);
    }
    this.log("");

    this.log("To customize agent-skill assignments:");
    for (const [index, step] of customizationSteps(split, paths.global, projectDir).entries()) {
      this.log(`  ${index + 1}. ${step}`);
    }
    this.log("");
  }

  private logDirectoryBlocks(heading: string, blocks: DirectoryBlock[]): void {
    for (const { dir, entries } of blocks) {
      this.log(heading);
      this.log(`  ${dir}`);
      for (const entry of entries) {
        this.log(`    ${entry}`);
      }
      this.log("");
    }
  }
}

/** The editor is where a marketplace is added, so `--marketplace` without `--from` opens it. */
function opensTheEditor(
  flags: Pick<Interfaces.InferredFlags<typeof Init.flags>, "ui" | "from" | "marketplace">,
): boolean {
  return flags.ui || (flags.from === undefined && flags.marketplace !== undefined);
}

/** A sub-agent is installable without skills, so only a selection with neither is empty. */
function selectsNothing(result: InstallSelection): boolean {
  return result.skills.length === 0 && result.selectedAgents.length === 0;
}

/** At the home root the global config is the project's own, so there is no global install apart. */
async function installedGlobalToHold(projectDir: string): Promise<InstalledGlobal | null> {
  if (isHomeDirectory(projectDir)) return null;
  return await readInstalledGlobal(projectDir);
}

/** The run from home that changes what a project run keeps, where home would take it. */
type RunFromHome = { id: string | undefined; provider: Provider | undefined };

function keptAsInstalledStatement(held: HeldGlobal, runFromHome: RunFromHome): string[] {
  const { skillIds, agentNames } = held.keptAsInstalled;
  if (skillIds.length === 0 && agentNames.length === 0) return [];
  return [keptAsInstalledGlobally(skillIds, agentNames, runFromHome.id, runFromHome.provider)];
}

type GlobalEntries = { skills: SkillConfig[]; agents: AgentScopeConfig[] };

/** What the project inherits that the configuration leaves unnamed: a project config copies it all. */
function inheritedGlobal(held: HeldGlobal, installedGlobal: InstalledGlobal | null): GlobalEntries {
  if (installedGlobal === null) return { skills: [], agents: [] };

  const namedSkills = new Set(held.result.skills.filter(isGlobal).map(({ id }) => id));
  const namedAgents = new Set(held.result.agentConfigs.filter(isGlobal).map(({ name }) => name));
  return {
    skills: installedGlobal.skills.filter((skill) => isGlobal(skill) && !namedSkills.has(skill.id)),
    agents: installedGlobal.agents.filter(
      (agent) => isGlobal(agent) && !namedAgents.has(agent.name),
    ),
  };
}

function isGlobal(entry: SkillConfig | AgentScopeConfig): boolean {
  return isActiveAt(entry, "global");
}

/** Measured against the global install: the project changes nothing else of it. */
function installPanel(
  held: HeldGlobal,
  installedGlobal: InstalledGlobal | null,
  joined: AgentChange[],
  stackName: string | undefined,
): SummaryPanelProps {
  const inherited = inheritedGlobal(held, installedGlobal);
  return {
    skillConfigs: [...held.result.skills, ...inherited.skills],
    agentConfigs: [...held.result.agentConfigs, ...inherited.agents],
    installedSkillConfigs: installedGlobal?.skills ?? null,
    installedAgentConfigs: installedGlobal?.agents ?? null,
    isInitMode: true,
    changedAgentNames: new Set(joined.map(({ name }) => name)),
    stackName,
  };
}

/** The held global sub-agents an arriving skill's row joins, against their installed rows. */
function joinedGlobalAgents(
  held: HeldGlobal,
  installedGlobal: InstalledGlobal | null,
): AgentChange[] {
  if (installedGlobal === null) return [];

  return agentChangesAmong(
    held.joined.map(({ agentName }) => agentName),
    installedGlobal,
    { agents: held.result.agentConfigs, stack: held.result.assignedStack },
  );
}

type InstallPlan = {
  installMode: InstallMode;
  ejectedSkills: InstallSelection["skills"];
  pluginSkills: InstallSelection["skills"];
};

function planInstall(
  result: InstallSelection,
  installedAlready: ReadonlySet<SkillId>,
): InstallPlan {
  const toInstall = result.skills.filter(
    (skill) => !skill.excluded && !installedAlready.has(skill.id),
  );
  const [ejectedSkills, pluginSkills] = partition(
    toInstall,
    (skill) => skill.origin === EJECT_SOURCE,
  );
  return { installMode: deriveInstallMode(toInstall), ejectedSkills, pluginSkills };
}

function installModeDescription({ installMode, ejectedSkills, pluginSkills }: InstallPlan): string {
  if (installMode !== "mixed") return INSTALL_MODE_DESCRIPTIONS[installMode];
  return `${INSTALL_MODE_LABELS.mixed} (${ejectedSkills.length} eject, ${pluginSkills.length} plugin)`;
}

type WrittenInstall = {
  configResult: ConfigWriteResult;
  compileResult: CompilationResult;
  agentScopeMap: Map<AgentName, SkillScope>;
};

/**
 * From a project, global sub-agents recompile only when the write changed their inputs;
 * otherwise they would be rebuilt from this run's catalogue, not the one they were made from.
 */
function compilesGlobalScope(cwd: string, written: GateReport): boolean {
  return isHomeDirectory(cwd) || movedGlobalAgentInputs(written);
}

/** Names the directory only when every skill landed at one scope; the block beneath lists both. */
function skillsCopiedLine(
  copyResult: SkillCopyResult,
  installMode: InstallMode,
  projectDir: string,
): string {
  const isMixed = installMode === "mixed";
  const copied = plural(copyResult.totalCopied, isMixed ? "local skill" : "skill");
  const lineEnd = isMixed ? "" : "\n";
  const projectCount = copyResult.projectCopied.length;
  const globalCount = copyResult.globalCopied.length;
  const landedAtBothScopes = projectCount > 0 && globalCount > 0;

  if (landedAtBothScopes) {
    return `Copied ${copied} (${projectCount} project, ${globalCount} global)${lineEnd}`;
  }
  const landedAt: SkillScope = globalCount > 0 ? "global" : "project";
  return `Copied ${copied} to ${resolveInstallPaths(projectDir, landedAt).skillsDir}/${lineEnd}`;
}

/** Entries are on-disk names, so ids, never display names. */
type DirectoryBlock = { dir: string; entries: string[] };

function hasEntries(block: DirectoryBlock): boolean {
  return block.entries.length > 0;
}

/** At home a Claude install's two scopes are one folder, which is named once. */
function oneBlockPerDir(blocks: DirectoryBlock[]): DirectoryBlock[] {
  const dirs = [...new Set(blocks.map((block) => block.dir))];
  return dirs.map((dir) => ({
    dir,
    entries: blocks.filter((block) => block.dir === dir).flatMap((block) => block.entries),
  }));
}

function skillsCopiedBlocks(projectDir: string, copyResult: SkillCopyResult): DirectoryBlock[] {
  return oneBlockPerDir(
    [
      copiedSkillsBlock(projectDir, "global", copyResult.globalCopied),
      copiedSkillsBlock(projectDir, "project", copyResult.projectCopied),
    ].filter(hasEntries),
  );
}

function copiedSkillsBlock(
  projectDir: string,
  scope: SkillScope,
  copied: SkillCopyResult["projectCopied"],
): DirectoryBlock {
  return {
    dir: resolveInstallPaths(projectDir, scope).skillsDir,
    entries: copied.map(({ skillId }) => `${skillId}/`),
  };
}

/** Mirrors `writeCompiledAgentsByScope`' routing. */
function agentsCompiledBlocks(
  projectDir: string,
  compiled: AgentName[],
  agentScopeMap: Map<AgentName, SkillScope>,
): DirectoryBlock[] {
  const [globalAgents, projectAgents] = partition(
    compiled,
    (name) => agentScopeMap.get(name) === "global",
  );
  return oneBlockPerDir(
    [
      compiledAgentsBlock(projectDir, "global", globalAgents),
      compiledAgentsBlock(projectDir, "project", projectAgents),
    ].filter(hasEntries),
  );
}

/** Per scope, because the project and global installs can be on different hosts. */
function compiledAgentsBlock(
  projectDir: string,
  scope: SkillScope,
  agents: AgentName[],
): DirectoryBlock {
  const { extension } = agentCodec(providerInUse(installBaseDir(projectDir, scope)));
  return {
    dir: resolveInstallPaths(projectDir, scope).agentsDir,
    entries: agents.map((name) => `${name}${extension}`),
  };
}

type ConfigPaths = { global: string; project: string };

type AgentScopeSplit = { globalAgentCount: number; isGlobalOnly: boolean };

/** At the home root both scopes are one config and one pass, so there is no split. */
function splitAgentScopes(cwd: string, agentScopeMap: Map<AgentName, SkillScope>): AgentScopeSplit {
  if (isHomeDirectory(cwd)) return { globalAgentCount: 0, isGlobalOnly: false };

  const scopes = [...agentScopeMap.values()];
  const globalAgentCount = scopes.filter((scope) => scope === "global").length;
  return {
    globalAgentCount,
    isGlobalOnly: globalAgentCount > 0 && globalAgentCount === scopes.length,
  };
}

/**
 * From a project its own config is always written, and the global one whenever the run changed it,
 * if only to register the project. At home the two are one file.
 */
function configsWritten(projectDir: string, paths: ConfigPaths, globalWritten: boolean): string[] {
  if (isHomeDirectory(projectDir)) return [paths.project];
  return globalWritten ? [paths.global, paths.project] : [paths.project];
}

/** `compile` in a project recompiles no global agent, hence the global hint. */
function customizationSteps(
  split: AgentScopeSplit,
  globalConfigPath: string,
  projectDir: string,
): string[] {
  if (split.isGlobalOnly) {
    return [`Edit ${globalConfigPath}`, globalScopedAgentsHint(split.globalAgentCount)];
  }

  return [
    `Edit ${relativeConfigPath(projectDir, providerInUse(projectDir))}`,
    `Run '${CLI_INVOKE_COMMAND} compile' to regenerate agents`,
    ...(split.globalAgentCount > 0 ? [globalScopedAgentsHint(split.globalAgentCount)] : []),
  ];
}

export type DashboardData = {
  name: string;
  installations: ProviderInstallation[];
};

/** Each installation's counts come from its own scope-aware read, so project and global never mix. */
async function getDashboardData(projectDir: string): Promise<DashboardData> {
  // ABORT: an unloadable config throws here, as the installation check before it already would.
  const [installations, branding] = await Promise.all([
    getInstallationsByProvider(projectDir),
    resolveBranding(projectDir),
  ]);
  // Every caller found an installation before drawing the dashboard.
  if (installations.length === 0) throw new Error(ERROR_MESSAGES.NO_INSTALLATION);

  return { name: branding.name, installations };
}
