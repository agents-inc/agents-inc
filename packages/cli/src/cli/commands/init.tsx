import React from "react";

import { Flags, type Interfaces } from "@oclif/core";
import { Box, Text, useApp } from "ink";
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
  installPlanLines,
  notInstalledGlobally,
  readInstalledGlobal,
  type HeldGlobal,
} from "../lib/seed/seed-apply.js";
import { getInstallationInfo } from "../lib/plugins/plugin-info.js";
import { loadProjectConfig } from "../lib/configuration/project-config.js";
import { isLocalSource, resolveBranding } from "../lib/configuration/config.js";
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
  EDITOR_URL,
  EJECT_SOURCE,
  editorConfigUrl,
} from "../consts.js";
import { clearTerminalScreen } from "../utils/terminal.js";
import { SelectList, type SelectListItem } from "../components/common/select-list.js";
import { promptConfirm, promptValue } from "../components/common/prompt-confirm.js";
import { Confirm } from "../components/common/confirm.js";
import { getErrorMessage } from "../utils/errors.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { openUrl } from "../utils/open-url.js";
import { plural } from "../utils/string.js";
import type { AgentName, MergedSkillsMatrix, SkillId, SkillScope } from "../types/index.js";
import { type StartupMessage } from "../utils/logger.js";
import {
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
  skippedUnknownAgents,
  skippedUnknownSkills,
} from "../utils/messages.js";
import type { SeedPayload } from "@workspace/matrix/seed";

const DASHBOARD_OPTIONS = [
  { label: "Edit in the web editor", value: "edit" },
  { label: "Compile", value: "compile" },
  { label: "Doctor", value: "doctor" },
  { label: "List", value: "list" },
] as const satisfies readonly SelectListItem<string>[];

const DASHBOARD_OPTIONS_LINE = `  ${DASHBOARD_OPTIONS.map(({ label }) => `[${label}]`).join("  ")}`;

export type DashboardCommand = (typeof DASHBOARD_OPTIONS)[number]["value"];

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

/** Shared by the TTY and piped dashboards so the two cannot drift apart. */
export function dashboardCountLines(data: DashboardData): string[] {
  const lines = [
    `  Skills:       ${data.skillCount} installed`,
    `  Agents:       ${data.agentCount} compiled`,
    `  Mode:         ${INSTALL_MODE_LABELS[data.mode]}`,
  ];
  if (data.source) {
    lines.push(`  Marketplace:  ${data.source}`);
  }
  return lines;
}

export function formatDashboardText(data: DashboardData): string {
  return [data.name, "", ...dashboardCountLines(data), "", DASHBOARD_OPTIONS_LINE].join("\n");
}

/** Ctrl+C cancels the run; Escape (null) only leaves the dashboard. */
const DASHBOARD_INTERRUPTED = "interrupted";

type DashboardAnswer = DashboardCommand | typeof DASHBOARD_INTERRUPTED | null;

