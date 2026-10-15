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

/** The options as the piped dashboard prints them, one bracketed label each. */
const DASHBOARD_OPTIONS_LINE = `  ${DASHBOARD_OPTIONS.map(({ label }) => `[${label}]`).join("  ")}`;

/** The commands offered by the project dashboard (single source: DASHBOARD_OPTIONS). */
export type DashboardCommand = (typeof DASHBOARD_OPTIONS)[number]["value"];

/**
 * The dashboard's title: {@link ASCII_LOGO} for an installation resting on the shipped branding,
 * and the configured name in its place for one that white-labels it.
 *
 * **The logo gives way rather than sitting above the name, because it spells the shipped name.**
 * `branding.name` replaces a heading everywhere else it is read — every configured leg of
 * `commands/branding-name-reaches-headings` asserts {@link DEFAULT_BRANDING.NAME} is ABSENT — so
 * painting `AGENTS INC` in block capitals above `Northwind` would leave the vendor's name at the
 * most prominent surface the product has, which is the one thing white-labelling is for.
 *
 * The default path is untouched by construction: {@link resolveBranding} answers
 * {@link DEFAULT_BRANDING.NAME} for a configuration with no `branding` key, so an unbranded
 * install takes the logo arm. A configuration naming the shipped name explicitly takes it too —
 * it asked for the shipped name and gets the shipped presentation of it.
 */
const DashboardTitle: React.FC<{ name: string }> = ({ name }) =>
  name === DEFAULT_BRANDING.NAME ? <Text>{ASCII_LOGO}</Text> : <Text bold>{name}</Text>;

