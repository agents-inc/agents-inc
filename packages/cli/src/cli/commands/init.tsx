import React from "react";
import path from "path";

import { Errors, Flags, type Interfaces } from "@oclif/core";
import { Box, Text, useApp } from "ink";
import { partition, unique } from "remeda";
import { render } from "../components/render.js";

import { BaseCommand } from "../base-command.js";
import type { InstallSelection } from "@workspace/compile/seed-to-config";
import { useTerminalDimensions } from "../components/hooks/use-terminal-dimensions.js";
import { stoppingOnARefusal, type SourceLoadResult } from "../lib/loading/index.js";
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
import {
  removeSkillFoldersCreatedSince,
  skillFoldersAt,
} from "../lib/operations/skills/copy-local-skills.js";
import { movedGlobalAgentInputs, type GateReport } from "../lib/config-gate/index.js";
import {
  holdInstalledGlobal,
  joinedStatement,
  keptAsInstalledStatement,
  notInstalledGlobally,
  readInstalledGlobal,
  runFromHomeFor,
  type HeldGlobal,
  type InstalledGlobal,
  type RunFromHome,
} from "../lib/seed/seed-apply.js";
import { agentChangesAmong, type AgentChange } from "../lib/configuration/scope-diff.js";
import { isActiveAt } from "../lib/configuration/scope-predicates.js";
import { summaryPanelBlock, type SummaryPanelProps } from "../components/common/summary-panel.js";
import {
  getInstallationsByProvider,
  type ProviderInstallation,
} from "../lib/plugins/plugin-info.js";
import { buildMarketplacePluginRef } from "../lib/plugins/plugin-ref.js";
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
  resolveInstallPaths,
  buildAgentScopeMap,
  isHomeDirectory,
  INSTALL_MODE_LABELS,
  INSTALL_MODE_DESCRIPTIONS,
} from "../lib/installation/index.js";
import { hostAt } from "../lib/hosts/host-for.js";
import {
  filesATakeBackMayEmpty,
  foldersAPluginInstallMayEmpty,
  foldersATakeBackMayEmpty,
  removeIfHoldingNothing,
} from "../lib/hosts/host-files-left-empty.js";
import type { PluginHost } from "../lib/hosts/plugin-host.js";
import {
  agentCodec,
  chooseProviderForThisRun,
  hostCompilesAgent,
  providerAtScope,
  providerInUse,
  relativeConfigPath,
  whileInstallingInto,
} from "../lib/installation/install-layout.js";
import { providerToNameAt } from "../lib/installation/provider-to-name.js";
import { hostCompileNotices } from "../lib/hosts/host-compile-notices.js";
import {
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
import { isKnownAbsent, removeDirIfEmpty } from "../utils/fs.js";
import { mapInTurn } from "../utils/in-turn.js";
import { SelectList, type SelectListItem } from "../components/common/select-list.js";
import { promptConfirm, promptValue } from "../components/common/prompt-confirm.js";
import { Confirm } from "../components/common/confirm.js";
import { getErrorMessage } from "../utils/errors.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { plural } from "../utils/string.js";
import type {
  AgentName,
  AgentScopeConfig,
  MergedSkillsMatrix,
  SkillConfig,
  SkillId,
  SkillScope,
} from "../types/index.js";
import { type StartupMessage, verbose } from "../utils/logger.js";
import {
  ERROR_MESSAGES,
  INCOMPLETE_WORK_RECOVERY,
  INFO_MESSAGES,
  SHARED_CONFIG_ARRIVALS,
  STATUS_MESSAGES,
  addMarketplaceInTheEditor,
  agentsNotCompiled,
  carriedSkillsRemovedAfterRefusedSave,
  copiedSkillsRemovedAfterRefusedSave,
  globalScopedAgentsHint,
  initSucceeded,
  marketplaceRemovedAfterRefusedSave,
  pluginKeptAfterRefusedSave,
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
  skillFoldersBefore: ReadonlySet<string>;
  installFoldersMissing: string[];
  hostPathsMissing: HostPathsMissing;
  carriedSkillDirs: ReadonlySet<string>;
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
    const applyHere = await this.howToApplyItHere(id, projectDir, provider);

    this.log(id === undefined ? `Build it at ${url}` : `Open it at ${url}`);
    if (marketplaceLine !== undefined) this.log(marketplaceLine);
    this.log(applyHere);
    await this.openInBrowserAtATerminal(url);
  }

  private async install(): Promise<void> {
    const { flags } = await this.parse(Init);
    const projectDir = process.cwd();

    // First, so a refused `--provider` leaves the filesystem untouched at both scopes.
    this.settleTheProviderForThisRun(flags);
    await this.sayWhenTheProjectsConfigDeclaresNothing(INFO_MESSAGES.DECLARES_NOTHING_TO_INIT_OVER);

    // Before `ensureConfigReadable`: a broken config must not block the editor route.
    if (opensTheEditor(flags)) {
      return this.openEditor(
        projectDir,
        providerNamedBy(flags.provider),
        flags.from,
        flags.marketplace,
      );
    }

    const { from } = flags;
    if (from === undefined) return this.showDashboardOrOpenEditor(projectDir);

    return whileInstallingInto(projectDir, () => this.installSharedConfig(from, flags, projectDir));
  }

  private async installSharedConfig(
    id: string,
    flags: SourceFlags,
    projectDir: string,
  ): Promise<void> {
    // ABORT: an unreadable config is refused here, before anything reads it.
    await this.ensureConfigReadable(projectDir);
    // Its degrade arm cannot fire: `ensureConfigReadable` already refused every unreadable config.
    this.brandingName = await this.resolveBrandingName(projectDir);

    const selection = await this.selectionFromSharedConfig(id, flags, projectDir);
    if (!selection) this.exit(EXIT_CODES.CANCELLED);

    this.reportValidationErrors(selection.result.validation);

    await this.handleInstallation(selection, projectDir);
  }

  private async showDashboardOrOpenEditor(projectDir: string): Promise<void> {
    // ABORT: an unreadable config is refused here, before the dashboard reads it.
    await this.ensureConfigReadable(projectDir);
    const dashboard = await runDashboardFlow(projectDir, this.config, (msg) => this.log(msg));
    switch (dashboard) {
      case "cancelled":
        return this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });
      case "not-installed":
        return this.openEditor(projectDir, undefined);
      case "shown":
        return;
      default: {
        const _exhaustive: never = dashboard;
        return _exhaustive;
      }
    }
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
    // First: on Codex even the source load's plugin listing writes into the host's home.
    const hostPathsMissing = await hostPathsMissingAt(projectDir);
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

    // Above the skips: a skill that could not load is skipped under the warning saying why.
    sayCapturedWarnings(startupMessages);
    this.warnOfSkippedEntries(mapping, sourceResult.unloadedSkillIds);
    this.refuseAnEmptySelection(held.result, id);

    const stackName = await this.stackNameOf(result.selectedStackId, sourceResult);
    this.logWhatGoesWhere(held, installedGlobal, stackName, runFromHomeFor(result, id, projectDir));
    if (process.stdin.isTTY && !(await this.confirmInstall())) {
      this.log("Setup cancelled");
      return null;
    }

    // After the question, so a refusal or a no leaves nothing written.
    const skillFoldersBefore = await skillFoldersAt(projectDir);
    const installFoldersMissing = await installFoldersMissingAt(projectDir);
    await this.writeCarriedSkills(arrivingCarried);
    this.announceArrivingSkills(held, countCompiledAgents(projectDir, result.agentConfigs));

    return {
      result: held.result,
      sourceResult,
      sourceFlags,
      installedAlready: new Set(held.installed.skillIds),
      skillFoldersBefore,
      installFoldersMissing,
      hostPathsMissing,
      carriedSkillDirs: new Set(arrivingCarried.map(({ skillDir }) => skillDir)),
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
      [...joinedStatement(held), ...keptAsInstalledStatement(held, [], runFromHome)],
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

    this.log(
      `Installing ${plural(arriving.length, "skill")} across ${plural(agentCount, "sub-agent")}\n`,
    );
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

  private async loadSourceOrFail(
    flags: SourceFlags,
    projectDir: string,
  ): Promise<{ sourceResult: SourceLoadResult; startupMessages: StartupMessage[] }> {
    try {
      const loaded = await stoppingOnARefusal(() =>
        loadSource({
          // The one load that may choose a marketplace rather than read the stored one.
          caller: "init",
          ...(flags.marketplace !== undefined && { sourceFlag: flags.marketplace }),
          projectDir,
          captureStartupMessages: true,
        }),
      );
      return { sourceResult: loaded.sourceResult, startupMessages: loaded.startupMessages };
    } catch (error) {
      this.error(getErrorMessage(error), {
        exit: EXIT_CODES.ERROR,
      });
    }
  }

  private async handleInstallation(
    {
      result,
      sourceResult,
      sourceFlags,
      installedAlready,
      skillFoldersBefore,
      installFoldersMissing,
      hostPathsMissing,
      carriedSkillDirs,
    }: Selection,
    projectDir: string,
  ): Promise<void> {
    const plan = planInstall(result, installedAlready);
    this.logInstallPlan(plan);

    // Before any copy, so a failed resolution cannot leave a half-install with no config.ts.
    const marketplace = await this.marketplaceForPluginSkills(
      plan.pluginSkills,
      sourceResult,
      projectDir,
    );

    const copyResult = await this.copyEjectedSkills(plan, projectDir, sourceResult);
    const plugins = await this.installPluginSkillsNotingWhatWasHeld(
      plan.pluginSkills,
      marketplace,
      projectDir,
      sourceResult.matrix,
    );

    const configResult = await this.writeConfigReported(
      result,
      sourceResult,
      sourceFlags,
      projectDir,
      {
        skillFoldersBefore,
        installFoldersMissing,
        hostPathsMissing,
        carriedSkillDirs,
        copyResult,
        plugins,
        marketplace,
      },
    );
    try {
      const written = await this.compileWrittenConfig(configResult, projectDir);
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
  ): Promise<MarketplaceInUse | null> {
    if (pluginSkills.length === 0) return null;

    const host = hostAt(projectDir);
    const heldBefore = await marketplacesHeldBy(host);
    const name = await this.requireMarketplaceOrExit(
      sourceResult,
      "install plugin skills",
      host,
      (marketplace) => this.log(`Registering marketplace "${marketplace}"...`),
    );
    return { name, newlyRegistered: !heldBefore(name) };
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

  private async installPluginSkillsNotingWhatWasHeld(
    pluginSkills: SkillConfig[],
    marketplace: MarketplaceInUse | null,
    projectDir: string,
    matrix: MergedSkillsMatrix,
  ): Promise<PluginsPutDown> {
    if (marketplace === null) return { newlyInstalled: [], perhapsHeld: [], foldersMissing: [] };

    const heldBefore = await pluginRefsHeldAt(projectDir);
    const foldersMissing = await pluginInstallFoldersMissingAt(projectDir, marketplace.name);
    await this.installPluginSkillsReported(pluginSkills, marketplace.name, projectDir, matrix);
    const installed = pluginsInstalledFrom(marketplace.name, pluginSkills);
    return { ...splitByWhatWasHeld(installed, heldBefore), foldersMissing };
  }

  private async compileWrittenConfig(
    configResult: ConfigWriteResult,
    projectDir: string,
  ): Promise<WrittenInstall> {
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
    putDown: PutDown,
  ): Promise<ConfigWriteResult> {
    this.log("Generating configuration...");
    const configResult = await this.takingBackOnFailure(putDown, projectDir, () =>
      writeProjectConfig({
        selection: result,
        sourceResult,
        projectDir,
        ...(flags.marketplace !== undefined && { sourceFlag: flags.marketplace }),
      }),
    );

    if (configResult.wasMerged) {
      this.log(`Merged with existing config at ${configResult.existingConfigPath}`);
    }

    this.log(`Configuration saved (${plural(configResult.config.agents.length, "agent")})\n`);
    this.reportUnassignedSkills(configResult.config, result.skills);
    return configResult;
  }

  private async takingBackOnFailure<T>(
    putDown: PutDown,
    projectDir: string,
    write: () => Promise<T>,
  ): Promise<T> {
    try {
      return await write();
    } catch (error) {
      const foldersRemoved = await removeNewSkillFolders(putDown.skillFoldersBefore, projectDir);
      await uninstallEach(putDown.plugins.newlyInstalled, projectDir);
      const marketplaceRemoved = await removeNewMarketplace(putDown, projectDir);
      await removeHostFilesLeftEmpty(putDown.hostPathsMissing.files);
      await removeFoldersLeftEmpty(foldersThisRunMade(putDown));
      this.failSayingWhatWasTakenBack(error, {
        ...skillsRemoved(putDown, foldersRemoved),
        marketplace: marketplaceRemoved,
        pluginsKept: putDown.plugins.perhapsHeld.map(({ ref }) => ref),
      });
    }
  }

  /** oclif prints a thrown error last, so this one is printed here and thrown already printed. */
  private failSayingWhatWasTakenBack(error: unknown, takenBack: TakenBack): never {
    const lines = linesSayingWhatWasTakenBack(takenBack);
    if (lines.length === 0) this.handleError(error);

    const message = getErrorMessage(error);
    this.error(message, { exit: false });
    for (const line of lines) this.log(line);
    throw Object.assign(new Errors.CLIError(message, { exit: EXIT_CODES.ERROR }), {
      skipOclifErrorHandling: true,
    });
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
    {
      agents: held.result.agentConfigs,
      skills: held.result.skills,
      stack: held.result.assignedStack,
    },
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

type InstalledPlugin = { ref: string; scope: SkillScope };

/** Newly registered only where the host listed what it held before and this was not among it. */
type MarketplaceInUse = { name: string; newlyRegistered: boolean };

/** `perhapsHeld`: installed where the host could not say what it held before. */
type PluginsPutDown = {
  newlyInstalled: InstalledPlugin[];
  perhapsHeld: InstalledPlugin[];
  foldersMissing: string[];
};

type HostPathsMissing = { files: string[]; folders: string[] };

type PutDown = {
  skillFoldersBefore: ReadonlySet<string>;
  installFoldersMissing: string[];
  hostPathsMissing: HostPathsMissing;
  carriedSkillDirs: ReadonlySet<string>;
  copyResult: SkillCopyResult | null;
  plugins: PluginsPutDown;
  marketplace: MarketplaceInUse | null;
};

/** Null where the host cannot say: a take-back must never touch a plugin that may have been there. */
async function pluginRefsHeldAt(projectDir: string): Promise<ReadonlySet<string> | null> {
  try {
    return new Set(await hostAt(projectDir).pluginsHeld(projectDir));
  } catch (error) {
    verbose(`Could not read the plugins installed before this run: ${getErrorMessage(error)}`);
    return null;
  }
}

function pluginsInstalledFrom(marketplace: string, pluginSkills: SkillConfig[]): InstalledPlugin[] {
  return pluginSkills.map(({ id, scope }) => ({
    ref: buildMarketplacePluginRef(id, marketplace),
    scope,
  }));
}

function splitByWhatWasHeld(
  installed: InstalledPlugin[],
  heldBefore: ReadonlySet<string> | null,
): Pick<PluginsPutDown, "newlyInstalled" | "perhapsHeld"> {
  if (heldBefore === null) return { newlyInstalled: [], perhapsHeld: installed };
  return { newlyInstalled: installed.filter(({ ref }) => !heldBefore.has(ref)), perhapsHeld: [] };
}

/** As for plugins, unreadable counts as held. */
async function marketplacesHeldBy(host: PluginHost): Promise<(name: string) => boolean> {
  try {
    const held = new Set(await host.marketplaceTakeBack.marketplacesHeld());
    return (name) => held.has(name);
  } catch (error) {
    verbose(
      `Could not read the marketplaces registered before this run: ${getErrorMessage(error)}`,
    );
    return () => true;
  }
}

async function removeNewSkillFolders(
  before: ReadonlySet<string>,
  projectDir: string,
): Promise<ReadonlySet<string>> {
  try {
    return await removeSkillFoldersCreatedSince(before, projectDir);
  } catch (error) {
    verbose(`Could not remove a skill folder this run made: ${getErrorMessage(error)}`);
    return new Set();
  }
}

/** Read before the copies, so a take-back removes only the folders this run made. */
async function installFoldersMissingAt(projectDir: string): Promise<string[]> {
  return foldersMissingOnTheWayToEach(foldersWrittenBeforeTheSave(projectDir));
}

/** Each scope's skills folder, and the project's config folder `writeProjectConfig` makes. */
function foldersWrittenBeforeTheSave(projectDir: string): string[] {
  const project = resolveInstallPaths(projectDir, "project");
  return [
    project.skillsDir,
    resolveInstallPaths(projectDir, "global").skillsDir,
    path.dirname(project.configPath),
  ];
}

async function foldersMissingOnTheWayToEach(folders: string[]): Promise<string[]> {
  const chains = await Promise.all(folders.map(foldersMissingOnTheWayTo));
  return unique(chains.flat());
}

/** One the run cannot tell is missing counts as there, so it stays. */
async function foldersMissingOnTheWayTo(dir: string): Promise<string[]> {
  if (!(await isKnownAbsent(dir))) return [];
  return [dir, ...(await foldersMissingOnTheWayTo(path.dirname(dir)))];
}

/** Read before anything asks the host, so a take-back deletes only what this run created. */
async function hostPathsMissingAt(projectDir: string): Promise<HostPathsMissing> {
  const provider = providerInUse(projectDir);
  const files = filesATakeBackMayEmpty(provider, projectDir);
  const absent = await Promise.all(files.map(isKnownAbsent));
  return {
    files: files.filter((_, at) => absent[at]),
    folders: await foldersMissingOnTheWayToEach(foldersATakeBackMayEmpty(provider, projectDir)),
  };
}

/** Read before the install, the one verb that makes them. */
async function pluginInstallFoldersMissingAt(
  projectDir: string,
  marketplace: string,
): Promise<string[]> {
  const provider = providerInUse(projectDir);
  return foldersMissingOnTheWayToEach(
    foldersAPluginInstallMayEmpty(provider, projectDir, marketplace),
  );
}

function foldersThisRunMade({
  installFoldersMissing,
  hostPathsMissing,
  plugins,
}: PutDown): string[] {
  return [...installFoldersMissing, ...hostPathsMissing.folders, ...plugins.foldersMissing];
}

/** Before the folders, which a file left in them keeps. */
async function removeHostFilesLeftEmpty(files: string[]): Promise<void> {
  await Promise.all(
    files.map((file) =>
      removeIfHoldingNothing(file).catch((error: unknown) => {
        verbose(`Could not remove ${file}, which this run created: ${getErrorMessage(error)}`);
      }),
    ),
  );
}

/** Deepest first and in turn, since a folder empties only once the one inside it has gone. */
async function removeFoldersLeftEmpty(folders: string[]): Promise<void> {
  const deepestFirst = unique(folders).toSorted((a, b) => b.length - a.length);
  try {
    await mapInTurn(deepestFirst, removeDirIfEmpty);
  } catch (error) {
    verbose(`Could not remove a folder this run made: ${getErrorMessage(error)}`);
  }
}

/** A failure is diagnostic only, since the save's own error is what is reported. */
async function uninstallEach(plugins: InstalledPlugin[], projectDir: string): Promise<void> {
  const host = hostAt(projectDir);
  for (const { ref, scope } of plugins) {
    await host.uninstallPlugin(ref, scope, projectDir).catch((error: unknown) => {
      verbose(`Could not uninstall ${ref}, which this run installed: ${getErrorMessage(error)}`);
    });
  }
}

/**
 * Answers the name it removed; a failure is diagnostic only, as for the plugins. One a kept plugin
 * came from stays, since Claude's `marketplace remove` uninstalls its plugins too.
 */
async function removeNewMarketplace(
  { marketplace, plugins }: PutDown,
  projectDir: string,
): Promise<string | null> {
  const keepsAPluginFromIt = plugins.perhapsHeld.length > 0;
  if (marketplace === null || !marketplace.newlyRegistered || keepsAPluginFromIt) return null;

  try {
    await hostAt(projectDir).marketplaceTakeBack.removeMarketplace(marketplace.name);
    return marketplace.name;
  } catch (error) {
    verbose(
      `Could not remove the marketplace "${marketplace.name}", which this run registered: ${getErrorMessage(error)}`,
    );
    return null;
  }
}

type SkillsRemoved = { copied: number; carried: number };

type TakenBack = SkillsRemoved & { marketplace: string | null; pluginsKept: string[] };

/** A carried skill is recorded among the copies in place, so it is counted as carried only. */
function skillsRemoved(
  { copyResult, carriedSkillDirs }: PutDown,
  folders: ReadonlySet<string>,
): SkillsRemoved {
  const countRemoved = (dirs: string[]) => dirs.filter((dir) => folders.has(dir)).length;
  const copies = copyDestinations(copyResult).filter((dir) => !carriedSkillDirs.has(dir));
  return { copied: countRemoved(copies), carried: countRemoved([...carriedSkillDirs]) };
}

function copyDestinations(copyResult: SkillCopyResult | null): string[] {
  if (copyResult === null) return [];
  return [...copyResult.projectCopied, ...copyResult.globalCopied].map(({ destPath }) => destPath);
}

function linesSayingWhatWasTakenBack({
  copied,
  carried,
  marketplace,
  pluginsKept,
}: TakenBack): string[] {
  return [
    ...(copied > 0 ? [copiedSkillsRemovedAfterRefusedSave(copied)] : []),
    ...(carried > 0 ? [carriedSkillsRemovedAfterRefusedSave(carried)] : []),
    ...(marketplace !== null ? [marketplaceRemovedAfterRefusedSave(marketplace)] : []),
    ...pluginsKept.map(pluginKeptAfterRefusedSave),
  ];
}

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
  const { extension } = agentCodec(providerAtScope(projectDir, scope));
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

  const scopes = scopesOfCompiledAgents(cwd, agentScopeMap);
  const globalAgentCount = scopes.filter((scope) => scope === "global").length;
  return {
    globalAgentCount,
    isGlobalOnly: globalAgentCount > 0 && globalAgentCount === scopes.length,
  };
}

/** Codex leaves some sub-agents out, so each counts only where its scope's host compiles it. */
function compiledAt(cwd: string, name: AgentName, scope: SkillScope): boolean {
  return hostCompilesAgent(providerAtScope(cwd, scope), name);
}

function scopesOfCompiledAgents(
  cwd: string,
  agentScopeMap: Map<AgentName, SkillScope>,
): SkillScope[] {
  return [...agentScopeMap]
    .filter(([name, scope]) => compiledAt(cwd, name, scope))
    .map(([, scope]) => scope);
}

function countCompiledAgents(cwd: string, agents: AgentScopeConfig[]): number {
  return agents.filter(({ name, scope }) => compiledAt(cwd, name, scope)).length;
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