/** Without a TTY, prints the summary and answers null. */
export async function showDashboard(
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

/**
 * The payload's marketplace, since a skill id never says where its repository lives;
 * `--marketplace` still outranks it.
 */
function sharedConfigSourceFlags(flags: SourceFlags, payload: SeedPayload): SourceFlags {
  return { marketplace: flags.marketplace ?? payload.marketplace };
}

export default class Init extends BaseCommand {
  /** Resolved once in {@link install}; the closing line is printed several calls below. */
  private brandingName: string = DEFAULT_BRANDING.NAME;

  static summary = `Initialize ${DEFAULT_BRANDING.NAME} in this project`;
  static description =
    "Build a configuration in agentsinc.sh/editor, or install one by id with --from. Over an existing installation, shows its dashboard.";

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
      description:
        "Open agentsinc.sh/editor on the id --from names, or on the catalogue — what a bare init does where nothing is installed",
      default: false,
    }),
    provider: providerFlag(),
  };

  /** The exit code is decided once, after every path through {@link install} has ended. */
  async run(): Promise<void> {
    await this.install();
    this.exitIfWorkIncomplete();
  }

  /**
   * Opens the editor on the `--from` id, or on the catalogue. The link is printed before it is
   * opened, so it still works where no browser can open.
   */
  private async openEditor(projectDir: string, id?: string, marketplace?: string): Promise<void> {
    const url = id === undefined ? EDITOR_URL : editorConfigUrl(id);
    // Above the first line, so a ref the install route would refuse is refused before any output.
    const marketplaceLine =
      marketplace === undefined ? undefined : this.addMarketplaceLineOrFail(marketplace);

    this.log(id === undefined ? `Build it at ${url}` : `Open it at ${url}`);
    if (marketplaceLine !== undefined) this.log(marketplaceLine);
    this.log(applySharedConfigHere(id, await holdsItsOwnInstallation(projectDir)));

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
    if (opensTheEditor(flags)) return this.openEditor(projectDir, flags.from, flags.marketplace);

    // ABORT: an unreadable config is refused here, before any route reads it.
    await this.ensureConfigReadable(projectDir);

    if (flags.from === undefined) return this.showDashboardOrOpenEditor(projectDir);

    // Its degrade arm cannot fire: `ensureConfigReadable` already refused every unreadable config.
    this.brandingName = await this.resolveBrandingName(projectDir);

    const selection = await this.selectionFromSharedConfig(flags.from, flags, projectDir);
    if (!selection) this.exit(EXIT_CODES.CANCELLED);

    this.reportValidationErrors(selection.result.validation);

    await this.handleInstallation(selection);
  }

  private async showDashboardOrOpenEditor(projectDir: string): Promise<void> {
    const dashboard = await runDashboardFlow(projectDir, this.config, (msg) => this.log(msg));
    if (dashboard === "cancelled") this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });
    if (dashboard === "not-installed") await this.openEditor(projectDir);
  }

  private addMarketplaceLineOrFail(ref: string): string {
    try {
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

  /**
   * Fetches and maps the `--from` id. Every refusal fires before anything is written; at a
   * terminal it lists what goes where and asks, and headless it lists and carries on.
   */
  private async selectionFromSharedConfig(
    id: string,
    flags: SourceFlags,
    projectDir: string,
  ): Promise<Selection | null> {
    await this.refuseInstalledProject(projectDir, id);

    this.log(`Fetching configuration ${id}...`);
    const fetched = await fetchSeedConfig(id);
    if (!fetched.ok) {
      this.error(fetched.error, { exit: EXIT_CODES.ERROR });
    }

    const sourceFlags = sharedConfigSourceFlags(flags, fetched.payload);
    const { sourceResult, startupMessages } = await this.loadSourceOrFail(sourceFlags);
    // Before the decode, which would otherwise skip carried skills as unknown ids.
    const carriedSkills = this.registerExternalSkillsOrFail(
      fetched.payload,
      sourceResult.matrix,
      projectDir,
    );
    const { result, skippedSkillIds, skippedAgentNames } = this.decodeSeedOrFail(
      fetched.payload,
      sourceResult.matrix,
    );

    this.refuseProjectScopedContentAtHome(result, projectDir);

    const held = holdInstalledGlobal(
      result,
      isHomeDirectory(projectDir) ? null : await readInstalledGlobal(projectDir),
    );
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

    if (skippedSkillIds.length > 0) this.warn(skippedUnknownSkills(skippedSkillIds));
    if (skippedAgentNames.length > 0) this.warn(skippedUnknownAgents(skippedAgentNames));

    if (selectsNothing(held.result)) {
      this.error(`Configuration '${id}' contains no skills this catalog can install.`, {
        exit: EXIT_CODES.ERROR,
      });
    }

    this.logWhatGoesWhere(held);
    if (process.stdin.isTTY && !(await this.confirmInstall())) {
      this.log("Setup cancelled");
      return null;
    }

    // After the question, so a refusal or a no leaves nothing written.
    await this.writeCarriedSkills(arrivingCarried);

    const arriving = notInstalledGlobally(held.result.skills, held);
    if (arriving.length > 0) {
      this.log(
        `Installing ${arriving.length} skill(s) across ${result.selectedAgents.length} sub-agent(s)\n`,
      );
    }

    return {
      result: held.result,
      sourceResult,
      sourceFlags,
      installedAlready: new Set(held.installed.skillIds),
    };
  }

  private logWhatGoesWhere(held: HeldGlobal): void {
    for (const line of installPlanLines(held)) {
      this.log(line);
    }

    const { skillIds, agentNames } = held.keptAsInstalled;
    if (skillIds.length > 0 || agentNames.length > 0) {
      this.log(keptAsInstalledGlobally(skillIds, agentNames));
    }
    this.log("");
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

    this.error(sharedConfigExistingInstall(installation.configPath, id), {
      exit: EXIT_CODES.ERROR,
    });
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
  ): Promise<{ sourceResult: SourceLoadResult; startupMessages: StartupMessage[] }> {
    try {
      const loaded = await loadSource({
        // The one load that may choose a marketplace rather than read the stored one.
        caller: "init",
        ...(flags.marketplace !== undefined && { sourceFlag: flags.marketplace }),
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

  private async handleInstallation({
    result,
    sourceResult,
    sourceFlags,
    installedAlready,
  }: Selection): Promise<void> {
    const projectDir = process.cwd();
    const activeSkills = result.skills.filter((s) => !s.excluded);
    const toInstall = activeSkills.filter((s) => !installedAlready.has(s.id));
    const installMode = deriveInstallMode(toInstall);
    const ejectedSkills = toInstall.filter((s) => s.origin === EJECT_SOURCE);
    const pluginSkills = toInstall.filter((s) => s.origin !== EJECT_SOURCE);

    this.logInstallPlan(installMode, ejectedSkills, pluginSkills);

    // Before any copy, so a failed resolution cannot leave a half-install with no config.ts.
    const resolvedMarketplace =
      pluginSkills.length > 0
        ? await this.requireMarketplaceOrExit(
            sourceResult,
            "install plugin skills",
            hostAt(projectDir),
            (marketplace) => this.log(`Registering marketplace "${marketplace}"...`),
          )
        : null;

    const copyResult =
      ejectedSkills.length > 0
        ? await this.copyEjectSkillsStep(ejectedSkills, projectDir, sourceResult, installMode)
        : null;

    if (resolvedMarketplace !== null) {
      await this.installPluginSkillsReported(
        pluginSkills,
        resolvedMarketplace,
        projectDir,
        sourceResult.matrix,
      );
    }
    // The install reporter hard-errors on any failure, so reaching here means plugins succeeded.
    const pluginModeSucceeded = resolvedMarketplace !== null;

    try {
      const { configResult, compileResult, agentScopeMap } = await this.writeConfigAndCompile(
        result,
        sourceResult,
        sourceFlags,
      );
      this.reportSuccess(
        configResult,
        compileResult,
        agentScopeMap,
        installMode,
        pluginModeSucceeded,
        copyResult,
      );

      await this.showPermissionNotice(projectDir);
    } catch (error) {
      this.handleError(error);
    }
  }

  /** One frame, then unmount: the notice has no exit of its own and `--from` must run headless. */
  private async showPermissionNotice(projectDir: string): Promise<void> {
    const permissionWarning = await checkPermissions(projectDir);
    if (!permissionWarning) return;

    const { unmount } = render(permissionWarning);
    unmount();
  }

  private logInstallPlan(
    installMode: InstallMode,
    ejectedSkills: InstallSelection["skills"],
    pluginSkills: InstallSelection["skills"],
  ): void {
    this.log("\n");
    this.log(`Selected ${plural(ejectedSkills.length + pluginSkills.length, "skill")}`);
    this.log(
      `Install mode: ${
        installMode === "mixed"
          ? `${INSTALL_MODE_LABELS.mixed} (${ejectedSkills.length} eject, ${pluginSkills.length} plugin)`
          : INSTALL_MODE_DESCRIPTIONS[installMode]
      }`,
    );
  }

  private async copyEjectSkillsStep(
    localSkills: InstallSelection["skills"],
    projectDir: string,
    sourceResult: SourceLoadResult,
    installMode: InstallMode,
  ): Promise<SkillCopyResult> {
    this.log("Copying skills to local directory...");
    const copyResult = await copyLocalSkills(localSkills, projectDir, sourceResult);
    this.log(skillsCopiedLine(copyResult, installMode, projectDir));
    return copyResult;
  }

  private async writeConfigAndCompile(
    result: InstallSelection,
    sourceResult: SourceLoadResult,
    flags: SourceFlags,
  ): Promise<{
    configResult: Awaited<ReturnType<typeof writeProjectConfig>>;
    compileResult: CompilationResult;
    agentScopeMap: Map<AgentName, SkillScope>;
  }> {
    this.log("Generating configuration...");
    const configResult = await writeProjectConfig({
      selection: result,
      sourceResult,
      projectDir: process.cwd(),
      ...(flags.marketplace !== undefined && { sourceFlag: flags.marketplace }),
    });

    if (configResult.wasMerged) {
      this.log(`Merged with existing config at ${configResult.existingConfigPath}`);
    }

    this.log(`Configuration saved (${plural(configResult.config.agents.length, "agent")})\n`);
    this.reportUnassignedSkills(configResult.config, result.skills);

    this.log(STATUS_MESSAGES.COMPILING_AGENTS);
    const cwd = process.cwd();
    const agentDefs = await loadAgentDefs();
    const { allSkills } = await discoverInstalledSkills(cwd);
    const agentScopeMap = buildAgentScopeMap(configResult.config);
    const compile = compilesGlobalScope(cwd, configResult.propagation)
      ? compileAgentsAllScopes
      : compileProjectScope;
    const compileResult = await compile({
      projectDir: cwd,
      sourcePath: agentDefs.sourcePath,
      skills: allSkills,
      agentScopeMap,
    });
    this.reportCompilation(compileResult);
    await this.reportWhatThisHostCannotCarry(cwd);

    this.reportFanOut(configResult.propagation);

    return { configResult, compileResult, agentScopeMap };
  }

  private async reportWhatThisHostCannotCarry(cwd: string): Promise<void> {
    for (const notice of await hostCompileNotices(providerInUse(cwd), cwd)) {
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
    configResult: Awaited<ReturnType<typeof writeProjectConfig>>,
    compileResult: CompilationResult,
    agentScopeMap: Map<AgentName, SkillScope>,
    installMode: InstallMode,
    pluginModeSucceeded: boolean,
    copyResult: SkillCopyResult | null,
  ): void {
    // A run with work owed ends on the failure account instead of claiming success.
    if (!this.hasIncompleteWork) this.log(`${initSucceeded(this.brandingName)}\n`);

    const isEjectOutput =
      installMode === "eject" || (installMode === "mixed" && !pluginModeSucceeded);
    if (isEjectOutput && copyResult && copyResult.totalCopied > 0) {
      this.reportSkillsCopied(copyResult);
    }
    this.reportAgentsCompiled(compileResult.compiled, agentScopeMap);
    this.reportConfiguration(configResult.configPath, agentScopeMap);
  }

  /** Names the config(s) holding this install's assignments, split by agent scope. */
  private reportConfiguration(
    projectConfigPath: string,
    agentScopeMap: Map<AgentName, SkillScope>,
  ): void {
    const cwd = process.cwd();
    const paths = {
      global: resolveInstallPaths(cwd, "global").configPath,
      project: projectConfigPath,
    };
    const split = splitAgentScopes(cwd, agentScopeMap);

    this.log("Configuration:");
    for (const configPath of configsHoldingAssignments(split, paths)) {
      this.log(`  ${configPath}`);
    }
    this.log("");

    this.log("To customize agent-skill assignments:");
    for (const [index, step] of customizationSteps(split, paths.global, cwd).entries()) {
      this.log(`  ${index + 1}. ${step}`);
    }
    this.log("");
  }

  /** One block per scope that received skills; entries are on-disk directory names (ids). */
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

  /** Mirrors `compileAgentsAllScopes`' scope split; each scope's host picks its file extension. */
  private reportAgentsCompiled(
    compiled: AgentName[],
    agentScopeMap: Map<AgentName, SkillScope>,
  ): void {
    const cwd = process.cwd();
    const groups = isHomeDirectory(cwd)
      ? [{ ...compiledInto(cwd, "project"), agents: compiled }]
      : [
          {
            ...compiledInto(cwd, "global"),
            agents: compiled.filter((name) => agentScopeMap.get(name) === "global"),
          },
          {
            ...compiledInto(cwd, "project"),
            agents: compiled.filter((name) => agentScopeMap.get(name) !== "global"),
          },
        ].filter((group) => group.agents.length > 0);

    for (const group of groups) {
      this.log("Agents compiled to:");
      this.log(`  ${group.dir}`);
      for (const agentName of group.agents) {
        this.log(`    ${agentName}${group.extension}`);
      }
      this.log("");
    }
  }
}

/** `--ui`, or `--marketplace` without `--from`: the editor is where a marketplace is added. */
function opensTheEditor(
  flags: Pick<Interfaces.InferredFlags<typeof Init.flags>, "ui" | "from" | "marketplace">,
): boolean {
  return flags.ui || (flags.from === undefined && flags.marketplace !== undefined);
}

/** A sub-agent is installable without skills, so only a selection with neither is empty. */
function selectsNothing(result: InstallSelection): boolean {
  return result.skills.length === 0 && result.selectedAgents.length === 0;
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

/** Per scope, because the project and global installs can be on different hosts. */
function compiledInto(cwd: string, scope: SkillScope): { dir: string; extension: string } {
  return {
    dir: resolveInstallPaths(cwd, scope).agentsDir,
    extension: agentCodec(providerInUse(installBaseDir(cwd, scope))).extension,
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

/** The project `stack` holds only project-scoped agents, so a global-only install skips it. */
function configsHoldingAssignments(split: AgentScopeSplit, paths: ConfigPaths): string[] {
  if (split.isGlobalOnly) return [paths.global];
  if (split.globalAgentCount > 0) return [paths.global, paths.project];
  return [paths.project];
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
  /** `branding.name`, or {@link DEFAULT_BRANDING.NAME}; both dashboard branches read it. */
  name: string;
  skillCount: number;
  agentCount: number;
  mode: InstallMode;
  source?: string;
};

/** Both counts come from one scope-aware installation, so project and global never mix. */
export async function getDashboardData(projectDir: string): Promise<DashboardData> {
  // ABORT: an unloadable config throws here, as `loadProjectConfig` beside it already would.
  const [info, loaded, branding] = await Promise.all([
    getInstallationInfo(),
    loadProjectConfig(projectDir),
    resolveBranding(projectDir),
  ]);

  const activeSkills = loaded?.config.skills.filter((s) => !s.excluded);
  const skillCount = info?.skillCount ?? 0;
  const agentCount = info?.agentCount ?? 0;
  const mode = info?.mode ?? (activeSkills ? deriveInstallMode(activeSkills) : "eject");
  const source = loaded?.config.marketplace;

  return {
    name: branding.name,
    skillCount,
    agentCount,
    mode,
    ...(source !== undefined && { source }),
  };
}