type DashboardProps = {
  /** Everything the screen paints, exactly as {@link formatDashboardText} is handed it. */
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
 * What this installation is, as the lines both dashboards paint between the title and the menu.
 *
 * **Shared because the two paths had diverged, not for reuse.** `showDashboard` branches on
 * `process.stdin.isTTY`, and only the text branch drew these — so the screen a person sits in
 * front of was less informative than the output they get by piping it, and no assertion could see
 * it, because each path was only ever compared against itself. One producer is what makes the two
 * unable to drift apart again.
 */
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

/** Formats the dashboard summary as plain text lines (for non-interactive/test output). */
export function formatDashboardText(data: DashboardData): string {
  return [data.name, "", ...dashboardCountLines(data), "", DASHBOARD_OPTIONS_LINE].join("\n");
}

/**
 * What {@link showDashboard} answers when Ctrl+C ended it: a cancellation, as Ctrl+C is at every
 * other prompt — where Escape, which answers null, only steps back out of the dashboard.
 */
const DASHBOARD_INTERRUPTED = "interrupted";

/** How the dashboard was left: a command chosen, Escape (null), or Ctrl+C. */
type DashboardAnswer = DashboardCommand | typeof DASHBOARD_INTERRUPTED | null;

/**
 * Shows the project dashboard and returns the selected command, null when it was left with Escape,
 * or {@link DASHBOARD_INTERRUPTED} when Ctrl+C ended it.
 * In non-interactive environments (no TTY), prints the summary text and returns null.
 */
export async function showDashboard(
  projectDir: string,
  log?: (message: string) => void,
): Promise<DashboardAnswer> {
  const data = await getDashboardData(projectDir);

  // Non-interactive: print text summary and exit (CI, piped, tests)
  if (!process.stdin.isTTY) {
    const output = log ?? console.log;
    output(formatDashboardText(data));
    return null;
  }

  // First-wins resolution via promptValue; clearOnResolve repaints a clean
  // terminal before unmount (dashboard occupies the full height).
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

/** The argv a dashboard selection runs its command with: Edit opens the editor. */
function dashboardCommandArgv(command: DashboardCommand): string[] {
  return command === "edit" ? ["--ui"] : [];
}

/**
 * What a run offered the dashboard came to: no installation to show it for, shown and left or
 * acted on, or cancelled with Ctrl+C — which the caller ends the run on as cancelled.
 */
export type DashboardFlow = "not-installed" | "shown" | "cancelled";

/**
 * Shared dashboard entry: when the project is already initialized, shows the
 * dashboard and runs the chosen command. Never exits the process — callers decide
 * from the {@link DashboardFlow} it answers (the init hook exits SUCCESS at its own
 * call site for a dashboard shown).
 *
 * A project with no installation of its own is shown the global installation's dashboard, so its
 * Edit opens the global installation in the editor.
 */
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

/**
 * The marketplace this run was pointed at, as oclif hands it over.
 *
 * `marketplace` is a required key holding `string | undefined` rather than
 * `marketplace?: string` because that is what oclif produces: a non-required flag still gets
 * its key written on the parse result, set to `undefined` when it was not passed. Under
 * `exactOptionalPropertyTypes` the two are different types, and `?` would be describing a
 * producer that never omits the key.
 */
type SourceFlags = { marketplace: string | undefined };

/** What `init --from` decided to install, as the install sequence takes it. */
type Selection = {
  result: InstallSelection;
  sourceResult: SourceLoadResult;
  /**
   * The marketplace this selection was actually loaded from, which the shared spine records in
   * the written config. Carried on the value because a shared id may name one the command line
   * did not, and the install has to record where its skills really came from either way.
   */
  sourceFlags: SourceFlags;
  /**
   * Skills in the selection that are already installed where it puts them — a global install's
   * own, which a run from a project records as they are and never installs over.
   */
  installedAlready: ReadonlySet<SkillId>;
};

/**
 * Which marketplace a shared configuration installs from.
 *
 * A payload names the one its skills were fetched from, because a skill id carries whose skill it
 * is and never where that repository lives — so without the ref the load walks on to the default
 * public catalogue and installs a different repository's skill under the same id.
 *
 * `--marketplace` still outranks it: naming one is an instruction about THIS install, while the
 * payload's ref is a record of where the sharer's came from. A payload that names none leaves the
 * flag undefined, which puts the load back on the rungs it has always walked.
 */
function sharedConfigSourceFlags(flags: SourceFlags, payload: SeedPayload): SourceFlags {
  return { marketplace: flags.marketplace ?? payload.marketplace };
}

export default class Init extends BaseCommand {
  /**
   * The name this run prints itself under, resolved once on {@link install}'s spine because the
   * closing line is printed several calls below it. Same shape and same reason as `uninstall`'s
   * field: a plain `string` holding the shipped default rather than an optional every reader
   * would have to answer for.
   */
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

  /**
   * The command in two statements: do the work, then answer for it.
   *
   * {@link install} owns every path through the setup and returns however it likes; the exit
   * code is decided once, here, after the last of them. Deciding it inside would mean deciding
   * it at each of that method's endings, and an ending added later would inherit the exit-0
   * default silently — which is the defect this pair exists to close. `edit` is two statements
   * for the same reason.
   */
  async run(): Promise<void> {
    await this.install();
    this.exitIfWorkIncomplete();
  }

  /**
   * The editor, opened on whatever `--from` named — or on nothing when it named nothing.
   *
   * **One rule, both commands (owner ruling 2026-08-24): `--ui` opens the command's SUBJECT, and
   * `--from` is what supplies one.** `edit --ui` alone opens this installation because that is
   * `edit`'s subject; `init --ui` alone opens the catalogue because a fresh directory has none.
   * Given an id, either opens that id — which is what makes a shared configuration something a
   * recipient can look at rather than only apply blind.
   *
   * No publish happens here and none is needed. `edit --ui` mints an id because an installation
   * is not a configuration the store holds yet; an id already IS one, so this is
   * `editorConfigUrl` and nothing else — no network, no marketplace, no catalogue load.
   *
   * The link is PRINTED first and opened second. Over a pipe, in CI, and on a machine with no
   * desktop session there is no browser to be anybody's — a link nobody can copy is the whole
   * loss, so opening one is the convenience on top and a failure to open is a warning beside a
   * link that still works.
   *
   * A marketplace named here cannot ride along: the address carries an id and nothing else, so
   * the line under the link says how to add it in the editor.
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

  /**
   * Every route `init` has, in the order they are tried: the editor for `--ui` and for a
   * marketplace named without `--from`; for a bare run, the installation's dashboard — or the
   * editor where nothing is installed; and the install of the configuration `--from` names.
   */
  private async install(): Promise<void> {
    const { flags } = await this.parse(Init);
    const projectDir = process.cwd();

    // Above everything, including `--ui`: `--provider` names which installation this run creates,
    // and a run that creates none has nothing for it to name. Refusing here is what leaves the
    // filesystem untouched at both scopes — an installation half-created by a run that then
    // refused is the state every later command has to guess about.
    this.settleTheProviderForThisRun(flags);

    // Above `ensureConfigReadable`, and above every read below it, because this route needs no
    // installation at all. A config too broken to load must not stop someone reaching the other
    // front door, and an id somebody shared is not this directory's business either.
    if (opensTheEditor(flags)) return this.openEditor(projectDir, flags.from, flags.marketplace);

    // Every route below reads the configs first — to show a dashboard, to refuse a shared id, or
    // to inline the global one. One that exists but cannot be read is recreated, not installed
    // over, and saying so here is what keeps the raw loader error off the screen.
    await this.ensureConfigReadable(projectDir);

    // Only a bare `init` is diverted to the dashboard. An id is an explicit instruction to install
    // *that* configuration, so it overrides an existing installation instead.
    if (flags.from === undefined) return this.showDashboardOrOpenEditor(projectDir);

    // Read once on the spine, because the closing line is printed several calls below it. The
    // degrade arm of `resolveBrandingName` cannot fire here: `ensureConfigReadable` has already
    // refused every config this would read.
    this.brandingName = await this.resolveBrandingName(projectDir);

    const selection = await this.selectionFromSharedConfig(flags.from, flags, projectDir);
    if (!selection) this.exit(EXIT_CODES.CANCELLED);

    // A broken constraint is this catalog's verdict on what survived the decode.
    this.reportValidationErrors(selection.result.validation);

    await this.handleInstallation(selection);
  }

  /** A bare `init`: the installation's dashboard, or the editor where nothing is installed. */
  private async showDashboardOrOpenEditor(projectDir: string): Promise<void> {
    const dashboard = await runDashboardFlow(projectDir, this.config, (msg) => this.log(msg));
    if (dashboard === "cancelled") this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });
    if (dashboard === "not-installed") await this.openEditor(projectDir);
  }

  /** The editor's marketplace line, or the refusal the install route gives a ref it cannot read. */
  private addMarketplaceLineOrFail(ref: string): string {
    try {
      return addMarketplaceInTheEditor(ref, isLocalSource(ref));
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Commits this run to the provider `--provider` named, or refuses a flag with nothing to name.
   *
   * **`--provider` is a LOCATION parameter, not a feature switch**, and the control that proves it
   * is `--provider claude`: naming the default out loud installs byte-for-byte what no flag
   * installs, because all the flag decides is which folder this run creates. Without that half
   * "the flag selects an installation" would be indistinguishable from "the flag means Codex".
   *
   * **And it is meaningless without `--from` (D15).** The provider is chosen in the web app, so
   * the only run that can be told one is the run that installs what the app produced. It also
   * gives the placement refusal something to refuse BEFORE anything is written: with `--from`
   * required, a provider always arrives beside a payload the pre-flight can read.
   */
  private settleTheProviderForThisRun(flags: Interfaces.InferredFlags<typeof Init.flags>): void {
    const named = providerNamedBy(flags.provider);
    if (named === undefined) return;

    if (flags.from === undefined) {
      this.error(providerNeedsAConfigurationToInstall(), { exit: EXIT_CODES.INVALID_ARGS });
    }

    chooseProviderForThisRun(named);
  }

  /**
   * The `--from <id>` producer: fetch and map — and, at a terminal, one question.
   *
   * It installs into a clean directory, which is what the first refusal is: a shared
   * configuration is installed whole, so a directory already holding one has it applied with
   * `edit --from` instead, or is uninstalled first. The second is about the LOCATION rather than what is already in it — a global
   * installation holds only global-scoped content. Both fire before anything is written.
   *
   * A global installation ABOVE a project is not in the way. It is not this project's, so the run
   * adds to it what it lacks and states every entry it already holds as installed (see
   * `holdInstalledGlobal`).
   *
   * Before writing anything the run lists what goes into the project and what into the global
   * install. At a terminal it then asks, and a no writes nothing. With no terminal — a CI job or a
   * script — it prints the same lists and carries on: running headless is most of why the flag
   * exists.
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
    // Before the decode, because a skill the payload CARRIES answers to no catalogue: unseated,
    // its id is skipped like any other unknown one and its content is never read.
    const carriedSkills = this.registerExternalSkillsOrFail(
      fetched.payload,
      sourceResult.matrix,
      projectDir,
    );
    const { result, skippedSkillIds, skippedAgentNames } = this.decodeSeedOrFail(
      fetched.payload,
      sourceResult.matrix,
    );

    // The location refusal is `BaseCommand`'s, because `edit --from` reaches the same
    // contradiction through the other door and an invariant enforced on one producer is enforced
    // nowhere.
    this.refuseProjectScopedContentAtHome(result, projectDir);

    const held = holdInstalledGlobal(
      result,
      isHomeDirectory(projectDir) ? null : await readInstalledGlobal(projectDir),
    );
    const arrivingCarried = notInstalledGlobally(carriedSkills, held);

    // The last refusals, and still above the lists and the question: a yes installs what was
    // listed, so nothing listed may then be refused.
    await this.refuseSharedConfigBeforeAsking(
      held.result,
      arrivingCarried,
      projectDir,
      sourceResult,
    );

    // What the load held back, directly above the skips it may explain — a skill this catalogue
    // "does not know" is often one it ships with a file that will not parse.
    sayCapturedWarnings(startupMessages);

    // Named, not counted. "3 skills were skipped" cannot be acted on; the ids can, and this is the
    // one moment the user can tell whether what they shared is what they are getting. Worded once,
    // in `messages.ts`, because `edit --from` reports the same skips about the same wire.
    if (skippedSkillIds.length > 0) this.warn(skippedUnknownSkills(skippedSkillIds));
    if (skippedAgentNames.length > 0) this.warn(skippedUnknownAgents(skippedAgentNames));

    // Below the skips, which are its explanation, and above the lists: a configuration this
    // catalogue can place nothing of has nothing to list, and nothing to ask about.
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

    // After the question and before the install: every refusal this producer makes, and a no,
    // leave nothing written, and the copy step that follows finds these skills already where they
    // belong.
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

  /**
   * The two lists — what goes into this project, and what into the global install — then the
   * global skills skipped as already installed, and the global entries the configuration states
   * otherwise than they are installed, which stay.
   */
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

  /** The question under the lists, defaulting to no: nothing has been written yet. */
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

  /**
   * Refuses to install a shared configuration into a directory that already has one.
   *
   * Project-scoped detection rather than `detectInstallation`, whose global fallback would refuse
   * every clean project on a machine with a global install. A global install above the project is
   * added to rather than refused over — see {@link selectionFromSharedConfig}.
   *
   * This runs before the fetch: there is nothing to learn from the network about a directory that
   * is already spoken for.
   */
  private async refuseInstalledProject(projectDir: string, id: string): Promise<void> {
    const installation = await detectProjectInstallation(projectDir);
    if (!installation) return;

    this.error(sharedConfigExistingInstall(installation.configPath, id), {
      exit: EXIT_CODES.ERROR,
    });
  }

  /**
   * The decode refuses a payload the config model has nowhere to write (see
   * `seedToInstallSelection`). That is a failure of this command, reported with this command's exit
   * code rather than left to surface as an unhandled throw.
   */
  private decodeSeedOrFail(payload: SeedPayload, matrix: MergedSkillsMatrix): SeedMapping {
    try {
      return seedToInstallSelection(payload, matrix);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Seats the catalogue entries the payload carries with it, or refuses the run.
   *
   * The refusals are `registerExternalSkills`' own — a carried skill asked for as a plugin, which
   * no marketplace serves, and a carried skill claiming an id the loaded catalogue already owns,
   * whose bytes would be written over that catalogue's own copy — and are reported with this
   * command's exit code for the same reason the decode's is.
   */
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

  /** Writes the skills the payload brought with it, and says which they were. */
  private async writeCarriedSkills(carried: ExternalSkillInstall[]): Promise<void> {
    if (carried.length === 0) return;

    await writeExternalSkills(carried);
    // Named rather than counted, like the skips: these are the entries no catalogue can explain,
    // so this line is the only place the user learns what arrived with the configuration itself.
    this.log(carriedSkillsWritten(carried.map((skill) => skill.id)));
  }

  private async loadSourceOrFail(
    flags: SourceFlags,
  ): Promise<{ sourceResult: SourceLoadResult; startupMessages: StartupMessage[] }> {
    try {
      const loaded = await loadSource({
        // The one load that may CHOOSE a marketplace rather than read the stored one.
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

    // Resolve marketplace up front — BEFORE any filesystem mutation. If
    // resolution fails in mixed mode, the hard-error must fire before
    // `copyEjectSkillsStep` copies anything to `.claude/skills/`, otherwise
    // we leave an orphaned half-install with no config.ts to recognise it.
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
    // The shared install reporter hard-errors on any failure, so reaching here with
    // a resolved marketplace means plugin mode fully succeeded.
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

  /**
   * The permission notice, where there is one to show. It is an Ink app with no exit of its own,
   * so one frame is rendered and let go: the notice is information, not a prompt, and `--from`
   * has to complete over a pipe and in CI.
   */
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

  /**
   * Copies the ejected skills and says how many landed at each scope, in the words
   * {@link skillsCopiedLine} chooses.
   */
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

  /**
   * What this host could not carry, after the compile summary and once per run.
   *
   * `init --from` is the door a configuration somebody ELSE wrote arrives through, so it is
   * precisely the run that must not be silent about the parts of it that did not survive the
   * translation. `compile` prints the same lines in the same order — see
   * {@link hostCompileNotices}, which is the one place either of them gets them from.
   *
   * A Claude install expresses every setting and carries every sub-agent, so it gets one line at
   * most: the trust dialog, while its project sub-agents' completion gate cannot run in this
   * folder.
   */
  private async reportWhatThisHostCannotCarry(cwd: string): Promise<void> {
    for (const notice of await hostCompileNotices(providerInUse(cwd), cwd)) {
      this.log(notice);
    }
  }

  /**
   * What the compile pass did, including the half this command used to drop.
   *
   * It read `compiled` and nothing else, so a pass that lost a sub-agent printed a number that
   * looked perfectly right — `compiled` counts successes, so it is correct either way — and the
   * failures reached no surface at all: no count, no reason, no exit code. A user's FIRST
   * install could silently land a roster missing a sub-agent.
   *
   * The compile is the last thing `init` does, so a failure here cannot be answered by aborting:
   * the skills are on disk and `config.ts` and `config-types.ts` describe them. What is owed is
   * the account, which {@link BaseCommand.exitIfWorkIncomplete} prints and answers for.
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
    // Recorded off `failed` rather than off the warnings just printed: `warnings` also carries
    // entries that are not failures, and the ending must not file those as work owed.
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
    // A run with work owed ends on the failure account instead — `initialized successfully!`
    // over a roster missing a sub-agent is the claim being withdrawn, not a line beside it.
    // Where the install landed is still reported below: that is what the account is about.
    if (!this.hasIncompleteWork) this.log(`${initSucceeded(this.brandingName)}\n`);

    const isEjectOutput =
      installMode === "eject" || (installMode === "mixed" && !pluginModeSucceeded);
    if (isEjectOutput && copyResult && copyResult.totalCopied > 0) {
      this.reportSkillsCopied(copyResult);
    }
    this.reportAgentsCompiled(compileResult.compiled, agentScopeMap);
    this.reportConfiguration(configResult.configPath, agentScopeMap);
  }

  /**
   * Names the config that actually holds this install's assignments, and where a
   * recompile of them has to be run from.
   *
   * Split by the same `agentScopeMap` the two reporters above split on, because the
   * same scope decides both. A project config's `stack` is filtered down to
   * project-scoped agents on the way out, so a wholly GLOBAL install leaves it
   * carrying no assignment at all — naming it sends the user to a file with nothing
   * in it — and `compile` in this cwd runs the PROJECT pass, which recompiles no
   * global agent. At the home root both scopes resolve to one file and one pass, so
   * there is nothing to split and the project wording stands.
   */
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
   *
   * **The EXTENSION is the host's, per scope, and was Claude's literal `.md` until C5.** This
   * block describes the filesystem, so every line under a path header has to be a name a user can
   * copy out and open — and a Codex install printed `web-developer.md` above a directory holding
   * `web-developer.toml`. The two scopes are read separately because they can be on two hosts.
   */
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

/**
 * Whether a run takes the editor route whatever is installed: `--ui`, or a marketplace named
 * without `--from` — that flag acts only beside an install, and the editor is where one is added
 * otherwise.
 */
function opensTheEditor(
  flags: Pick<Interfaces.InferredFlags<typeof Init.flags>, "ui" | "from" | "marketplace">,
): boolean {
  return flags.ui || (flags.from === undefined && flags.marketplace !== undefined);
}

/**
 * Whether a selection holds nothing to install. A sub-agent is installable on its own — it has
 * front-matter, a prompt and a compiled file without owning a single skill — so only a selection
 * with neither is empty.
 */
function selectsNothing(result: InstallSelection): boolean {
  return result.skills.length === 0 && result.selectedAgents.length === 0;
}

/**
 * Whether this run's compile covers the global install as well as the project — `edit`'s rule
 * (`compilesGlobalScope` in `commands/edit.tsx`), for the same reason.
 *
 * From a project, the global install is held as installed, so its sub-agents are recompiled only
 * when the write added something they are built from. Recompiled anyway, they would be built from
 * the catalogue THIS run loaded rather than the one the global install was made from — a skill
 * that catalogue does not ship is described by its fallback guidance instead of its own — and a
 * project run that added nothing to the global install would still have rewritten it.
 */
function compilesGlobalScope(cwd: string, written: GateReport): boolean {
  return isHomeDirectory(cwd) || movedGlobalAgentInputs(written);
}

/**
 * The line an eject copy ends on: how many skills landed, and where.
 *
 * A copy that landed at one scope names the directory `copyLocalSkills` wrote it into, read the
 * way that function reads it — `resolveInstallPaths` at the scope — so it is the folder the
 * `Skills copied to:` block beneath names too. The line spelled the directory from the scope ROOT
 * until 2026-10-03, so a run from a project that copied every skill under HOME printed
 * `.claude/skills/`, which, read where the command was typed, names the project's own empty
 * folder. A copy that landed at both scopes names no directory, because two scopes have two and
 * the block beneath lists each.
 *
 * In a mixed install the copies are its "local" half, beside the plugins installed after them.
 */
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

/**
 * Where one scope's sub-agents landed, and the extension the host that reads them writes.
 *
 * One read per scope, exactly as `resolveInstallPaths` reads one beside it: a project on Codex
 * under a global on Claude puts `.toml` in one block and `.md` in the other, and one answer for
 * both is how a path block names a file that is not there.
 */
function compiledInto(cwd: string, scope: SkillScope): { dir: string; extension: string } {
  return {
    dir: resolveInstallPaths(cwd, scope).agentsDir,
    extension: agentCodec(providerInUse(installBaseDir(cwd, scope))).extension,
  };
}

/** The two config files an install can write, as the closing block refers to them. */
type ConfigPaths = { global: string; project: string };

/** How this install's sub-agents fall across the two scopes, seen from the directory it ran in. */
type AgentScopeSplit = { globalAgentCount: number; isGlobalOnly: boolean };

/**
 * At the home root the two scopes resolve to ONE config file and ONE compile pass, so there
 * is nothing to split and the split reports none — which is what leaves the project wording
 * standing there unchanged. Same fork `reportAgentsCompiled` makes over the same question.
 */
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
 * The config file(s) this install's assignments actually landed in. A wholly global install
 * has none in the project file — the writer filters its `stack` down to project-scoped
 * agents — so naming it would send the user to a file with nothing in it.
 */
function configsHoldingAssignments(split: AgentScopeSplit, paths: ConfigPaths): string[] {
  if (split.isGlobalOnly) return [paths.global];
  if (split.globalAgentCount > 0) return [paths.global, paths.project];
  return [paths.project];
}

/**
 * What changing an assignment takes, in the order it takes it. The compile step is the half
 * that has to be scope-aware: `compile` run in a project directory performs the PROJECT pass
 * only, so it recompiles no global agent — which `globalScopedAgentsHint` already says, in
 * the words `compile` itself says it in when it lands in the mirror image of this state.
 */
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
  /**
   * The name the dashboard is titled with — `branding.name` where the configuration supplies one
   * and {@link DEFAULT_BRANDING.NAME} otherwise. Carried on the data rather than read by either
   * consumer so {@link formatDashboardText} stays a pure function of what it is handed, and so
   * the one place that reaches a configuration is the one that already loads it.
   *
   * **Both of {@link showDashboard}'s branches read it, and that is the invariant to keep.** This
   * field was resolved for the piped branch alone for as long as it was, while the `Dashboard`
   * component was handed only its callbacks and painted {@link ASCII_LOGO} — so the dashboard a
   * person actually sees was the one surface `branding.name` never reached, and every spec on the
   * subject drove through a pipe and could not see it.
   */
  name: string;
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
  // ABORT is the posture on `resolveBranding`, and it is the one already in force: the
  // `loadProjectConfig` beside it raises for the same file, so a configuration that cannot be
  // evaluated fails this call whether branding is read or not. Nothing is degraded here that was
  // not already, and the dashboard is only reached once an installation has been detected.
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
